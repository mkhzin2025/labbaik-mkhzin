import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { StoreChatController } from './store-chat.controller';
import { StoreChatService } from './store-chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StoreChatController],
  providers: [StoreChatService],
})
export class StoreChatModule {}
