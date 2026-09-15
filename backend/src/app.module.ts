import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StoresModule } from './modules/stores/stores.module';
import { EventsModule } from './modules/events/events.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CustomersModule } from './modules/customers/customers.module';
import { FlowsModule } from './modules/flows/flows.module';
import { User } from './modules/users/entities/user.entity';
import { Store } from './modules/stores/entities/store.entity';
import { Channel } from './modules/channels/entities/channel.entity';
import { Review } from './modules/reviews/entities/review.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { Customer } from './modules/customers/entities/customer.entity';
import { CustomerCategory } from './modules/customers/entities/customer-category.entity';
import { CustomerTag } from './modules/customers/entities/customer-tag.entity';
import { Flow } from './modules/flows/entities/flow.entity';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { Organization } from './modules/organizations/entities/organization.entity';
import { OrganizationMember } from './modules/organizations/entities/organization-member.entity';
import { StoreMember } from './modules/organizations/entities/store-member.entity';
import { MetaWhatsAppModule } from './modules/meta-whatsapp/meta-whatsapp.module';
import { MetaWhatsAppConnection } from './modules/meta-whatsapp/entities/meta-whatsapp-connection.entity';
import { WhatsAppTemplate } from './modules/meta-whatsapp/entities/whatsapp-template.entity';
import { BillingModule } from './modules/billing/billing.module';
import { BillingPlan } from './modules/billing/entities/billing-plan.entity';
import { Subscription } from './modules/billing/entities/subscription.entity';
import { Wallet } from './modules/billing/entities/wallet.entity';
import { WalletTransaction } from './modules/billing/entities/wallet-transaction.entity';
import { PaymentMethod } from './modules/billing/entities/payment-method.entity';
import { BillingPayment } from './modules/billing/entities/billing-payment.entity';
import { PricingRule } from './modules/billing/entities/pricing-rule.entity';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [User, Store, Channel, Review, Notification, Customer, CustomerCategory, CustomerTag, Flow, Organization, OrganizationMember, StoreMember, MetaWhatsAppConnection, WhatsAppTemplate, BillingPlan, Subscription, Wallet, WalletTransaction, PaymentMethod, BillingPayment, PricingRule],
        synchronize: configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
      }),
    }),
    OrganizationsModule,
    AuthModule,
    UsersModule,
    StoresModule,
    EventsModule,
    ChannelsModule,
    MetaWhatsAppModule,
    BillingModule,
    WebhooksModule,
    ConversationsModule,
    AiModule,
    ReviewsModule,
    NotificationsModule,
    CustomersModule,
    FlowsModule,
  ],
})
export class AppModule {}
