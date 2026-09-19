import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountDeletionRequest, AccountDeletionStatus } from './entities/account-deletion-request.entity';
import { CreateAccountDeletionRequestDto, UpdateAccountDeletionStatusDto } from './dto/account-deletion.dto';
import { User } from '../users/entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';

@Injectable()
export class AccountDeletionService implements OnModuleInit {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly rateLimits = new Map<string, { count: number; resetTime: number }>();

  constructor(
    @InjectRepository(AccountDeletionRequest)
    private readonly requestRepository: Repository<AccountDeletionRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
  ) {}

  async onModuleInit() {
    try {
      await this.requestRepository.query(`
        CREATE TABLE IF NOT EXISTS account_deletion_requests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email varchar NOT NULL,
          "organizationName" varchar,
          phone varchar,
          reason text,
          status varchar NOT NULL DEFAULT 'PENDING',
          "matchedUserId" uuid,
          "matchedOrganizationId" uuid,
          "adminNotes" text,
          "ipAddress" varchar,
          "userAgent" text,
          "verifiedAt" timestamp,
          "completedAt" timestamp,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );
      `);
    } catch (e: any) {
      this.logger.warn(`Auto-migration for account_deletion_requests notice: ${e.message}`);
    }
  }

  async createPublicRequest(dto: CreateAccountDeletionRequestDto, ip?: string, userAgent?: string) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    this.checkRateLimit(`${ip || ''}_${normalizedEmail}`);

    // Internal matching (without exposing existence in response)
    let matchedUserId: string | null = null;
    let matchedOrgId: string | null = null;

    try {
      const user = await this.userRepository.findOne({ where: { email: normalizedEmail } });
      if (user) {
        matchedUserId = user.id;
        const membership = await this.memberRepository.findOne({ where: { userId: user.id } });
        if (membership) {
          matchedOrgId = membership.organizationId;
        }
      }
    } catch (err: any) {
      this.logger.warn(`User lookup failed during deletion request: ${err.message}`);
    }

    const request = this.requestRepository.create({
      email: normalizedEmail,
      organizationName: dto.organizationName?.trim() || null,
      phone: dto.phone?.trim() || null,
      reason: dto.reason?.trim() || null,
      status: AccountDeletionStatus.PENDING,
      matchedUserId,
      matchedOrganizationId: matchedOrgId,
      ipAddress: ip || null,
      userAgent: userAgent || null,
    });

    await this.requestRepository.save(request);

    this.logger.log(`Account deletion request registered for email [${normalizedEmail}] (ID: ${request.id})`);

    return {
      success: true,
      message: 'إذا كانت البيانات المدخلة مرتبطة بحساب في لبيك، فسيتم إرسال تعليمات التحقق والمتابعة.',
    };
  }

  async listRequestsForAdmin() {
    return this.requestRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatusForAdmin(id: string, dto: UpdateAccountDeletionStatusDto) {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('طلب الحذف غير موجود.');
    }

    request.status = dto.status;
    if (dto.adminNotes !== undefined) {
      request.adminNotes = dto.adminNotes;
    }

    if (dto.status === AccountDeletionStatus.VERIFIED && !request.verifiedAt) {
      request.verifiedAt = new Date();
    } else if (dto.status === AccountDeletionStatus.COMPLETED && !request.completedAt) {
      request.completedAt = new Date();
    }

    return this.requestRepository.save(request);
  }

  private checkRateLimit(key: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 4;

    const entry = this.rateLimits.get(key);
    if (!entry || entry.resetTime < now) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (entry.count >= maxRequests) {
      throw new HttpException(
        'تم استلام عدد كبير من الطلبات خلال وقت قصير. يرجى المحاولة لاحقاً بعد 15 دقيقة.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
  }
}
