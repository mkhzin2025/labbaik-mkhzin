import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountDeletionRequest } from './entities/account-deletion-request.entity';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionController } from './account-deletion.controller';
import { User } from '../users/entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { ConfigModule } from '@nestjs/config';
import { PlatformAdminGuard } from '../billing/guards/platform-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountDeletionRequest, User, OrganizationMember]),
    ConfigModule,
  ],
  providers: [AccountDeletionService, PlatformAdminGuard],
  controllers: [AccountDeletionController],
  exports: [AccountDeletionService],
})
export class AccountDeletionModule {}

