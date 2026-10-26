import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { normalizePhoneNumber } from '../../common/utils/phone.util';
import { AUDIENCE_LIMIT, CustomersService, audienceToFilters } from '../customers/customers.service';
import { CustomerAudienceDto } from '../customers/dto/customer.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { Store } from '../stores/entities/store.entity';
import { SendWhatsAppTemplateBulkDto } from './dto/meta-whatsapp.dto';
import { MetaConnectionScope, MetaWhatsAppConnection } from './entities/meta-whatsapp-connection.entity';
import { WhatsAppCampaign, WhatsAppCampaignAudience, WhatsAppCampaignParameters, WhatsAppCampaignStatus } from './entities/whatsapp-campaign.entity';
import { CampaignRecipientStatus, WhatsAppCampaignRecipient } from './entities/whatsapp-campaign-recipient.entity';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MetaTemplatePayloadBuilder } from './services/meta-template-payload.builder';

/** Upper bound on parallel sends per campaign; the chosen messages/second paces them. */
const MAX_SEND_CONCURRENCY = 160;
/** Workers per message/second of pace: covers a send that takes up to ~2s end to end. */
const SEND_CONCURRENCY_PER_MPS = 2;
const CLAIM_BATCH = 40;
const DEFAULT_SPEED = 20;
/** How often due scheduled campaigns are picked up. */
const SCHEDULE_POLL_MS = 30_000;
const MAX_SCHEDULE_DAYS = 30;
/** A campaign stops once this many sends in a row fail (empty wallet, revoked token, paused template...). */
const MAX_CONSECUTIVE_FAILURES = 25;
/** An inbound message within this window of a campaign message counts as a reply to it. */
const REPLY_WINDOW_HOURS = 72;

export type CampaignStats = {
  total: number;
  pending: number;
  accepted: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  failed: number;
  skipped: number;
};

export type RecipientFilter = 'all' | 'pending' | 'accepted' | 'delivered' | 'read' | 'replied' | 'clicked' | 'failed' | 'skipped';

const STATS_SELECT = `
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE r.status IN ('pending', 'sending'))::int AS pending,
  COUNT(*) FILTER (WHERE r."whatsappMessageId" IS NOT NULL)::int AS accepted,
  COUNT(*) FILTER (WHERE r."deliveredAt" IS NOT NULL OR r."readAt" IS NOT NULL)::int AS delivered,
  COUNT(*) FILTER (WHERE r."readAt" IS NOT NULL)::int AS read,
  COUNT(*) FILTER (WHERE r."repliedAt" IS NOT NULL)::int AS replied,
  COUNT(*) FILTER (WHERE r."replyType" = 'button')::int AS clicked,
  COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed,
  COUNT(*) FILTER (WHERE r.status = 'skipped')::int AS skipped`;

const RECIPIENT_FILTERS: Record<Exclude<RecipientFilter, 'all'>, string> = {
  pending: `r.status IN ('pending', 'sending')`,
  accepted: `r."whatsappMessageId" IS NOT NULL`,
  delivered: `(r."deliveredAt" IS NOT NULL OR r."readAt" IS NOT NULL)`,
  read: `r."readAt" IS NOT NULL`,
  replied: `r."repliedAt" IS NOT NULL`,
  clicked: `r."replyType" = 'button'`,
  failed: `r.status = 'failed'`,
  skipped: `r.status = 'skipped'`,
};

const toStats = (row: any = {}): CampaignStats => ({
  total: Number(row.total || 0),
  pending: Number(row.pending || 0),
  accepted: Number(row.accepted || 0),
  delivered: Number(row.delivered || 0),
  read: Number(row.read || 0),
  replied: Number(row.replied || 0),
  clicked: Number(row.clicked || 0),
  failed: Number(row.failed || 0),
  skipped: Number(row.skipped || 0),
});

/**
 * Bulk template sends as tracked campaigns: the audience is resolved and saved up front, messages go out
 * in the background (so large audiences never hit the HTTP timeout), and Meta status webhooks plus customer
 * replies are recorded per recipient for the campaign details and reports.
 */
