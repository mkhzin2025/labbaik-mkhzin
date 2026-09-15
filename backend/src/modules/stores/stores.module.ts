import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Store]), OrganizationsModule],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService], // Export service to be used in other modules like Channels
})
export class StoresModule {}
