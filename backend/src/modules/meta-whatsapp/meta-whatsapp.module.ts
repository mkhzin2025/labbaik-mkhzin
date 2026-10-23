import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaWhatsAppConnection } from './entities/meta-whatsapp-connection.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { WhatsAppCampaign } from './entities/whatsapp-campaign.entity';
import { WhatsAppCampaignRecipient } from './entities/whatsapp-campaign-recipient.entity';
import { Channel } from '../channels/entities/channel.entity';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import { WhatsAppCampaignsController } from './whatsapp-campaigns.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsModule } from '../channels/channels.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CustomersModule } from '../customers/customers.module';
import { EventsModule } from '../events/events.module';
import { BillingModule } from '../billing/billing.module';
import { MetaTemplatePayloadBuilder } from './services/meta-template-payload.builder';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaWhatsAppConnection, WhatsAppTemplate, WhatsAppCampaign, WhatsAppCampaignRecipient, Channel]),
    OrganizationsModule,
    ChannelsModule,
    ConversationsModule,
    CustomersModule,
    EventsModule,
    BillingModule,
  ],
  providers: [MetaWhatsAppService, MetaTemplatePayloadBuilder, WhatsAppCampaignsService],
  controllers: [MetaWhatsAppController, WhatsAppCampaignsController],
  exports: [MetaWhatsAppService, MetaTemplatePayloadBuilder, WhatsAppCampaignsService],
})
export class MetaWhatsAppModule {}

