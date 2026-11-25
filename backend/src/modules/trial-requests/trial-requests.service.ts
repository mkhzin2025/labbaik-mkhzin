import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from '../events/events.gateway';
import { TRIAL_REQUEST_STATUSES, TrialRequest, TrialRequestStatus } from './trial-request.entity';

/** The platform owner (شركة مخازن) sees the website's requests; override with TRIAL_REQUESTS_ORG_IDS. */
const DEFAULT_OWNER_ORG_IDS = '035622f8-9605-4f7c-a04b-aa69c9aa3948';
/** Requests one address may send per window, so the public form cannot be flooded. */
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;
const PAGE_SIZE = 50;

export interface TrialRequestInput { name?: unknown; phone?: unknown; company?: unknown; message?: unknown; website?: unknown }

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

@Injectable()
export class TrialRequestsService {
  private readonly recent = new Map<string, number[]>();

  constructor(
    @InjectRepository(TrialRequest) private readonly requests: Repository<TrialRequest>,
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  private get ownerOrgIds() {
    return (this.config.get<string>('TRIAL_REQUESTS_ORG_IDS') || DEFAULT_OWNER_ORG_IDS).split(',').map((id) => id.trim()).filter(Boolean);
  }

  isOwner(organizationId?: string | null) {
    return Boolean(organizationId && this.ownerOrgIds.includes(organizationId));
  }

  assertOwner(organizationId?: string | null) {
    if (!this.isOwner(organizationId)) throw new ForbiddenException('غير متاح لهذه المنظمة');
  }

  /** Saudi mobile numbers in any common form (05…, 5…, 9665…, +9665…) become 9665XXXXXXXX; others keep their digits. */
  static normalizePhone(raw: string) {
    const digits = raw.replace(/[^\d]/g, '').replace(/^00/, '');
    if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
    if (/^5\d{8}$/.test(digits)) return `966${digits}`;
    return digits;
  }

  static validate(input: TrialRequestInput) {
    const name = text(input.name, 120);
    const company = text(input.company, 160);
    const phone = TrialRequestsService.normalizePhone(text(input.phone, 30));
    const message = text(input.message, 500) || null;
    if (name.length < 2) throw new BadRequestException('الاسم مطلوب');
    if (company.length < 2) throw new BadRequestException('اسم المنشأة مطلوب');
    if (!/^\d{9,15}$/.test(phone)) throw new BadRequestException('رقم الجوال غير صحيح');
    return { name, company, phone, message };
  }

  private allow(ip: string, now = Date.now()) {
    const hits = (this.recent.get(ip) || []).filter((at) => now - at < WINDOW_MS);
    if (hits.length >= MAX_PER_WINDOW) return false;
    hits.push(now);
    this.recent.set(ip, hits);
    if (this.recent.size > 10_000) this.recent.clear(); // never grows without bound
    return true;
  }

  async create(input: TrialRequestInput, ip: string | null) {
    // Bots fill every field; people never see this one.
    if (text(input.website, 200)) return { ok: true };
    const data = TrialRequestsService.validate(input);
    if (ip && !this.allow(ip)) throw new HttpException('أرسلت عدة طلبات، حاول بعد قليل', HttpStatus.TOO_MANY_REQUESTS);
    const saved = await this.requests.save(this.requests.create({ ...data, ip, status: 'new' }));
    for (const orgId of this.ownerOrgIds) this.events.server?.to(`organization_${orgId}`).emit('trial_request', { id: saved.id });
    return { ok: true };
  }

  async list(status: string | undefined, page: number) {
    const where = TRIAL_REQUEST_STATUSES.includes(status as TrialRequestStatus) ? { status: status as TrialRequestStatus } : {};
    const [items, total] = await this.requests.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: ['id', 'name', 'phone', 'company', 'message', 'status', 'createdAt'],
    });
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  newCount() {
    return this.requests.count({ where: { status: 'new' } });
  }

  async setStatus(id: string, status: unknown) {
    if (!TRIAL_REQUEST_STATUSES.includes(status as TrialRequestStatus)) throw new BadRequestException('حالة غير صحيحة');
    const result = await this.requests.update({ id }, { status: status as TrialRequestStatus });
    if (!result.affected) throw new NotFoundException('الطلب غير موجود');
    return { id, status };
  }
}
