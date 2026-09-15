import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerCategory } from './entities/customer-category.entity';
import { CustomerTag } from './entities/customer-tag.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerCategory, CustomerTag]),
    OrganizationsModule,
  ],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
