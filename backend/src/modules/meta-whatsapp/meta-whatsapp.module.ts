import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaWhatsAppConnection } from './entities/meta-whatsapp-connection.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { Channel } from '../channels/entities/channel.entity';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsModule } from '../channels/channels.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { BillingModule } from '../billing/billing.module';
import { MetaTemplatePayloadBuilder } from './services/meta-template-payload.builder';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaWhatsAppConnection, WhatsAppTemplate, Channel]),
    OrganizationsModule,
    ChannelsModule,
    ConversationsModule,
    CustomersModule,
    EventsModule,
    BillingModule,
  ],
  providers: [MetaWhatsAppService, MetaTemplatePayloadBuilder],
  controllers: [MetaWhatsAppController],
  exports: [MetaWhatsAppService, MetaTemplatePayloadBuilder],
})
export class MetaWhatsAppModule {}