@Injectable()
export class WhatsAppCampaignsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppCampaignsService.name);
  private readonly running = new Set<string>();
  private scheduleTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(WhatsAppCampaign) private readonly campaignRepository: Repository<WhatsAppCampaign>,
    @InjectRepository(WhatsAppCampaignRecipient) private readonly recipientRepository: Repository<WhatsAppCampaignRecipient>,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly organizationsService: OrganizationsService,
    private readonly customersService: CustomersService,
    private readonly templatePayloadBuilder: MetaTemplatePayloadBuilder,
  ) {}

  /** Resumes campaigns interrupted by a restart. Messages that were mid-send are failed rather than risk a double send. */
  onApplicationBootstrap() {
    setTimeout(() => void this.resumeInterrupted(), 5000);
    this.scheduleTimer = setInterval(() => void this.startDue(), SCHEDULE_POLL_MS);
  }

  onModuleDestroy() {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  /** Queues scheduled campaigns whose time has come. The UPDATE claims each one, so only one instance starts it. */
  private async startDue() {
    try {
      const [rows] = await this.campaignRepository.query(
        `UPDATE whatsapp_campaigns SET status = 'queued', "updatedAt" = now()
          WHERE status = 'scheduled' AND "scheduledAt" <= now() RETURNING id`,
      );
      for (const { id } of rows || []) void this.run(id);
    } catch (error: any) {
      this.logger.warn(`Could not start scheduled WhatsApp campaigns: ${error.message}`);
    }
  }

  private async resumeInterrupted() {
    try {
      const campaigns = await this.campaignRepository.find({
        where: [{ status: WhatsAppCampaignStatus.QUEUED }, { status: WhatsAppCampaignStatus.SENDING }],
        select: ['id'],
      });
      for (const { id } of campaigns) {
        await this.recipientRepository.query(
          `UPDATE whatsapp_campaign_recipients SET status = 'failed', "failedAt" = now(), error = $2
            WHERE "campaignId" = $1 AND status = 'sending'`,
          [id, 'انقطع الإرسال بسبب إعادة تشغيل الخادم. يمكنك إعادة المحاولة للفاشلة.'],
        );
        void this.run(id);
      }
    } catch (error: any) {
      this.logger.warn(`Could not resume WhatsApp campaigns: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Create + send
  // ---------------------------------------------------------------------------

  async createForUser(userId: string, organizationId: string | undefined, templateId: string, dto: SendWhatsAppTemplateBulkDto) {
    const { connection, template, organization } = await this.metaWhatsAppService.getOwnedTemplate(userId, organizationId, templateId);
    if ((template.status || '').toUpperCase() !== 'APPROVED') throw new BadRequestException('Only APPROVED WhatsApp templates can be sent');

    const testPhones = dto.testPhones?.length ? parseTestPhones(dto.testPhones) : null;
    const audience: CustomerAudienceDto | null = testPhones
      ? Object.assign(new CustomerAudienceDto(), { mode: 'manual' as const })
      : dto.audience ?? (dto.customerIds?.length ? Object.assign(new CustomerAudienceDto(), { mode: 'manual' as const, customerIds: dto.customerIds }) : null);
    if (!audience) throw new BadRequestException('حدّد جمهور الحملة.');
    const scheduledAt = this.resolveSchedule(dto.scheduledAt);
    const storeIds = await this.resolveStoreIds(userId, organization.id, connection, dto, audience);

    const filters = audienceToFilters(audience, storeIds);
    const plan = testPhones
      ? { records: dto.testPhones!.length, duplicates: testPhones.duplicates, optedOut: 0, recipients: testPhones.phones.length }
      : await this.customersService.summarizeAudience(organization.id, filters);
    if (testPhones && !testPhones.phones.length) throw new BadRequestException('لا توجد أرقام صالحة في أرقام التجربة.');
    if ('overLimit' in plan && plan.overLimit) {
      throw new BadRequestException(`الجمهور أكبر من الحد المسموح للحملة الواحدة (${AUDIENCE_LIMIT.toLocaleString('en')}). ضيّقه بفئة أو تاق أو فرع.`);
    }
    if (!plan.recipients) throw new BadRequestException('لا يوجد مستلمون في هذا الجمهور بعد استبعاد الرافضين للتسويق والمكررين.');

    const parameters: WhatsAppCampaignParameters = {
      body: dto.bodyParameters || [],
      header: dto.headerParameters || [],
      buttons: dto.buttonParameters || [],
      otpCode: dto.otpCode || null,
      nameFallback: dto.nameFallback?.trim() || null,
      headerMedia: dto.headerMedia ? pickHeaderMedia(dto.headerMedia) : null,
    };
    // Fails fast on missing variables/media, before anything is saved or charged.
    const preview = this.templatePayloadBuilder.validateAndBuild(template, this.campaignDto(parameters));

    const labels = await this.audienceLabels(organization.id, storeIds, audience);
    const [creator] = await this.campaignRepository.query('SELECT "fullName" FROM users WHERE id = $1', [userId]);
    const createdAt = new Date();
    // The campaign and its recipients are saved together, so a failed insert never leaves an empty campaign behind.
    const campaign = await this.campaignRepository.manager.transaction(async (manager) => {
      const saved = await manager.save(this.campaignRepository.create({
        organizationId: organization.id,
        connectionId: connection.id,
        templateId: template.id,
        templateName: template.name,
        templateLanguage: template.language,
        templateCategory: template.category,
        name: dto.name?.trim() || `${template.name} · ${createdAt.toISOString().slice(0, 10)}`,
        status: scheduledAt ? WhatsAppCampaignStatus.SCHEDULED : WhatsAppCampaignStatus.QUEUED,
        scheduledAt,
        messagesPerSecond: dto.messagesPerSecond || DEFAULT_SPEED,
        createdByUserId: userId,
        createdByName: creator?.fullName || null,
        storeIds,
        audience: {
          mode: audience.mode,
          storeIds,
          categoryIds: audience.categoryIds,
          tagIds: audience.tagIds,
          tagMatch: audience.tagMatch,
          excludeCategoryIds: audience.excludeCategoryIds,
          excludeTagIds: audience.excludeTagIds,
          manualCount: testPhones ? testPhones.phones.length : audience.mode === 'manual' ? audience.customerIds?.length || 0 : undefined,
          excludedCount: audience.mode !== 'manual' ? audience.excludeCustomerIds?.length || 0 : undefined,
          test: testPhones ? true : undefined,
          labels,
        },
        parameters,
        previewText: preview.renderedPreview,
        sourceRecords: plan.records,
        duplicatesRemoved: plan.duplicates,
        optedOutSkipped: plan.optedOut,
        totalRecipients: plan.recipients,
      }));
      const total = testPhones
        ? await this.insertTestRecipients(manager, saved.id, organization.id, storeIds[0], testPhones.phones)
        : await this.customersService.insertAudienceRecipients(manager, saved.id, organization.id, filters);
      if (!total) throw new BadRequestException('لا يوجد مستلمون في هذا الجمهور بعد استبعاد الرافضين للتسويق والمكررين.');
      // Customers may change between the count above and the insert; the saved recipients are what counts.
      if (total !== saved.totalRecipients) {
        saved.totalRecipients = total;
        await manager.update(WhatsAppCampaign, saved.id, { totalRecipients: total });
      }
      return saved;
    });

    if (!scheduledAt) void this.run(campaign.id);
    return { ...this.toPublic(campaign), stats: toStats({ total: campaign.totalRecipients, pending: campaign.totalRecipients }) };
  }

  /** Recipients for a test send: bare numbers on the chosen branch, with no customer behind them. */
  private async insertTestRecipients(manager: EntityManager, campaignId: string, organizationId: string, storeId: string, phones: string[]) {
    const [store] = await manager.query('SELECT name FROM stores WHERE id = $1', [storeId]);
    for (let i = 0; i < phones.length; i += 1000) {
      await manager.insert(WhatsAppCampaignRecipient, phones.slice(i, i + 1000).map((phone) => ({
        campaignId, organizationId, customerId: null, storeId, storeName: store?.name || null, phone, customerName: null, status: CampaignRecipientStatus.PENDING,
      })));
    }
    return phones.length;
  }

  /** A future start time, or null to send now. Times already reached (or within a minute) send right away. */
  private resolveSchedule(value?: string) {
    if (!value) return null;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('وقت الجدولة غير صالح.');
    if (at.getTime() - Date.now() > MAX_SCHEDULE_DAYS * 24 * 3600 * 1000) {
      throw new BadRequestException(`يمكن جدولة الحملة حتى ${MAX_SCHEDULE_DAYS} يومًا كحد أقصى.`);
    }
    return at.getTime() - Date.now() > 60_000 ? at : null;
  }

  async cancelForUser(userId: string, organizationId: string | undefined, id: string) {
    const campaign = await this.findAccessible(userId, organizationId, id);
    if (![WhatsAppCampaignStatus.SCHEDULED, WhatsAppCampaignStatus.QUEUED, WhatsAppCampaignStatus.SENDING].includes(campaign.status)) {
      throw new BadRequestException('الحملة ليست قيد الإرسال.');
    }
    await this.campaignRepository.update(id, { status: WhatsAppCampaignStatus.CANCELLED, completedAt: new Date() });
    await this.recipientRepository.query(
      `UPDATE whatsapp_campaign_recipients SET status = 'skipped', error = $2 WHERE "campaignId" = $1 AND status = 'pending'`,
      [id, 'أُلغيت الحملة قبل الإرسال لهذا الرقم.'],
    );
    return this.getForUser(userId, organizationId, id);
  }

  /** Re-queues numbers whose send failed on our side (Meta never accepted them) and restarts the campaign. */
  async retryFailedForUser(userId: string, organizationId: string | undefined, id: string) {
    const campaign = await this.findAccessible(userId, organizationId, id);
    if ([WhatsAppCampaignStatus.SCHEDULED, WhatsAppCampaignStatus.QUEUED, WhatsAppCampaignStatus.SENDING].includes(campaign.status)) {
      throw new BadRequestException('انتظر حتى ينتهي الإرسال الحالي.');
    }
    const [, retried] = await this.recipientRepository.query(
      `UPDATE whatsapp_campaign_recipients SET status = 'pending', error = NULL, "failedAt" = NULL
        WHERE "campaignId" = $1 AND "whatsappMessageId" IS NULL AND status IN ('failed', 'skipped')`,
      [id],
    );
    if (!retried) throw new BadRequestException('لا توجد أرقام قابلة لإعادة المحاولة.');
    await this.campaignRepository.update(id, { status: WhatsAppCampaignStatus.QUEUED, lastError: null, completedAt: null });
    void this.run(id);
    return this.getForUser(userId, organizationId, id);
  }

  private async run(campaignId: string) {
    if (this.running.has(campaignId)) return;
    this.running.add(campaignId);
    try {
      const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });
      if (!campaign || ![WhatsAppCampaignStatus.QUEUED, WhatsAppCampaignStatus.SENDING].includes(campaign.status)) return;
      const context = campaign.templateId ? await this.metaWhatsAppService.findTemplateWithConnection(campaign.templateId) : null;
      if (!context) {
        await this.stop(campaign.id, 'القالب أو رقم الإرسال لم يعد موجودًا (ربما حُذف عند مزامنة القوالب).');
        return;
      }
      await this.campaignRepository.update(campaign.id, { status: WhatsAppCampaignStatus.SENDING, startedAt: campaign.startedAt || new Date() });

      const dto = { ...this.campaignDto(campaign.parameters), nameFallback: campaign.parameters.nameFallback || undefined };
      const stores = new Map<string, Store>();
      const speed = campaign.messagesPerSecond || DEFAULT_SPEED;
      // A send (billing, Meta round-trip, bookkeeping) takes about a second, so `speed` workers alone fall short of `speed`/s.
      const concurrency = Math.min(MAX_SEND_CONCURRENCY, speed * SEND_CONCURRENCY_PER_MPS);
      // Each send takes the next free slot on a shared clock, so the campaign never exceeds its messages/second.
      const interval = 1000 / speed;
      let nextSlot = Date.now();
      const pace = async () => {
        const slot = Math.max(nextSlot, Date.now());
        nextSlot = slot + interval;
        const wait = slot - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      };
      let consecutiveFailures = 0;
      let lastError = '';

      // Workers pull from one shared queue that is topped up in the background, so a single slow Meta call
      // only holds up its own worker instead of the whole batch. Claimed numbers are always sent, even after
      // a pause or cancel, so none is left stuck in 'sending'.
      const queue: WhatsAppCampaignRecipient[] = [];
      const customers = new Map<string, any>();
      let halt: 'done' | 'status' | 'failures' | 'error' | null = null;
      let fatal: unknown = null;
      let refilling: Promise<void> | null = null;

      const claimMore = async () => {
        try {
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { halt = 'failures'; return; }
          const current = await this.campaignRepository.findOne({ where: { id: campaign.id }, select: ['id', 'status'] });
          if (current?.status !== WhatsAppCampaignStatus.SENDING) { halt = 'status'; return; }
          const batch = await this.claimBatch(campaign.id, Math.max(CLAIM_BATCH, concurrency));
          if (!batch.length) { halt = 'done'; return; }
          const rows = await this.customersService.findAudienceRowsByIds(batch.map((item) => item.customerId).filter(Boolean) as string[]);
          for (const [id, row] of rows) customers.set(id, row);
          queue.push(...batch);
        } catch (error) {
          fatal = error;
          halt = 'error';
        }
      };
      const refill = () => {
        if (!refilling && !halt) refilling = claimMore().finally(() => { refilling = null; });
        return refilling ?? Promise.resolve();
      };
      const next = async () => {
        for (;;) {
          if (queue.length) {
            if (queue.length <= concurrency) void refill();
            return queue.shift();
          }
          if (halt) return undefined;
          await refill();
        }
      };

      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let recipient = await next(); recipient; recipient = await next()) {
          await pace();
          const audienceRow = recipient.customerId ? customers.get(recipient.customerId) : undefined;
          if (recipient.customerId) customers.delete(recipient.customerId);
          try {
            const store = stores.get(recipient.storeId)
              || await this.organizationsService.assertStoreBelongsToOrganization(campaign.organizationId, recipient.storeId);
            stores.set(recipient.storeId, store);
            const customer = audienceRow
              || { fullName: recipient.customerName, phoneNumber: recipient.phone, storeName: recipient.storeName };
            const personalized = this.metaWhatsAppService.personalizeTemplateDto(dto, customer);
            const response = await this.metaWhatsAppService.sendOneTemplate(
              store, context.connection, context.template, recipient.phone, personalized, { campaignId: campaign.id }, !campaign.audience?.test,
            );
            await this.recipientRepository.update(recipient.id, {
              status: CampaignRecipientStatus.SENT,
              whatsappMessageId: response?.message?.metadata?.whatsappMessageId || null,
              sentAt: new Date(),
            });
            consecutiveFailures = 0;
          } catch (error: any) {
            lastError = errorText(error);
            consecutiveFailures += 1;
            await this.recipientRepository.update(recipient.id, { status: CampaignRecipientStatus.FAILED, error: lastError, failedAt: new Date() });
          }
        }
      }));

      if (fatal) throw fatal;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await this.stop(campaign.id, `أُوقفت الحملة بعد فشل ${consecutiveFailures} رسالة متتالية. آخر خطأ: ${lastError}`);
        return;
      }
      if (halt === 'status') return;

      await this.campaignRepository.update(campaign.id, { status: WhatsAppCampaignStatus.COMPLETED, completedAt: new Date() });
    } catch (error: any) {
      this.logger.error(`Campaign ${campaignId} crashed: ${error.message}`, error.stack);
      await this.stop(campaignId, errorText(error)).catch(() => undefined);
    } finally {
      this.running.delete(campaignId);
    }
  }

  /** Atomically takes the next pending numbers, so two server instances never send the same one. */
  private async claimBatch(campaignId: string, limit = CLAIM_BATCH): Promise<WhatsAppCampaignRecipient[]> {
    return this.recipientRepository.query(
      `WITH claimed AS (
         UPDATE whatsapp_campaign_recipients SET status = 'sending'
          WHERE id IN (
            SELECT id FROM whatsapp_campaign_recipients
             WHERE "campaignId" = $1 AND status = 'pending'
             ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
          RETURNING *)
       SELECT * FROM claimed`,
      [campaignId, limit],
    );
  }

  private async stop(campaignId: string, reason: string) {
    await this.recipientRepository.query(
      `UPDATE whatsapp_campaign_recipients SET status = 'skipped', error = $2 WHERE "campaignId" = $1 AND status = 'pending'`,
      [campaignId, reason],
    );
    await this.campaignRepository.update(campaignId, { status: WhatsAppCampaignStatus.FAILED, lastError: reason, completedAt: new Date() });
  }

  private campaignDto(parameters: WhatsAppCampaignParameters) {
    return {
      otpCode: parameters.otpCode || undefined,
      bodyParameters: parameters.body,
      headerParameters: parameters.header,
      buttonParameters: parameters.buttons,
      headerMedia: parameters.headerMedia || undefined,
    };
  }

  private async resolveStoreIds(userId: string, organizationId: string, connection: MetaWhatsAppConnection, dto: SendWhatsAppTemplateBulkDto, audience: CustomerAudienceDto) {
    if (connection.scope === MetaConnectionScope.STORE) {
      if (!connection.storeId) throw new BadRequestException('Store-scoped Meta connection is missing its branch');
      const requested = [dto.storeId, ...(audience.storeIds || [])].filter(Boolean);
      if (requested.some((id) => id !== connection.storeId)) throw new BadRequestException('This WhatsApp number belongs to a different branch');
      await this.organizationsService.assertStoreAccessibleByUser(userId, organizationId, connection.storeId);
      return [connection.storeId];
    }
    const requested = audience.storeIds?.length ? audience.storeIds : dto.storeIds?.length ? dto.storeIds : dto.storeId ? [dto.storeId] : [];
    const access = await this.organizationsService.assertRequestedStoresAccessible(userId, organizationId, requested);
    if (!access.storeIds.length) throw new BadRequestException('No accessible branches are available for this send');
    return access.storeIds;
  }

  private async audienceLabels(organizationId: string, storeIds: string[], audience: CustomerAudienceDto): Promise<WhatsAppCampaignAudience['labels']> {
    const ids = (list?: string[]) => list || [];
    const [branches, categories, tags] = await Promise.all([
      this.campaignRepository.query('SELECT id, name FROM stores WHERE "organizationId" = $1 AND id = ANY($2::uuid[]) ORDER BY name', [organizationId, storeIds]),
      this.campaignRepository.query(
        'SELECT id, name, color FROM customer_categories WHERE "organizationId" = $1 AND id = ANY($2::uuid[])',
        [organizationId, [...ids(audience.categoryIds), ...ids(audience.excludeCategoryIds)]],
      ),
      this.campaignRepository.query(
        'SELECT id, name, color FROM customer_tags WHERE "organizationId" = $1 AND id = ANY($2::uuid[])',
        [organizationId, [...ids(audience.tagIds), ...ids(audience.excludeTagIds)]],
      ),
    ]);
    const pick = (rows: { id: string; name: string; color: string }[], wanted?: string[]) => rows.filter((row) => ids(wanted).includes(row.id));
    return {
      branches,
      categories: pick(categories, audience.categoryIds),
      tags: pick(tags, audience.tagIds),
      excludeCategories: pick(categories, audience.excludeCategoryIds),
      excludeTags: pick(tags, audience.excludeTagIds),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook tracking
  // ---------------------------------------------------------------------------

  /** Applies a Meta message status (sent/delivered/read/failed) to the campaign recipient, if any. */
  async recordStatus(status: { id?: string; status?: string; timestamp?: number; errors?: any[] }) {
    if (!status?.id || !status.status) return;
    const at = new Date(status.timestamp || Date.now());
    switch (String(status.status).toLowerCase()) {
      case 'sent':
        await this.recipientRepository.query(
          `UPDATE whatsapp_campaign_recipients SET "sentAt" = COALESCE("sentAt", $2) WHERE "whatsappMessageId" = $1`,
          [status.id, at],
        );
        break;
      case 'delivered':
        await this.recipientRepository.query(
          `UPDATE whatsapp_campaign_recipients
              SET "deliveredAt" = COALESCE("deliveredAt", $2),
                  status = CASE WHEN status IN ('sending', 'sent') THEN 'delivered' ELSE status END
            WHERE "whatsappMessageId" = $1`,
          [status.id, at],
        );
        break;
      case 'read':
        await this.recipientRepository.query(
          `UPDATE whatsapp_campaign_recipients
              SET "readAt" = COALESCE("readAt", $2), "deliveredAt" = COALESCE("deliveredAt", $2),
                  status = CASE WHEN status = 'failed' THEN status ELSE 'read' END
            WHERE "whatsappMessageId" = $1`,
          [status.id, at],
        );
        break;
      case 'failed': {
        const error = (status.errors || []).map((item: any) => item?.error_data?.details || item?.message || item?.title).filter(Boolean).join(' · ');
        await this.recipientRepository.query(
          `UPDATE whatsapp_campaign_recipients SET status = 'failed', "failedAt" = COALESCE("failedAt", $2), error = $3
            WHERE "whatsappMessageId" = $1 AND "readAt" IS NULL`,
          [status.id, at, error || 'Meta: فشل التسليم'],
        );
        break;
      }
    }
  }

  /**
   * Marks the campaign message a customer answered. A quoted reply or button tap names the message exactly;
   * otherwise the latest campaign message to that number in the reply window is used.
   */
  async recordReply(organizationId: string | null | undefined, from: string, reply: { contextId?: string; type: string; text?: string; timestamp?: number }) {
    const phone = normalizePhoneNumber(from);
    if (!organizationId || !phone) return;
    let target: WhatsAppCampaignRecipient | null = null;
    if (reply.contextId) target = await this.recipientRepository.findOne({ where: { organizationId, whatsappMessageId: reply.contextId } });
    if (!target) {
      target = await this.recipientRepository.createQueryBuilder('r')
        .where('r.organizationId = :organizationId', { organizationId })
        .andWhere('r.phone = :phone', { phone })
        .andWhere('r.sentAt >= :since', { since: new Date(Date.now() - REPLY_WINDOW_HOURS * 3600 * 1000) })
        .andWhere("r.status <> 'failed'")
        .orderBy('r.sentAt', 'DESC')
        .getOne();
    }
    if (!target) return;
    const isButton = reply.type === 'button' || reply.type === 'interactive_button';
    // Keep the first reply, but a later button tap still counts as a click.
    if (target.repliedAt && !(isButton && target.replyType !== 'button')) return;
    const at = new Date(reply.timestamp || Date.now());
    await this.recipientRepository.query(
      `UPDATE whatsapp_campaign_recipients
          SET "repliedAt" = COALESCE("repliedAt", $2), "replyType" = $3, "replyText" = $4,
              "readAt" = COALESCE("readAt", $2), "deliveredAt" = COALESCE("deliveredAt", $2),
              status = CASE WHEN status = 'failed' THEN status ELSE 'read' END
        WHERE id = $1`,
      [target.id, at, isButton ? 'button' : reply.type, String(reply.text || '').slice(0, 500) || null],
    );
  }

  // ---------------------------------------------------------------------------
  // Read side
  // ---------------------------------------------------------------------------

  async listForUser(userId: string, organizationId: string | undefined, query: { page: number; limit: number; templateId?: string; status?: string; search?: string }) {
    const { organization, storeIds } = await this.accessibleStores(userId, organizationId);
    const builder = this.campaignRepository.createQueryBuilder('campaign')
      .where('campaign.organizationId = :organizationId', { organizationId: organization.id })
      .andWhere('EXISTS (SELECT 1 FROM jsonb_array_elements_text(campaign."storeIds") s WHERE s = ANY(CAST(:storeIds AS text[])))', { storeIds });
    if (query.templateId) builder.andWhere('campaign.templateId = :templateId', { templateId: query.templateId });
    if (query.status) builder.andWhere('campaign.status = :status', { status: query.status });
    if (query.search?.trim()) {
      builder.andWhere('(campaign.name ILIKE :search OR campaign.templateName ILIKE :search)', { search: `%${query.search.trim()}%` });
    }
    const [campaigns, total] = await builder
      .orderBy('campaign.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const stats = await this.statsFor(campaigns.map((campaign) => campaign.id));
    return {
      items: campaigns.map((campaign) => ({ ...this.toPublic(campaign), stats: stats.get(campaign.id) || toStats() })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getForUser(userId: string, organizationId: string | undefined, id: string) {
    const campaign = await this.findAccessible(userId, organizationId, id);
    const [stats, byBranch, buttons, errors, timeline] = await Promise.all([
      this.statsFor([id]).then((map) => map.get(id) || toStats()),
      this.recipientRepository.query(
        `SELECT r."storeId", MAX(r."storeName") AS "storeName", ${STATS_SELECT}
           FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1
          GROUP BY r."storeId" ORDER BY total DESC`,
        [id],
      ),
      this.recipientRepository.query(
        `SELECT COALESCE(r."replyText", '') AS text, COUNT(*)::int AS count
           FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1 AND r."replyType" = 'button'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        [id],
      ),
      this.recipientRepository.query(
        `SELECT COALESCE(r.error, '') AS error, COUNT(*)::int AS count
           FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1 AND r.status IN ('failed', 'skipped')
          GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
        [id],
      ),
      // Hourly activity for the first week, so the user sees when the audience actually opened and answered.
      this.recipientRepository.query(
        `SELECT kind, bucket, COUNT(*)::int AS count FROM (
           SELECT 'sent' AS kind, date_trunc('hour', r."sentAt") AS bucket FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1 AND r."sentAt" IS NOT NULL
           UNION ALL SELECT 'read', date_trunc('hour', r."readAt") FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1 AND r."readAt" IS NOT NULL
           UNION ALL SELECT 'replied', date_trunc('hour', r."repliedAt") FROM whatsapp_campaign_recipients r WHERE r."campaignId" = $1 AND r."repliedAt" IS NOT NULL
         ) events
         WHERE bucket < COALESCE($2::timestamptz, now()) + interval '7 days'
         GROUP BY kind, bucket ORDER BY bucket`,
        [id, campaign.startedAt || campaign.createdAt],
      ),
    ]);
    return {
      ...this.toPublic(campaign),
      parameters: campaign.parameters,
      previewText: campaign.previewText,
      stats,
      byBranch: byBranch.map((row: any) => ({ storeId: row.storeId, storeName: row.storeName, stats: toStats(row) })),
      buttons: buttons.map((row: any) => ({ text: row.text, count: Number(row.count) })),
      errors: errors.map((row: any) => ({ error: row.error, count: Number(row.count) })),
      timeline: timeline.map((row: any) => ({ kind: row.kind, bucket: new Date(row.bucket).toISOString(), count: Number(row.count) })),
    };
  }

  async recipientsForUser(userId: string, organizationId: string | undefined, id: string, query: { page: number; limit: number; filter: RecipientFilter; search?: string }) {
    await this.findAccessible(userId, organizationId, id);
    const { storeIds } = await this.accessibleStores(userId, organizationId);
    const params: unknown[] = [id, storeIds];
    const where = ['r."campaignId" = $1', 'r."storeId" = ANY($2::uuid[])'];
    if (query.filter !== 'all' && RECIPIENT_FILTERS[query.filter]) where.push(RECIPIENT_FILTERS[query.filter]);
    const term = query.search?.trim();
    if (term) {
      const digits = term.replace(/[^0-9]/g, '').replace(/^0+/, '');
      params.push(`%${term}%`);
      const nameClause = `r."customerName" ILIKE $${params.length}`;
      if (digits) {
        params.push(`%${digits}%`);
        where.push(`(${nameClause} OR r.phone LIKE $${params.length})`);
      } else where.push(nameClause);
    }
    const clause = where.join(' AND ');
    const [{ total }] = await this.recipientRepository.query(`SELECT COUNT(*)::int AS total FROM whatsapp_campaign_recipients r WHERE ${clause}`, params);
    const items = await this.recipientRepository.query(
      `SELECT r.id, r."customerId", r."storeId", r."storeName", r.phone, r."customerName", r.status, r.error,
              r."sentAt", r."deliveredAt", r."readAt", r."failedAt", r."repliedAt", r."replyType", r."replyText"
         FROM whatsapp_campaign_recipients r WHERE ${clause}
        ORDER BY r."repliedAt" DESC NULLS LAST, r."readAt" DESC NULLS LAST, r."sentAt" DESC NULLS LAST, r.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.limit, (query.page - 1) * query.limit],
    );
    return { items, total: Number(total), page: query.page, limit: query.limit };
  }

  /** Campaign performance per template for the reports page. */
  async reportForUser(userId: string, organizationId: string | undefined, query: { days: number; storeId?: string; tzOffsetMinutes: number }) {
    const { organization, storeIds: accessible } = await this.accessibleStores(userId, organizationId);
    if (query.storeId && !accessible.includes(query.storeId)) throw new ForbiddenException('Branch is outside your access');
    const storeIds = query.storeId ? [query.storeId] : accessible;
    const since = new Date(Date.now() - query.days * 24 * 3600 * 1000);
    const params = [organization.id, since, storeIds];
    const scope = `c."organizationId" = $1 AND c."createdAt" >= $2 AND r."storeId" = ANY($3::uuid[])`;

    const [totalsRow, templates, daily, campaigns] = await Promise.all([
      this.recipientRepository.query(
        `SELECT COUNT(DISTINCT c.id)::int AS campaigns, ${STATS_SELECT}
           FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id WHERE ${scope}`,
        params,
      ),
      this.recipientRepository.query(
        `SELECT c."templateName", c."templateLanguage", c."templateCategory",
                (array_agg(c."templateId" ORDER BY c."createdAt" DESC))[1] AS "templateId",
                COUNT(DISTINCT c.id)::int AS campaigns, MAX(c."createdAt") AS "lastSentAt", ${STATS_SELECT}
           FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id
          WHERE ${scope}
          GROUP BY c."templateName", c."templateLanguage", c."templateCategory"
          ORDER BY accepted DESC`,
        params,
      ),
      this.recipientRepository.query(
        `SELECT key, kind, day, COUNT(*)::int AS count FROM (
           SELECT c."templateName" || '::' || c."templateLanguage" AS key, 'sent' AS kind,
                  to_char(r."sentAt" + make_interval(mins => $4), 'YYYY-MM-DD') AS day
             FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id
            WHERE ${scope} AND r."whatsappMessageId" IS NOT NULL
           UNION ALL
           SELECT c."templateName" || '::' || c."templateLanguage", 'read', to_char(r."readAt" + make_interval(mins => $4), 'YYYY-MM-DD')
             FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id
            WHERE ${scope} AND r."readAt" IS NOT NULL
           UNION ALL
           SELECT c."templateName" || '::' || c."templateLanguage", 'replied', to_char(r."repliedAt" + make_interval(mins => $4), 'YYYY-MM-DD')
             FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id
            WHERE ${scope} AND r."repliedAt" IS NOT NULL
         ) events GROUP BY key, kind, day ORDER BY day`,
        [...params, query.tzOffsetMinutes],
      ),
      this.recipientRepository.query(
        `SELECT c.id, c.name, c.status, c."createdAt", c."templateName", c."templateLanguage", ${STATS_SELECT}
           FROM whatsapp_campaigns c JOIN whatsapp_campaign_recipients r ON r."campaignId" = c.id
          WHERE ${scope}
          GROUP BY c.id ORDER BY c."createdAt" DESC LIMIT 200`,
        params,
      ),
    ]);

    return {
      period: { days: query.days, from: since.toISOString(), to: new Date().toISOString() },
      totals: { campaigns: Number(totalsRow[0]?.campaigns || 0), ...toStats(totalsRow[0]) },
      templates: templates.map((row: any) => ({
        key: `${row.templateName}::${row.templateLanguage}`,
        templateId: row.templateId,
        templateName: row.templateName,
        templateLanguage: row.templateLanguage,
        templateCategory: row.templateCategory,
        campaigns: Number(row.campaigns),
        lastSentAt: row.lastSentAt,
        stats: toStats(row),
      })),
      daily: daily.map((row: any) => ({ key: row.key, kind: row.kind, day: row.day, count: Number(row.count) })),
      campaigns: campaigns.map((row: any) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
        key: `${row.templateName}::${row.templateLanguage}`,
        templateName: row.templateName,
        stats: toStats(row),
      })),
    };
  }

  private async statsFor(campaignIds: string[]) {
    const map = new Map<string, CampaignStats>();
    if (!campaignIds.length) return map;
    const rows = await this.recipientRepository.query(
      `SELECT r."campaignId", ${STATS_SELECT} FROM whatsapp_campaign_recipients r WHERE r."campaignId" = ANY($1::uuid[]) GROUP BY r."campaignId"`,
      [campaignIds],
    );
    for (const row of rows) map.set(row.campaignId, toStats(row));
    return map;
  }

  private async accessibleStores(userId: string, organizationId: string | undefined) {
    const { organization, stores } = await this.organizationsService.listStoresForUser(userId, organizationId);
    return { organization, storeIds: stores.map((store) => store.id) };
  }

  private async findAccessible(userId: string, organizationId: string | undefined, id: string) {
    const { organization, storeIds } = await this.accessibleStores(userId, organizationId);
    const campaign = await this.campaignRepository.findOne({ where: { id, organizationId: organization.id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.storeIds.some((storeId) => storeIds.includes(storeId))) throw new ForbiddenException('This campaign targets branches outside your access');
    return campaign;
  }

  private toPublic(campaign: WhatsAppCampaign) {
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      connectionId: campaign.connectionId,
      templateId: campaign.templateId,
      templateName: campaign.templateName,
      templateLanguage: campaign.templateLanguage,
      templateCategory: campaign.templateCategory,
      createdByName: campaign.createdByName,
      storeIds: campaign.storeIds,
      audience: campaign.audience,
      sourceRecords: campaign.sourceRecords,
      duplicatesRemoved: campaign.duplicatesRemoved,
      optedOutSkipped: campaign.optedOutSkipped,
      totalRecipients: campaign.totalRecipients,
      lastError: campaign.lastError,
      scheduledAt: campaign.scheduledAt,
      messagesPerSecond: campaign.messagesPerSecond,
      createdAt: campaign.createdAt,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
    };
  }
}

function pickHeaderMedia(media: Record<string, any>) {
  const keep = ['id', 'link', 'file', 'mimeType', 'filename', 'type'] as const;
  return Object.fromEntries(keep.filter((key) => media[key]).map((key) => [key, String(media[key])]));
}

function errorText(error: any) {
  const response = error?.getResponse?.();
  const message = (typeof response === 'object' && response?.message) || error?.message || 'Send failed';
  return String(Array.isArray(message) ? message.join(' · ') : message).slice(0, 1000);
}

/** Normalizes pasted test numbers (05…, +966…, Arabic digits), dropping invalid ones and repeats. */
export function parseTestPhones(values: string[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const value of values) {
    const phone = normalizePhoneNumber(String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (phone.length < 10 || phone.length > 15) continue;
    if (seen.has(phone)) duplicates += 1;
    else seen.add(phone);
  }
  return { phones: [...seen], duplicates };
}
