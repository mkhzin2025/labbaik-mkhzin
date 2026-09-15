import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import {
  AdminWalletAdjustmentDto,
  AssignSubscriptionDto,
  CreatePlanDto,
  CreateTopUpIntentDto,
  RegisterCheckoutDto,
  SavedCardTopUpDto,
  SetDefaultPaymentMethodDto,
  SubscribeDto,
  UpdatePlanDto,
  UpdatePricingRuleDto,
  VerifyPaymentDto,
  WalletSettingsDto,
} from './dto/billing.dto';
import { PlatformAdminGuard } from './guards/platform-admin.guard';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('summary')
  summary(@Request() req: any) {
    return this.billing.getSummary(req.user.id, req.user.organizationId);
  }

  @Get('plans')
  plans() {
    return this.billing.listPublicPlans();
  }

  @Patch('wallet/settings')
  walletSettings(@Request() req: any, @Body() dto: WalletSettingsDto) {
    return this.billing.updateWalletSettings(req.user.id, dto, req.user.organizationId);
  }

  @Post('wallet/topups/intents')
  createTopupIntent(@Request() req: any, @Body() dto: CreateTopUpIntentDto) {
    return this.billing.createTopUpIntent(req.user.id, dto.amountSar, req.user.organizationId);
  }

  @Post('wallet/topups/checkout')
  checkoutInitiated(@Request() req: any, @Body() dto: RegisterCheckoutDto) {
    return this.billing.markCheckoutInitiated(req.user.id, dto.intentId, dto.providerPaymentId, dto.providerToken, req.user.organizationId);
  }

  @Post('wallet/topups/saved-card')
  savedCardTopup(@Request() req: any, @Body() dto: SavedCardTopUpDto) {
    return this.billing.topUpWithSavedCard(req.user.id, dto, req.user.organizationId);
  }

  @Post('payments/verify')
  verifyPayment(@Request() req: any, @Body() dto: VerifyPaymentDto) {
    return this.billing.verifyPaymentForUser(req.user.id, dto.paymentId, req.user.organizationId);
  }

  @Post('payment-methods/default')
  setDefault(@Request() req: any, @Body() dto: SetDefaultPaymentMethodDto) {
    return this.billing.setDefaultPaymentMethod(req.user.id, dto.paymentMethodId, req.user.organizationId);
  }

  @Delete('payment-methods/:id')
  removePaymentMethod(@Request() req: any, @Param('id') id: string) {
    return this.billing.deletePaymentMethod(req.user.id, id, req.user.organizationId);
  }

  @Post('subscription/subscribe')
  subscribe(@Request() req: any, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(req.user.id, dto, req.user.organizationId);
  }

  @Post('subscription/cancel-at-period-end')
  cancelAtPeriodEnd(@Request() req: any, @Body('cancel') cancel: boolean) {
    return this.billing.setCancelAtPeriodEnd(req.user.id, Boolean(cancel), req.user.organizationId);
  }
}

@ApiTags('Billing Admin')
@ApiBearerAuth()
@Controller('billing/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class BillingAdminController {
  constructor(private readonly billing: BillingService) {}

  @Get('me')
  me() {
    return { isPlatformAdmin: true };
  }

  @Get('plans')
  plans() {
    return this.billing.adminListPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.billing.adminCreatePlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.adminUpdatePlan(id, dto);
  }

  @Get('organizations')
  organizations() {
    return this.billing.adminListOrganizations();
  }

  @Post('subscriptions/assign')
  assign(@Body() dto: AssignSubscriptionDto) {
    return this.billing.adminAssignSubscription(dto);
  }

  @Get('pricing-rules')
  pricingRules() {
    return this.billing.adminPricingRules();
  }

  @Patch('pricing-rules/:id')
  updatePricing(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.billing.adminUpdatePricingRule(id, dto);
  }

  @Post('wallet/adjust')
  adjustWallet(@Body() dto: AdminWalletAdjustmentDto) {
    return this.billing.adminAdjustWallet(dto);
  }

  @Post('renewals/run')
  runRenewals() {
    return this.billing.processDueRenewals();
  }
}

@ApiTags('Moyasar Webhook')
@Controller('webhooks/moyasar')
export class MoyasarWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  webhook(@Body() payload: any) {
    return this.billing.handleMoyasarWebhook(payload);
  }
}
