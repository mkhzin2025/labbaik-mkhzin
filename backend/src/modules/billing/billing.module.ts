import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingPlan } from './entities/billing-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { BillingPayment } from './entities/billing-payment.entity';
import { PricingRule } from './entities/pricing-rule.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Store } from '../stores/entities/store.entity';
import { MetaWhatsAppConnection } from '../meta-whatsapp/entities/meta-whatsapp-connection.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsModule } from '../channels/channels.module';
import { BillingService } from './billing.service';
import { BillingAdminController, BillingController, MoyasarWebhookController } from './billing.controller';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { BillingRenewalService } from './billing-renewal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingPlan,
      Subscription,
      Wallet,
      WalletTransaction,
      PaymentMethod,
      BillingPayment,
      PricingRule,
      Organization,
      Store,
      MetaWhatsAppConnection,
    ]),
    OrganizationsModule,
    ChannelsModule,
  ],
  providers: [BillingService, PlatformAdminGuard, BillingRenewalService],
  controllers: [BillingController, BillingAdminController, MoyasarWebhookController],
  exports: [BillingService],
})
export class BillingModule {}
