import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { BillingPlan } from './entities/billing-plan.entity';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionCategory,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import { PaymentMethod, PaymentMethodStatus } from './entities/payment-method.entity';
import {
  BillingPayment,
  BillingPaymentStatus,
  BillingPaymentType,
} from './entities/billing-payment.entity';
import { MetaUsageType, PricingRule } from './entities/pricing-rule.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Store } from '../stores/entities/store.entity';
import { MetaConnectionMode, MetaWhatsAppConnection } from '../meta-whatsapp/entities/meta-whatsapp-connection.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { CredentialEncryptionService } from '../channels/credential-encryption.service';
import {
  AdminWalletAdjustmentDto,
  AssignSubscriptionDto,
  CreatePlanDto,
  SavedCardTopUpDto,
  SubscribeDto,
  UpdatePlanDto,
  UpdatePricingRuleDto,
  WalletSettingsDto,
} from './dto/billing.dto';

const MICROS_PER_SAR = 1_000_000;
const MICROS_PER_HALALA = 10_000;

export class InsufficientWalletBalanceException extends HttpException {
  constructor(requiredSar: number, balanceSar: number) {
    super({
      statusCode: 402,
      code: 'INSUFFICIENT_WALLET_BALANCE',
      message: 'رصيد محفظة لبيك غير كافٍ لإتمام العملية',
      requiredSar,
      balanceSar,
    }, 402);
  }
}

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(BillingPlan) private readonly planRepo: Repository<BillingPlan>,
    @InjectRepository(Subscription) private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(PaymentMethod) private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(BillingPayment) private readonly paymentRepo: Repository<BillingPayment>,
    @InjectRepository(PricingRule) private readonly pricingRepo: Repository<PricingRule>,
    @InjectRepository(Organization) private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(MetaWhatsAppConnection) private readonly metaConnectionRepo: Repository<MetaWhatsAppConnection>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly organizationsService: OrganizationsService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlans();
    await this.seedDefaultPricing();
  }

  // ---------- Customer billing dashboard ----------

  async getSummary(userId: string, organizationId?: string) {
    const organization = await this.organizationsService.getForUser(userId, organizationId);
    await this.ensureOrganizationBilling(organization.id);
    const [subscription, wallet, paymentMethods, transactions, payments, pricingRules] = await Promise.all([
      this.subscriptionRepo.findOne({ where: { organizationId: organization.id }, relations: ['plan', 'paymentMethod'] }),
      this.walletRepo.findOne({ where: { organizationId: organization.id } }),
      this.paymentMethodRepo.find({ where: { organizationId: organization.id }, order: { isDefault: 'DESC', createdAt: 'DESC' } }),
      this.walletTxRepo.find({ where: { organizationId: organization.id }, order: { createdAt: 'DESC' }, take: 50 }),
      this.paymentRepo.find({ where: { organizationId: organization.id }, order: { createdAt: 'DESC' }, take: 30 }),
      this.pricingRepo.find({ where: { isActive: true }, order: { usageType: 'ASC' } }),
    ]);
    return {
      organization,
      subscription,
      wallet: wallet ? this.publicWallet(wallet) : null,
      paymentMethods: paymentMethods.map((method) => this.publicPaymentMethod(method)),
      transactions: transactions.map((tx) => this.publicWalletTransaction(tx)),
      payments,
      pricingRules: pricingRules.map((rule) => ({ ...rule, priceSar: this.microsToSar(rule.priceMicros) })),
      moyasar: {
        publishableKey: this.getMoyasarPublishableKey(),
        configured: Boolean(this.getMoyasarPublishableKey() && this.getMoyasarSecretKey()),
      },
    };
  }

  async listPublicPlans() {
    return this.planRepo.find({ where: { isActive: true, isPublic: true }, order: { sortOrder: 'ASC', monthlyPriceMinor: 'ASC' } });
  }

  async updateWalletSettings(userId: string, dto: WalletSettingsDto, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const wallet = await this.ensureWallet(organization.id);
    if (dto.autoRechargeEnabled !== undefined) wallet.autoRechargeEnabled = dto.autoRechargeEnabled;
    if (dto.autoRechargeThresholdSar !== undefined) wallet.autoRechargeThresholdMicros = this.sarToMicros(dto.autoRechargeThresholdSar);
    if (dto.autoRechargeAmountSar !== undefined) wallet.autoRechargeAmountMicros = this.sarToMicros(dto.autoRechargeAmountSar);
    if (dto.lowBalanceThresholdSar !== undefined) wallet.lowBalanceThresholdMicros = this.sarToMicros(dto.lowBalanceThresholdSar);
    await this.walletRepo.save(wallet);
    return this.publicWallet(wallet);
  }

  async createTopUpIntent(userId: string, amountSar: number, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    await this.ensureOrganizationBilling(organization.id);
    this.assertMoyasarConfigured();
    const amountMinor = Math.round(amountSar * 100);
    const providerPaymentId = randomUUID();
    const localPayment = await this.paymentRepo.save(this.paymentRepo.create({
      organizationId: organization.id,
      type: BillingPaymentType.WALLET_TOPUP,
      status: BillingPaymentStatus.CREATED,
      amountMinor,
      currency: 'SAR',
      providerPaymentId,
      metadata: { source: 'new_card_checkout' },
    }));
    return {
      intentId: localPayment.id,
      providerPaymentId,
      amountMinor,
      currency: 'SAR',
      publishableKey: this.getMoyasarPublishableKey(),
      callbackUrl: this.buildFrontendCallbackUrl(providerPaymentId),
      description: `Labbaik wallet top-up ${organization.name}`,
    };
  }

  async markCheckoutInitiated(userId: string, intentId: string, providerPaymentId: string, _providerToken: string | undefined, organizationId?: string) {
    const organization = await this.organizationsService.getForUser(userId, organizationId);
    const payment = await this.paymentRepo.findOne({ where: { id: intentId, organizationId: organization.id } });
    if (!payment) throw new NotFoundException('Billing payment intent not found');
    if (payment.providerPaymentId !== providerPaymentId) throw new BadRequestException('Moyasar payment ID does not match billing intent');
    if (payment.status === BillingPaymentStatus.PAID) return payment;
    payment.status = BillingPaymentStatus.INITIATED;
    return this.paymentRepo.save(payment);
  }

  async verifyPaymentForUser(userId: string, providerPaymentId: string, organizationId?: string) {
    const organization = await this.organizationsService.getForUser(userId, organizationId);
    const payment = await this.paymentRepo.findOne({ where: { providerPaymentId, organizationId: organization.id } });
    if (!payment) throw new NotFoundException('Billing payment not found');
    return this.finalizeMoyasarPayment(providerPaymentId);
  }

  async topUpWithSavedCard(userId: string, dto: SavedCardTopUpDto, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const method = await this.requireActivePaymentMethod(organization.id, dto.paymentMethodId);
    return this.createTokenCharge({
      organizationId: organization.id,
      paymentMethod: method,
      amountMinor: Math.round(dto.amountSar * 100),
      type: BillingPaymentType.WALLET_TOPUP,
      idempotencyKey: `manual-topup:${organization.id}:${randomUUID()}`,
    });
  }

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const method = await this.requireActivePaymentMethod(organization.id, paymentMethodId);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PaymentMethod).update({ organizationId: organization.id }, { isDefault: false });
      await manager.getRepository(PaymentMethod).update({ id: method.id }, { isDefault: true });
    });
    return { success: true };
  }

  async deletePaymentMethod(userId: string, paymentMethodId: string, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const method = await this.paymentMethodRepo.createQueryBuilder('method')
      .addSelect('method.providerTokenEncrypted')
      .where('method.id = :id AND method.organizationId = :organizationId', { id: paymentMethodId, organizationId: organization.id })
      .getOne();
    if (!method) throw new NotFoundException('Payment method not found');
    const token = this.encryption.decryptSecret(method.providerTokenEncrypted);
    if (token) {
      try {
        await axios.delete(`https://api.moyasar.com/v1/tokens/${encodeURIComponent(token)}`, this.moyasarAuthConfig());
      } catch (error: any) {
        this.logger.warn(`Could not delete Moyasar token ${method.id}: ${error?.response?.data?.message || error.message}`);
      }
    }
    method.status = PaymentMethodStatus.INACTIVE;
    method.isDefault = false;
    await this.paymentMethodRepo.save(method);
    await this.subscriptionRepo.update({ organizationId: organization.id, paymentMethodId: method.id }, { paymentMethodId: null, autoRenew: false });
    return { success: true };
  }

  async subscribe(userId: string, dto: SubscribeDto, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const plan = await this.planRepo.findOne({ where: { id: dto.planId, isActive: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.ensureOrganizationBilling(organization.id);

    if (plan.monthlyPriceMinor === 0) {
      return this.activateSubscription(organization.id, plan, dto.paymentMethodId || null, null);
    }

    const method = await this.requireActivePaymentMethod(organization.id, dto.paymentMethodId);
    const result = await this.createTokenCharge({
      organizationId: organization.id,
      paymentMethod: method,
      amountMinor: plan.monthlyPriceMinor,
      type: BillingPaymentType.SUBSCRIPTION,
      planId: plan.id,
      idempotencyKey: `subscription:${organization.id}:${plan.id}:${randomUUID()}`,
    });
    return result;
  }

  async setCancelAtPeriodEnd(userId: string, cancel: boolean, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const subscription = await this.subscriptionRepo.findOne({ where: { organizationId: organization.id } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    subscription.cancelAtPeriodEnd = cancel;
    if (cancel) subscription.autoRenew = false;
    await this.subscriptionRepo.save(subscription);
    return subscription;
  }

  // ---------- Meta Labbaik wallet charging ----------

  async assertMetaLabbaikReady(organizationId: string) {
    await this.ensureOrganizationBilling(organizationId);
    const subscription = await this.requireActiveSubscription(organizationId);
    if (!subscription.plan?.features?.metaLabbaik) {
      throw new ForbiddenException('الباقة الحالية لا تشمل خيار Meta لبيك');
    }
    const methodCount = await this.paymentMethodRepo.count({ where: { organizationId, status: PaymentMethodStatus.ACTIVE } });
    if (!methodCount) {
      throw new HttpException({ statusCode: 402, code: 'PAYMENT_METHOD_REQUIRED', message: 'يجب حفظ بطاقة دفع فعالة قبل تفعيل Meta لبيك' }, 402);
    }
    const wallet = await this.ensureWallet(organizationId);
    if (wallet.balanceMicros <= 0) {
      throw new InsufficientWalletBalanceException(0.000001, 0);
    }
    return { subscription, wallet };
  }

  async chargeMetaUsageForStore(storeId: string, usageType: MetaUsageType, metadata: Record<string, any> = {}) {
    const connection = await this.metaConnectionRepo.findOne({ where: { storeId } });
    if (!connection || connection.mode !== MetaConnectionMode.SHARED_APP) return null;
    await this.requireActiveSubscription(connection.organizationId, true);
    const rule = await this.pricingRepo.findOne({ where: { usageType, isActive: true } });
    if (!rule || rule.priceMicros <= 0) return null;

    const idempotencyKey = metadata.idempotencyKey || `meta-usage:${connection.organizationId}:${randomUUID()}`;
    let wallet = await this.ensureWallet(connection.organizationId);
    if (wallet.balanceMicros < rule.priceMicros && wallet.autoRechargeEnabled) {
      await this.tryAutoRecharge(connection.organizationId, Math.max(wallet.autoRechargeAmountMicros, rule.priceMicros - wallet.balanceMicros));
      wallet = await this.ensureWallet(connection.organizationId);
    }

    const transaction = await this.debitWallet(connection.organizationId, rule.priceMicros, {
      idempotencyKey,
      referenceType: usageType,
      referenceId: metadata.referenceId || null,
      metadata: { ...metadata, storeId, priceRuleId: rule.id, usageType },
    });

    const updatedWallet = await this.ensureWallet(connection.organizationId);
    if (updatedWallet.autoRechargeEnabled && updatedWallet.balanceMicros <= updatedWallet.autoRechargeThresholdMicros) {
      void this.tryAutoRecharge(connection.organizationId, updatedWallet.autoRechargeAmountMicros).catch((error) => {
        this.logger.warn(`Auto recharge failed for ${connection.organizationId}: ${error.message}`);
      });
    }
    return transaction;
  }

  async refundMetaUsage(transactionId: string, reason: string) {
    const original = await this.walletTxRepo.findOne({ where: { id: transactionId } });
    if (!original || original.type !== WalletTransactionType.DEBIT) return null;
    return this.creditWallet(original.organizationId, original.amountMicros, WalletTransactionCategory.REFUND, {
      idempotencyKey: `refund:${transactionId}`,
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      metadata: { originalTransactionId: transactionId, reason },
      type: WalletTransactionType.REFUND,
    });
  }

  getTemplateUsageType(category?: string | null) {
    switch (String(category || '').toUpperCase()) {
      case 'MARKETING': return MetaUsageType.TEMPLATE_MARKETING;
      case 'UTILITY': return MetaUsageType.TEMPLATE_UTILITY;
      case 'AUTHENTICATION': return MetaUsageType.TEMPLATE_AUTHENTICATION;
      default: return MetaUsageType.TEMPLATE_OTHER;
    }
  }

  // ---------- Platform administration ----------

  async adminListPlans() {
    return this.planRepo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async adminCreatePlan(dto: CreatePlanDto) {
    const exists = await this.planRepo.findOne({ where: { code: dto.code.trim().toLowerCase() } });
    if (exists) throw new BadRequestException('Plan code already exists');
    return this.planRepo.save(this.planRepo.create({
      ...dto,
      code: dto.code.trim().toLowerCase(),
      currency: dto.currency || 'SAR',
      trialDays: dto.trialDays || 0,
      limits: dto.limits || {},
      features: dto.features || {},
      isActive: dto.isActive ?? true,
      isPublic: dto.isPublic ?? true,
      sortOrder: dto.sortOrder || 0,
    }));
  }

  async adminUpdatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    Object.assign(plan, dto);
    if (dto.code) plan.code = dto.code.trim().toLowerCase();
    return this.planRepo.save(plan);
  }

  async adminListOrganizations() {
    const organizations = await this.organizationRepo.find({ order: { createdAt: 'DESC' } });
    const result: any[] = [];
    for (const organization of organizations) {
      await this.ensureOrganizationBilling(organization.id);
      const [subscription, wallet, methods] = await Promise.all([
        this.subscriptionRepo.findOne({ where: { organizationId: organization.id }, relations: ['plan'] }),
        this.walletRepo.findOne({ where: { organizationId: organization.id } }),
        this.paymentMethodRepo.count({ where: { organizationId: organization.id, status: PaymentMethodStatus.ACTIVE } }),
      ]);
      result.push({ organization, subscription, wallet: wallet ? this.publicWallet(wallet) : null, activePaymentMethods: methods });
    }
    return result;
  }

  async adminAssignSubscription(dto: AssignSubscriptionDto) {
    const organization = await this.organizationRepo.findOne({ where: { id: dto.organizationId } });
    const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
    if (!organization || !plan) throw new NotFoundException('Organization or plan not found');
    const method = dto.paymentMethodId ? await this.requireActivePaymentMethod(organization.id, dto.paymentMethodId) : null;
    const now = new Date();
    const periodEnd = dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : this.addMonths(now, 1);
    const existingSubscription = await this.subscriptionRepo.findOne({
      where: { organizationId: organization.id },
    });
    const subscription: Subscription = existingSubscription ?? this.subscriptionRepo.create({
      organizationId: organization.id,
    });
    subscription.planId = plan.id;
    subscription.status = Object.values(SubscriptionStatus).includes(dto.status as SubscriptionStatus) ? dto.status as SubscriptionStatus : SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd;
    subscription.trialEndsAt = null;
    subscription.graceEndsAt = null;
    subscription.autoRenew = dto.autoRenew ?? Boolean(method && plan.monthlyPriceMinor > 0);
    subscription.cancelAtPeriodEnd = false;
    subscription.paymentMethodId = method?.id || null;
    return this.subscriptionRepo.save(subscription);
  }

  async adminPricingRules() {
    return this.pricingRepo.find({ order: { usageType: 'ASC' } });
  }

  async adminUpdatePricingRule(id: string, dto: UpdatePricingRuleDto) {
    const rule = await this.pricingRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    rule.priceMicros = this.sarToMicros(dto.priceSar);
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    return this.pricingRepo.save(rule);
  }

  async adminAdjustWallet(dto: AdminWalletAdjustmentDto) {
    if (dto.amountSar === 0) throw new BadRequestException('Adjustment amount cannot be zero');
    const micros = this.sarToMicros(Math.abs(dto.amountSar));
    if (dto.amountSar > 0) {
      return this.creditWallet(dto.organizationId, micros, WalletTransactionCategory.ADMIN, {
        idempotencyKey: `admin-adjust:${randomUUID()}`,
        metadata: { reason: dto.reason },
        type: WalletTransactionType.CREDIT,
      });
    }
    return this.debitWallet(dto.organizationId, micros, {
      idempotencyKey: `admin-adjust:${randomUUID()}`,
      referenceType: 'admin_adjustment',
      metadata: { reason: dto.reason },
      type: WalletTransactionType.DEBIT,
      category: WalletTransactionCategory.ADMIN,
    });
  }

  // ---------- Payment provider webhook ----------

  async handleMoyasarWebhook(payload: any) {
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET');
    if (expected && payload?.secret_token !== expected) throw new ForbiddenException('Invalid Moyasar webhook secret');
    const type = String(payload?.type || '');
    const paymentId = payload?.data?.id;
    if (!paymentId || !type.startsWith('payment_')) return { received: true };

    // Moyasar recommends returning 2xx before lengthy business processing.
    // Payment finalization remains idempotent, so callback verification can recover if the process restarts.
    setImmediate(() => {
      this.processMoyasarWebhookEvent(type, paymentId, payload.data).catch((error) => {
        this.logger.error(`Moyasar webhook processing failed for ${paymentId}: ${error.message}`);
      });
    });
    return { received: true };
  }

  private async processMoyasarWebhookEvent(type: string, paymentId: string, data: any) {
    if (['payment_paid', 'payment_captured'].includes(type)) {
      await this.finalizeMoyasarPayment(paymentId, data);
      return;
    }
    if (type === 'payment_refunded') {
      await this.processMoyasarRefund(paymentId, data);
      return;
    }
    if (['payment_failed', 'payment_abandoned', 'payment_voided'].includes(type)) {
      const payment = await this.paymentRepo.findOne({ where: { providerPaymentId: paymentId } });
      if (payment && payment.status !== BillingPaymentStatus.PAID && payment.status !== BillingPaymentStatus.REFUNDED) {
        payment.status = BillingPaymentStatus.FAILED;
        payment.providerStatus = data?.status || type;
        await this.paymentRepo.save(payment);
        if ([BillingPaymentType.SUBSCRIPTION, BillingPaymentType.SUBSCRIPTION_RENEWAL].includes(payment.type)) {
          await this.markSubscriptionPastDue(payment.organizationId);
        }
      }
    }
  }

  private async processMoyasarRefund(paymentId: string, data: any) {
    const payment = await this.paymentRepo.findOne({ where: { providerPaymentId: paymentId } });
    if (!payment || payment.status === BillingPaymentStatus.REFUNDED) return;

    // Wallet top-ups are reversed even if the balance has already been consumed.
    // A negative balance represents money owed to Labbaik and blocks further paid usage
    // until the organization tops up again.
    if ([BillingPaymentType.WALLET_TOPUP, BillingPaymentType.AUTO_TOPUP].includes(payment.type)) {
      await this.forceDebitWallet(payment.organizationId, payment.amountMinor * MICROS_PER_HALALA, {
        idempotencyKey: `payment-refund:${paymentId}`,
        referenceType: 'billing_payment_refund',
        referenceId: payment.id,
        metadata: { providerPaymentId: paymentId, providerStatus: data?.status || 'refunded' },
      });
    }

    if ([BillingPaymentType.SUBSCRIPTION, BillingPaymentType.SUBSCRIPTION_RENEWAL].includes(payment.type)) {
      const subscription = await this.subscriptionRepo.findOne({ where: { organizationId: payment.organizationId } });
      if (subscription) {
        subscription.status = SubscriptionStatus.SUSPENDED;
        subscription.autoRenew = false;
        subscription.graceEndsAt = null;
        await this.subscriptionRepo.save(subscription);
      }
    }

    payment.status = BillingPaymentStatus.REFUNDED;
    payment.providerStatus = data?.status || 'refunded';
    payment.metadata = { ...payment.metadata, refundedAt: new Date().toISOString() };
    await this.paymentRepo.save(payment);
  }

  // ---------- Subscription renewals ----------

  async processDueRenewals() {
    const due = await this.subscriptionRepo.createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .leftJoinAndSelect('subscription.paymentMethod', 'paymentMethod')
      .where('subscription.status IN (:...statuses)', { statuses: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] })
      .andWhere('subscription.autoRenew = true')
      .andWhere('subscription.cancelAtPeriodEnd = false')
      .andWhere('subscription.currentPeriodEnd <= :now', { now: new Date() })
      .getMany();

    for (const subscription of due) {
      if (!subscription.plan) continue;
      const renewalKey = `renewal:${subscription.id}:${subscription.currentPeriodEnd.toISOString().slice(0, 10)}`;
      const existing = await this.paymentRepo.findOne({ where: { idempotencyKey: renewalKey } });
      if (existing?.status === BillingPaymentStatus.PAID) continue;
      if (subscription.plan.monthlyPriceMinor === 0) {
        await this.advanceSubscriptionPeriod(subscription);
        continue;
      }
      if (!subscription.paymentMethodId) {
        await this.markSubscriptionPastDue(subscription.organizationId);
        continue;
      }
      try {
        const method = await this.requireActivePaymentMethod(subscription.organizationId, subscription.paymentMethodId);
        await this.createTokenCharge({
          organizationId: subscription.organizationId,
          paymentMethod: method,
          amountMinor: subscription.plan.monthlyPriceMinor,
          type: BillingPaymentType.SUBSCRIPTION_RENEWAL,
          planId: subscription.planId,
          idempotencyKey: renewalKey,
        });
      } catch (error: any) {
        this.logger.warn(`Subscription renewal failed ${subscription.id}: ${error.message}`);
        await this.markSubscriptionPastDue(subscription.organizationId);
      }
    }
    return { processed: due.length };
  }

  // ---------- Internal helpers ----------

  private async seedDefaultPlans() {
    const defaults: Partial<BillingPlan>[] = [
      {
        code: 'free', nameAr: 'تجريبية', nameEn: 'Free', monthlyPriceMinor: 0, currency: 'SAR', trialDays: 0,
        limits: { stores: 1, agents: 2, channels: 1, monthlyMessages: 500, monthlyAiReplies: 100 },
        features: { metaLabbaik: false, ownMeta: true, ai: true, flows: false, analytics: false },
        isActive: true, isPublic: true, sortOrder: 0,
      },
      {
        code: 'starter', nameAr: 'البداية', nameEn: 'Starter', monthlyPriceMinor: 19900, currency: 'SAR', trialDays: 0,
        limits: { stores: 1, agents: 5, channels: 3, monthlyMessages: 10000, monthlyAiReplies: 3000 },
        features: { metaLabbaik: true, ownMeta: true, ai: true, flows: true, analytics: true },
        isActive: true, isPublic: true, sortOrder: 10,
      },
      {
        code: 'business', nameAr: 'الأعمال', nameEn: 'Business', monthlyPriceMinor: 49900, currency: 'SAR', trialDays: 0,
        limits: { stores: 5, agents: 25, channels: 15, monthlyMessages: 50000, monthlyAiReplies: 15000 },
        features: { metaLabbaik: true, ownMeta: true, ai: true, flows: true, analytics: true },
        isActive: true, isPublic: true, sortOrder: 20,
      },
    ];
    for (const item of defaults) {
      const exists = await this.planRepo.findOne({ where: { code: item.code! } });
      if (!exists) await this.planRepo.save(this.planRepo.create(item));
    }
  }

  private async seedDefaultPricing() {
    const generic = Number(this.config.get<string>('BILLING_DEFAULT_META_RATE_SAR') || '0.05');
    const defaults: Array<[MetaUsageType, string, string]> = [
      [MetaUsageType.SESSION_TEXT, 'رسالة واتساب نصية عبر Meta لبيك', 'BILLING_META_SESSION_TEXT_RATE_SAR'],
      [MetaUsageType.INTERACTIVE, 'رسالة واتساب تفاعلية عبر Meta لبيك', 'BILLING_META_INTERACTIVE_RATE_SAR'],
      [MetaUsageType.TEMPLATE_MARKETING, 'قالب واتساب تسويقي عبر Meta لبيك', 'BILLING_META_MARKETING_RATE_SAR'],
      [MetaUsageType.TEMPLATE_UTILITY, 'قالب واتساب خدمي عبر Meta لبيك', 'BILLING_META_UTILITY_RATE_SAR'],
      [MetaUsageType.TEMPLATE_AUTHENTICATION, 'قالب واتساب تحقق عبر Meta لبيك', 'BILLING_META_AUTH_RATE_SAR'],
      [MetaUsageType.TEMPLATE_OTHER, 'قالب واتساب آخر عبر Meta لبيك', 'BILLING_META_OTHER_RATE_SAR'],
    ];
    for (const [usageType, nameAr, envName] of defaults) {
      const exists = await this.pricingRepo.findOne({ where: { usageType } });
      if (!exists) {
        const price = Number(this.config.get<string>(envName) || generic);
        await this.pricingRepo.save(this.pricingRepo.create({ usageType, nameAr, priceMicros: this.sarToMicros(price), currency: 'SAR', isActive: true }));
      }
    }
  }

  private async ensureOrganizationBilling(organizationId: string) {
    await this.ensureWallet(organizationId);
    let subscription = await this.subscriptionRepo.findOne({ where: { organizationId }, relations: ['plan'] });
    if (!subscription) {
      const free = await this.planRepo.findOne({ where: { code: 'free' } }) || (await this.planRepo.find({ order: { monthlyPriceMinor: 'ASC' }, take: 1 }))[0];
      if (!free) throw new BadRequestException('No billing plans are configured');
      const now = new Date();
      subscription = await this.subscriptionRepo.save(this.subscriptionRepo.create({
        organizationId,
        planId: free.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: this.addMonths(now, 1),
        trialEndsAt: null,
        graceEndsAt: null,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        paymentMethodId: null,
      }));
      subscription.plan = free;
    }
    return subscription;
  }

  private async ensureWallet(organizationId: string) {
    let wallet = await this.walletRepo.findOne({ where: { organizationId } });
    if (!wallet) {
      wallet = await this.walletRepo.save(this.walletRepo.create({ organizationId, balanceMicros: 0, currency: 'SAR' }));
    }
    return wallet;
  }

  private async requireActiveSubscription(organizationId: string, requireMetaLabbaik = false) {
    await this.ensureOrganizationBilling(organizationId);
    const subscription = await this.subscriptionRepo.findOne({ where: { organizationId }, relations: ['plan'] });
    if (!subscription?.plan) throw new ForbiddenException('لا يوجد اشتراك فعال');
    const now = Date.now();
    const periodValid = new Date(subscription.currentPeriodEnd).getTime() > now;
    const graceValid = subscription.graceEndsAt && new Date(subscription.graceEndsAt).getTime() > now;
    const statusValid = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(subscription.status) || (subscription.status === SubscriptionStatus.PAST_DUE && graceValid);
    if (!statusValid || (!periodValid && !graceValid)) throw new HttpException({ statusCode: 402, code: 'SUBSCRIPTION_REQUIRED', message: 'الاشتراك غير فعال أو منتهي' }, 402);
    if (requireMetaLabbaik && !subscription.plan.features?.metaLabbaik) throw new ForbiddenException('الباقة الحالية لا تشمل Meta لبيك');
    return subscription;
  }

  private async requireActivePaymentMethod(organizationId: string, paymentMethodId?: string | null) {
    let method: PaymentMethod | null = null;
    if (paymentMethodId) method = await this.paymentMethodRepo.findOne({ where: { id: paymentMethodId, organizationId, status: PaymentMethodStatus.ACTIVE } });
    else method = await this.paymentMethodRepo.findOne({ where: { organizationId, status: PaymentMethodStatus.ACTIVE, isDefault: true } });
    if (!method) throw new HttpException({ statusCode: 402, code: 'PAYMENT_METHOD_REQUIRED', message: 'لا توجد بطاقة دفع محفوظة وفعالة' }, 402);
    return method;
  }

  private async createTokenCharge(input: {
    organizationId: string;
    paymentMethod: PaymentMethod;
    amountMinor: number;
    type: BillingPaymentType;
    planId?: string;
    idempotencyKey: string;
  }) {
    this.assertMoyasarConfigured();
    const existing = await this.paymentRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return this.paymentResult(existing);

    const method = await this.paymentMethodRepo.createQueryBuilder('method')
      .addSelect('method.providerTokenEncrypted')
      .where('method.id = :id', { id: input.paymentMethod.id })
      .getOne();
    if (!method) throw new NotFoundException('Payment method not found');
    const token = this.encryption.decryptSecret(method.providerTokenEncrypted);
    if (!token) throw new BadRequestException('Payment method token is unavailable');

    const providerPaymentId = randomUUID();
    let local = await this.paymentRepo.save(this.paymentRepo.create({
      organizationId: input.organizationId,
      type: input.type,
      status: BillingPaymentStatus.CREATED,
      amountMinor: input.amountMinor,
      currency: 'SAR',
      providerPaymentId,
      paymentMethodId: method.id,
      planId: input.planId || null,
      idempotencyKey: input.idempotencyKey,
      metadata: { source: 'saved_card' },
    }));

    try {
      const response = await axios.post('https://api.moyasar.com/v1/payments', {
        given_id: providerPaymentId,
        amount: input.amountMinor,
        currency: 'SAR',
        description: input.type.includes('subscription') ? 'Labbaik subscription' : 'Labbaik wallet top-up',
        callback_url: this.buildFrontendCallbackUrl(providerPaymentId),
        source: { type: 'token', token },
        metadata: { local_billing_payment_id: local.id, organization_id: input.organizationId },
      }, this.moyasarAuthConfig());
      local.status = response.data?.status === 'paid' ? BillingPaymentStatus.PAID : BillingPaymentStatus.INITIATED;
      local.providerStatus = response.data?.status || null;
      local.metadata = { ...local.metadata, transactionUrl: response.data?.source?.transaction_url || null };
      await this.paymentRepo.save(local);
      if (response.data?.status === 'paid') return this.finalizeMoyasarPayment(providerPaymentId, response.data);
      return this.paymentResult(local);
    } catch (error: any) {
      local.status = BillingPaymentStatus.FAILED;
      local.providerStatus = error?.response?.data?.message || 'failed';
      await this.paymentRepo.save(local);
      throw new BadRequestException(error?.response?.data?.message || 'فشلت عملية الدفع عبر ميسر');
    }
  }

  private async finalizeMoyasarPayment(providerPaymentId: string, suppliedPayment?: any) {
    const local = await this.paymentRepo.findOne({ where: { providerPaymentId } });
    if (!local) return { ignored: true, reason: 'unknown_payment' };
    if (local.status === BillingPaymentStatus.PAID) return this.paymentResult(local);

    const remote = suppliedPayment || await this.fetchMoyasarPayment(providerPaymentId);
    if (remote?.status !== 'paid') {
      local.status = remote?.status === 'failed' ? BillingPaymentStatus.FAILED : BillingPaymentStatus.INITIATED;
      local.providerStatus = remote?.status || null;
      await this.paymentRepo.save(local);
      return this.paymentResult(local);
    }
    if (Number(remote.amount) !== local.amountMinor || String(remote.currency || '').toUpperCase() !== local.currency) {
      throw new BadRequestException('Moyasar payment amount or currency does not match billing intent');
    }

    const method = await this.savePaymentMethodFromRemote(local.organizationId, remote);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(BillingPayment).createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.id = :id', { id: local.id })
        .getOne();
      if (!locked || locked.status === BillingPaymentStatus.PAID) return;
      locked.status = BillingPaymentStatus.PAID;
      locked.providerStatus = remote.status;
      locked.paidAt = new Date();
      if (method) locked.paymentMethodId = method.id;
      await manager.getRepository(BillingPayment).save(locked);
    });

    if ([BillingPaymentType.WALLET_TOPUP, BillingPaymentType.AUTO_TOPUP].includes(local.type)) {
      await this.creditWallet(local.organizationId, local.amountMinor * MICROS_PER_HALALA, local.type === BillingPaymentType.AUTO_TOPUP ? WalletTransactionCategory.AUTO_TOPUP : WalletTransactionCategory.TOPUP, {
        idempotencyKey: `payment-credit:${providerPaymentId}`,
        referenceType: 'billing_payment',
        referenceId: local.id,
        metadata: { providerPaymentId },
      });
    }

    if ([BillingPaymentType.SUBSCRIPTION, BillingPaymentType.SUBSCRIPTION_RENEWAL].includes(local.type)) {
      const plan = local.planId ? await this.planRepo.findOne({ where: { id: local.planId } }) : null;
      if (!plan) throw new BadRequestException('Subscription plan missing for payment');
      if (local.type === BillingPaymentType.SUBSCRIPTION_RENEWAL) {
        const subscription = await this.subscriptionRepo.findOne({ where: { organizationId: local.organizationId } });
        if (subscription) {
          subscription.planId = plan.id;
          subscription.paymentMethodId = method?.id || local.paymentMethodId;
          subscription.status = SubscriptionStatus.ACTIVE;
          subscription.graceEndsAt = null;
          subscription.lastProviderPaymentId = providerPaymentId;
          await this.advanceSubscriptionPeriod(subscription);
        }
      } else {
        await this.activateSubscription(local.organizationId, plan, method?.id || local.paymentMethodId, providerPaymentId);
      }
    }

    const refreshed = await this.paymentRepo.findOne({ where: { id: local.id } });
    return this.paymentResult(refreshed || local);
  }

  private async savePaymentMethodFromRemote(organizationId: string, payment: any) {
    const providerToken = payment?.source?.token;
    if (!providerToken) return null;
    let tokenInfo: any = null;
    try {
      const response = await axios.get(`https://api.moyasar.com/v1/tokens/${encodeURIComponent(providerToken)}`, this.moyasarAuthConfig());
      tokenInfo = response.data;
    } catch (error: any) {
      this.logger.warn(`Could not fetch Moyasar token details: ${error?.response?.data?.message || error.message}`);
    }
    if (tokenInfo && tokenInfo.status && tokenInfo.status !== 'active') return null;

    const hash = createHash('sha256').update(providerToken).digest('hex');
    let method = await this.paymentMethodRepo.findOne({ where: { organizationId, providerTokenHash: hash } });
    const activeCount = await this.paymentMethodRepo.count({ where: { organizationId, status: PaymentMethodStatus.ACTIVE } });
    if (!method) method = this.paymentMethodRepo.create({ organizationId, providerTokenHash: hash, providerTokenEncrypted: this.encryption.encryptSecret(providerToken)! });
    method.providerTokenEncrypted = this.encryption.encryptSecret(providerToken)!;
    method.status = PaymentMethodStatus.ACTIVE;
    method.brand = tokenInfo?.brand || payment?.source?.company || payment?.source?.brand || null;
    method.funding = tokenInfo?.funding || null;
    method.lastFour = tokenInfo?.last_four || String(payment?.source?.number || '').slice(-4) || null;
    method.expiryMonth = tokenInfo?.month ? String(tokenInfo.month) : null;
    method.expiryYear = tokenInfo?.year ? String(tokenInfo.year) : null;
    method.holderName = tokenInfo?.name || payment?.source?.name || null;
    if (activeCount === 0) method.isDefault = true;
    return this.paymentMethodRepo.save(method);
  }

  private async activateSubscription(organizationId: string, plan: BillingPlan, paymentMethodId: string | null, providerPaymentId: string | null) {
    const now = new Date();
    const existingSubscription = await this.subscriptionRepo.findOne({ where: { organizationId } });
    const subscription: Subscription = existingSubscription ?? this.subscriptionRepo.create({
      organizationId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: this.addMonths(now, 1),
      trialEndsAt: null,
      graceEndsAt: null,
      autoRenew: false,
      cancelAtPeriodEnd: false,
      paymentMethodId: null,
      lastProviderPaymentId: null,
    });

    subscription.planId = plan.id;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = this.addMonths(now, 1);
    subscription.trialEndsAt = null;
    subscription.graceEndsAt = null;
    subscription.autoRenew = plan.monthlyPriceMinor > 0 && Boolean(paymentMethodId);
    subscription.cancelAtPeriodEnd = false;
    subscription.paymentMethodId = paymentMethodId;
    subscription.lastProviderPaymentId = providerPaymentId;
    await this.subscriptionRepo.save(subscription);
    return this.subscriptionRepo.findOne({ where: { organizationId }, relations: ['plan', 'paymentMethod'] });
  }

  private async advanceSubscriptionPeriod(subscription: Subscription) {
    const start = new Date(Math.max(Date.now(), new Date(subscription.currentPeriodEnd).getTime()));
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = this.addMonths(start, 1);
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.graceEndsAt = null;
    subscription.lastProviderPaymentId = subscription.lastProviderPaymentId || null;
    await this.subscriptionRepo.save(subscription);
    return subscription;
  }

  private async markSubscriptionPastDue(organizationId: string) {
    const subscription = await this.subscriptionRepo.findOne({ where: { organizationId } });
    if (!subscription) return;
    subscription.status = SubscriptionStatus.PAST_DUE;
    subscription.graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await this.subscriptionRepo.save(subscription);
  }

  private async tryAutoRecharge(organizationId: string, amountMicros: number) {
    const wallet = await this.ensureWallet(organizationId);
    if (!wallet.autoRechargeEnabled) return null;
    const method = await this.paymentMethodRepo.findOne({ where: { organizationId, status: PaymentMethodStatus.ACTIVE, isDefault: true } });
    if (!method) return null;
    const bucket = new Date().toISOString().slice(0, 16);
    const amountMinor = Math.max(100, Math.ceil(amountMicros / MICROS_PER_HALALA));
    return this.createTokenCharge({
      organizationId,
      paymentMethod: method,
      amountMinor,
      type: BillingPaymentType.AUTO_TOPUP,
      idempotencyKey: `auto-topup:${organizationId}:${bucket}`,
    });
  }

  private async debitWallet(organizationId: string, amountMicros: number, input: {
    idempotencyKey: string;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, any>;
    type?: WalletTransactionType;
    category?: WalletTransactionCategory;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(WalletTransaction);
      const existing = await txRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
      let wallet = await manager.getRepository(Wallet).createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!wallet) {
        wallet = await manager.getRepository(Wallet).save(manager.getRepository(Wallet).create({ organizationId, balanceMicros: 0, currency: 'SAR' }));
      }
      if (wallet.balanceMicros < amountMicros) {
        throw new InsufficientWalletBalanceException(this.microsToSar(amountMicros), this.microsToSar(wallet.balanceMicros));
      }
      const before = wallet.balanceMicros;
      wallet.balanceMicros -= amountMicros;
      await manager.getRepository(Wallet).save(wallet);
      return txRepo.save(txRepo.create({
        walletId: wallet.id,
        organizationId,
        type: input.type || WalletTransactionType.DEBIT,
        category: input.category || WalletTransactionCategory.META_USAGE,
        amountMicros,
        balanceBeforeMicros: before,
        balanceAfterMicros: wallet.balanceMicros,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId || null,
        metadata: input.metadata || {},
      }));
    });
  }

  private async forceDebitWallet(organizationId: string, amountMicros: number, input: {
    idempotencyKey: string;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, any>;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(WalletTransaction);
      const existing = await txRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
      let wallet = await manager.getRepository(Wallet).createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!wallet) wallet = await manager.getRepository(Wallet).save(manager.getRepository(Wallet).create({ organizationId, balanceMicros: 0, currency: 'SAR' }));
      const before = wallet.balanceMicros;
      wallet.balanceMicros -= amountMicros;
      await manager.getRepository(Wallet).save(wallet);
      return txRepo.save(txRepo.create({
        walletId: wallet.id,
        organizationId,
        type: WalletTransactionType.DEBIT,
        category: WalletTransactionCategory.REFUND,
        amountMicros,
        balanceBeforeMicros: before,
        balanceAfterMicros: wallet.balanceMicros,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId || null,
        metadata: input.metadata || {},
      }));
    });
  }

  private async creditWallet(organizationId: string, amountMicros: number, category: WalletTransactionCategory, input: {
    idempotencyKey: string;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, any>;
    type?: WalletTransactionType;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(WalletTransaction);
      const existing = await txRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
      let wallet = await manager.getRepository(Wallet).createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!wallet) wallet = await manager.getRepository(Wallet).save(manager.getRepository(Wallet).create({ organizationId, balanceMicros: 0, currency: 'SAR' }));
      const before = wallet.balanceMicros;
      wallet.balanceMicros += amountMicros;
      await manager.getRepository(Wallet).save(wallet);
      return txRepo.save(txRepo.create({
        walletId: wallet.id,
        organizationId,
        type: input.type || WalletTransactionType.CREDIT,
        category,
        amountMicros,
        balanceBeforeMicros: before,
        balanceAfterMicros: wallet.balanceMicros,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId || null,
        metadata: input.metadata || {},
      }));
    });
  }

  private async fetchMoyasarPayment(paymentId: string) {
    this.assertMoyasarConfigured();
    const response = await axios.get(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentId)}`, this.moyasarAuthConfig());
    return response.data;
  }

  private moyasarAuthConfig() {
    return { auth: { username: this.getMoyasarSecretKey(), password: '' }, headers: { 'Content-Type': 'application/json' }, timeout: 20000 } as any;
  }

  private getMoyasarPublishableKey() {
    return this.config.get<string>('MOYASAR_PUBLISHABLE_KEY') || '';
  }

  private getMoyasarSecretKey() {
    return this.config.get<string>('MOYASAR_SECRET_KEY') || '';
  }

  private assertMoyasarConfigured() {
    if (!this.getMoyasarPublishableKey() || !this.getMoyasarSecretKey()) throw new BadRequestException('Moyasar API keys are not configured');
  }

  private buildFrontendCallbackUrl(providerPaymentId: string) {
    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/$/, '');
    return `${base}/dashboard/billing?payment_id=${encodeURIComponent(providerPaymentId)}`;
  }

  private paymentResult(payment: BillingPayment) {
    return {
      payment,
      requiresRedirect: payment.status === BillingPaymentStatus.INITIATED && Boolean(payment.metadata?.transactionUrl),
      redirectUrl: payment.metadata?.transactionUrl || null,
    };
  }

  private publicWallet(wallet: Wallet) {
    return {
      ...wallet,
      balanceSar: this.microsToSar(wallet.balanceMicros),
      autoRechargeThresholdSar: this.microsToSar(wallet.autoRechargeThresholdMicros),
      autoRechargeAmountSar: this.microsToSar(wallet.autoRechargeAmountMicros),
      lowBalanceThresholdSar: this.microsToSar(wallet.lowBalanceThresholdMicros),
    };
  }

  private publicPaymentMethod(method: PaymentMethod) {
    const { providerTokenEncrypted: _hidden, ...publicMethod } = method as any;
    return publicMethod;
  }

  private publicWalletTransaction(tx: WalletTransaction) {
    return {
      ...tx,
      amountSar: this.microsToSar(tx.amountMicros),
      balanceBeforeSar: this.microsToSar(tx.balanceBeforeMicros),
      balanceAfterSar: this.microsToSar(tx.balanceAfterMicros),
    };
  }

  private sarToMicros(value: number) {
    return Math.round(Number(value) * MICROS_PER_SAR);
  }

  private microsToSar(value: number) {
    return Math.round((Number(value || 0) / MICROS_PER_SAR) * 1_000_000) / 1_000_000;
  }

  private addMonths(value: Date, months: number) {
    const result = new Date(value);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
