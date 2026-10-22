import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerCategory } from './entities/customer-category.entity';
import { CustomerTag } from './entities/customer-tag.entity';
import { CompetitionSyncState } from './entities/competition-sync-state.entity';
import { CustomersService } from './customers.service';
import { CompetitionSyncService } from './competition-sync.service';
import { CustomersController } from './customers.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerCategory, CustomerTag, CompetitionSyncState]),
    OrganizationsModule,
  ],
  providers: [CustomersService, CompetitionSyncService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
