import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { StoreMember } from './entities/store-member.entity';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';

// Global so every controller can use the Access guard, which reads the caller's organization role.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Organization, OrganizationMember, StoreMember, User, Store])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
