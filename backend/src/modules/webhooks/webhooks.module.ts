import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { EventsModule } from '../events/events.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ChannelsModule } from '../channels/channels.module';
import { CustomersModule } from '../customers/customers.module';
import { FlowsModule } from '../flows/flows.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ConfigModule, EventsModule, ConversationsModule, ChannelsModule, CustomersModule, FlowsModule, AiModule],
  providers: [WebhooksService],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
