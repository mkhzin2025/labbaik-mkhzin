import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './entities/channel.entity';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { StoresModule } from '../stores/stores.module';
import { MessagingService } from './messaging.service';
import { Store } from '../stores/entities/store.entity';
import { CredentialEncryptionService } from './credential-encryption.service';
import { WhatsAppMediaService } from './whatsapp-media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Store]), // Added Store entity here
    StoresModule,
  ],
  providers: [ChannelsService, MessagingService, CredentialEncryptionService, WhatsAppMediaService],
  controllers: [ChannelsController],
  exports: [ChannelsService, MessagingService, CredentialEncryptionService, WhatsAppMediaService],
})
export class ChannelsModule {}
