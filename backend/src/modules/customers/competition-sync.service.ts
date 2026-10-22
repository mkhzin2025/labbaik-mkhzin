import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { normalizePhoneNumber } from '../../common/utils/phone.util';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';
import { CompetitionSyncState, CompetitionSyncStats } from './entities/competition-sync-state.entity';
import {
  branchKey,
  COMPETITION_CATEGORY,
  COMPETITION_ONLINE_CATEGORY,
  CompetitionParticipant,
  emptyStats,
  planCompetitionPage,
  PlannedCustomer,
} from './competition-sync.plan';

type ParticipantsPage = {
  items: CompetitionParticipant[];
  pagination: { page: number; total: number; totalPages: number };
};

const DEFAULT_API_URL = 'https://competition.mkhzin.com/api/integrations/participants';
const PARALLEL_PAGES = 4;
const FETCH_ATTEMPTS = 4;

/**
 * Pulls the competition participants into their branches. Runs in the background; pages are read oldest
 * first, so an incremental run resumes from the last processed page and only reads new registrations.
 */
@Injectable()
export class CompetitionSyncService {
  private readonly logger = new Logger(CompetitionSyncService.name);
  private readonly running = new Set<string>();

  constructor(
    @InjectRepository(CompetitionSyncState)
    private readonly stateRepository: Repository<CompetitionSyncState>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly customersService: CustomersService,
    private readonly configService: ConfigService,
  ) {}

  private get apiKey() {
    return this.configService.get<string>('COMPETITION_API_KEY')?.trim() || '';
  }

  async getState(organizationId: string) {
    const state = await this.stateRepository.findOne({ where: { organizationId } });
    return {
      configured: !!this.apiKey,
      running: this.running.has(organizationId),
      status: state?.status === 'running' && !this.running.has(organizationId) ? 'failed' : state?.status || 'idle',
      lastPage: state?.lastPage || 0,
      totalPages: state?.totalPages || 0,
      totalParticipants: state?.totalParticipants || 0,
      stats: state?.stats || null,
      lastError: state?.status === 'running' && !this.running.has(organizationId)
        ? 'توقفت المزامنة قبل اكتمالها (إعادة تشغيل الخادم). ستكمل من حيث توقفت.'
        : state?.lastError || null,
      startedAt: state?.startedAt || null,
      finishedAt: state?.finishedAt || null,
      lastCompletedAt: state?.lastCompletedAt || null,
    };
  }

  /** Starts a sync in the background; a second call while one is running just returns its state. */
  async start(organizationId: string, full: boolean) {
    if (!this.apiKey) throw new BadRequestException('مزامنة المسابقة غير مفعلة: أضف COMPETITION_API_KEY في إعدادات الخادم.');
    if (!this.running.has(organizationId)) {
      this.running.add(organizationId);
      void this.run(organizationId, full)
        .catch(async (error: Error) => {
          this.logger.error(`Competition sync failed for ${organizationId}: ${error.message}`);
          await this.stateRepository.update({ organizationId }, { status: 'failed', lastError: error.message, finishedAt: new Date() });
        })
        .finally(() => this.running.delete(organizationId));
    }
    return this.getState(organizationId);
  }

  private async run(organizationId: string, full: boolean) {
    const previous = await this.stateRepository.findOne({ where: { organizationId } });
    const stores: { id: string; name: string }[] = await this.customerRepository.query(
      'SELECT id, name FROM stores WHERE "organizationId" = $1', [organizationId]);
    const storeIdByBranch = new Map(stores.map((store) => [branchKey(store.name), store.id]));
    const directCategoryId = await this.ensureCategory(organizationId, COMPETITION_CATEGORY, '#7c3aed');
    const onlineCategoryId = await this.ensureCategory(organizationId, COMPETITION_ONLINE_CATEGORY, '#0891b2');

    const first = await this.fetchPage(1);
    const totalPages = Math.max(1, first.pagination.totalPages);
    // Re-read the last processed page: it was probably partial, and registrations are append-only in this order.
    const fromPage = full || !previous?.lastPage ? 1 : Math.min(Math.max(1, previous.lastPage - 1), totalPages);
    const stats = emptyStats(fromPage, totalPages);
    await this.stateRepository.save({
      organizationId, status: 'running', lastPage: full ? 0 : previous?.lastPage || 0, totalPages,
      totalParticipants: first.pagination.total, stats, lastError: null, startedAt: new Date(), finishedAt: null,
    });

    const pending = new Map<number, Promise<ParticipantsPage>>([[1, Promise.resolve(first)]]);
    const prefetch = (page: number) => {
      if (page > totalPages || pending.has(page)) return;
      const request = this.fetchPage(page);
      request.catch(() => undefined); // awaited below; avoids an unhandled rejection while it waits its turn
      pending.set(page, request);
    };
    for (let page = fromPage; page <= totalPages; page += 1) {
      for (let ahead = page; ahead < page + PARALLEL_PAGES; ahead += 1) prefetch(ahead);
      const data = await pending.get(page)!;
      pending.delete(page);
      await this.applyPage(data.items, storeIdByBranch, directCategoryId, onlineCategoryId, stats);
      stats.pagesDone += 1;
      await this.stateRepository.update({ organizationId }, { lastPage: page, stats });
    }
    pending.clear();
    await this.stateRepository.update({ organizationId }, {
      status: 'completed', lastPage: totalPages, stats, finishedAt: new Date(), lastCompletedAt: new Date(),
    });
    this.logger.log(`Competition sync for ${organizationId}: ${JSON.stringify({ ...stats, unknownBranches: Object.keys(stats.unknownBranches).length })}`);
  }

