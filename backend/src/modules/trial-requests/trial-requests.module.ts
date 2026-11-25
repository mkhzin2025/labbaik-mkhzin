import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TrialRequest } from './trial-request.entity';
import { TrialRequestsController } from './trial-requests.controller';
import { TrialRequestsService } from './trial-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrialRequest]), ConfigModule, OrganizationsModule],
  providers: [TrialRequestsService],
  controllers: [TrialRequestsController],
})
export class TrialRequestsModule {}