  private async fetchPage(page: number): Promise<ParticipantsPage> {
    const url = new URL(this.configService.get<string>('COMPETITION_API_URL') || DEFAULT_API_URL);
    url.searchParams.set('page', String(page));
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 401) throw Object.assign(new Error('مفتاح الربط مع موقع المسابقة غير صحيح (401).'), { fatal: true });
        if (response.status === 503) throw Object.assign(new Error('واجهة الربط في موقع المسابقة معطلة (503).'), { fatal: true });
        if (!response.ok) throw new Error(`موقع المسابقة رد بالحالة ${response.status} للصفحة ${page}`);
        const body = await response.json() as { data?: ParticipantsPage };
        if (!body?.data || !Array.isArray(body.data.items) || !body.data.pagination) throw new Error(`رد غير متوقع من موقع المسابقة للصفحة ${page}`);
        return body.data;
      } catch (error) {
        lastError = error as Error;
        if ((error as { fatal?: boolean }).fatal) throw error;
        if (attempt < FETCH_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
    throw lastError || new Error(`تعذر جلب الصفحة ${page}`);
  }

  private async ensureCategory(organizationId: string, name: string, color: string) {
    const [existing] = await this.customerRepository.query(
      `SELECT id FROM customer_categories WHERE "organizationId" = $1 AND scope = 'organization' AND TRIM(name) = $2 LIMIT 1`,
      [organizationId, name]);
    if (existing) return String(existing.id);
    const [created] = await this.customerRepository.query(
      `INSERT INTO customer_categories ("organizationId", scope, "storeId", name, color, "isActive", "sortOrder")
       VALUES ($1, 'organization', NULL, $2, $3, true, 0) RETURNING id`, [organizationId, name, color]);
    return String(created.id);
  }

  /** One transaction per page: create missing customers, fill placeholder names, set the competition category. */
  private async applyPage(
    items: CompetitionParticipant[],
    storeIdByBranch: Map<string, string>,
    directCategoryId: string,
    onlineCategoryId: string,
    stats: CompetitionSyncStats,
  ) {
    const byStore = planCompetitionPage(items, storeIdByBranch, stats);
    if (!byStore.size) return;
    await this.customerRepository.manager.transaction(async (manager) => {
      for (const [storeId, planned] of byStore) {
        await this.applyStore(manager, storeId, [...planned.values()], directCategoryId, onlineCategoryId, stats);
      }
    });
  }

  private async applyStore(
    manager: EntityManager,
    storeId: string,
    planned: PlannedCustomer[],
    directCategoryId: string,
    onlineCategoryId: string,
    stats: CompetitionSyncStats,
  ) {
    const phones = planned.map((row) => row.phone);
    const inserted: unknown[] = await manager.query(
      `INSERT INTO customers ("storeId", "phoneNumber", "whatsappId", "fullName", tags)
       SELECT $1, phone, phone, COALESCE(NULLIF(name, ''), phone), '[]'::jsonb
         FROM unnest($2::text[], $3::text[]) AS t(phone, name)
       ON CONFLICT ("phoneNumber", "storeId") DO NOTHING
       RETURNING id`,
      [storeId, phones, planned.map((row) => row.name)]);
    stats.created += inserted.length;

    const existing: { id: string; phoneNumber: string | null; whatsappId: string | null; fullName: string | null }[] = await manager.query(
      `SELECT id, "phoneNumber", "whatsappId", "fullName" FROM customers
        WHERE "storeId" = $1 AND ("phoneNumber" = ANY($2::text[]) OR "whatsappId" = ANY($2::text[]))`,
      [storeId, phones]);
    const byPhone = new Map<string, (typeof existing)[number]>();
    for (const customer of existing) {
      const phone = normalizePhoneNumber(customer.phoneNumber || customer.whatsappId);
      // Prefer the record whose phoneNumber is the number itself over one that only shares the WhatsApp id.
      if (!byPhone.has(phone) || customer.phoneNumber === phone) byPhone.set(phone, customer);
    }

    const renames: { id: string; name: string }[] = [];
    const directIds: string[] = [];
    const onlineIds: string[] = [];
    for (const row of planned) {
      const customer = byPhone.get(row.phone);
      if (!customer) continue;
      (row.online ? onlineIds : directIds).push(customer.id);
      if (row.name && customer.fullName !== row.name
        && this.customersService.isPlaceholderName(customer.fullName, customer.phoneNumber || customer.whatsappId || '')) {
        renames.push({ id: customer.id, name: row.name });
      }
    }
    if (renames.length) {
      await manager.query(
        `UPDATE customers c SET "fullName" = t.name, "updatedAt" = now()
           FROM unnest($1::uuid[], $2::text[]) AS t(id, name) WHERE c.id = t.id`,
        [renames.map((row) => row.id), renames.map((row) => row.name)]);
      stats.renamed += renames.length;
    }

    const link = async (ids: string[], categoryId: string) => {
      if (!ids.length) return 0;
      const rows: unknown[] = await manager.query(
        `INSERT INTO customer_category_links ("customerId", "categoryId") SELECT unnest($1::uuid[]), $2
         ON CONFLICT DO NOTHING RETURNING "customerId"`, [ids, categoryId]);
      return rows.length;
    };
    // Each participant sits in exactly one of the two competition categories.
    const unlink = async (ids: string[], categoryId: string) => {
      if (!ids.length) return 0;
      const rows: unknown[] = await manager.query(
        `DELETE FROM customer_category_links WHERE "categoryId" = $2 AND "customerId" = ANY($1::uuid[]) RETURNING "customerId"`,
        [ids, categoryId]);
      return rows.length;
    };
    stats.linkedDirect += await link(directIds, directCategoryId);
    stats.linkedOnline += await link(onlineIds, onlineCategoryId);
    stats.switched += await unlink(directIds, onlineCategoryId) + await unlink(onlineIds, directCategoryId);
  }
}
