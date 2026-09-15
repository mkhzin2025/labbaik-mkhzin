import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Organization } from './entities/organization.entity';
import { OrganizationMember, OrganizationRole } from './entities/organization-member.entity';
import { StoreMember, StoreMemberRole } from './entities/store-member.entity';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember) private readonly memberRepository: Repository<OrganizationMember>,
    @InjectRepository(StoreMember) private readonly storeMemberRepository: Repository<StoreMember>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
  ) {}

  async createForUser(userId: string, organizationName?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const orgName = organizationName?.trim() || (user.fullName ? `${user.fullName} Workspace` : 'Labbaik Workspace');
    const base = this.slugify(orgName) || 'workspace';
    const organization = await this.organizationRepository.save(this.organizationRepository.create({
      name: orgName,
      slug: `${base}-${randomBytes(3).toString('hex')}`,
    }));

    await this.memberRepository.save(this.memberRepository.create({
      organizationId: organization.id,
      userId: user.id,
      role: OrganizationRole.OWNER,
    }));

    return organization;
  }

  async ensureForUser(userId: string) {
    const existingMember = await this.memberRepository.findOne({
      where: { userId },
      relations: ['organization'],
      order: { createdAt: 'ASC' },
    });
    if (existingMember?.organization) {
      await this.attachLegacyStores(userId, existingMember.organization.id);
      return existingMember.organization;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const base = this.slugify(user.fullName || user.email.split('@')[0]) || 'workspace';
    const organization = await this.organizationRepository.save(this.organizationRepository.create({
      name: user.fullName ? `${user.fullName} Workspace` : 'Labbaik Workspace',
      slug: `${base}-${randomBytes(3).toString('hex')}`,
    }));

    await this.memberRepository.save(this.memberRepository.create({
      organizationId: organization.id,
      userId: user.id,
      role: OrganizationRole.OWNER,
    }));

    await this.attachLegacyStores(userId, organization.id);
    return organization;
  }

  async getForUser(userId: string, organizationId?: string) {
    if (organizationId) {
      const membership = await this.memberRepository.findOne({
        where: { userId, organizationId },
        relations: ['organization'],
      });
      if (!membership?.organization) throw new NotFoundException('Organization not found');
      await this.attachLegacyStores(userId, membership.organization.id);
      return membership.organization;
    }
    return this.ensureForUser(userId);
  }

  async getMembership(userId: string, organizationId?: string) {
    const organization = await this.getForUser(userId, organizationId);
    const membership = await this.memberRepository.findOne({ where: { userId, organizationId: organization.id } });
    if (!membership) throw new NotFoundException('Organization membership not found');
    return { organization, membership };
  }

  async assertCanManageIntegrations(userId: string, organizationId?: string) {
    const { organization, membership } = await this.getMembership(userId, organizationId);
    if (![OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(membership.role)) {
      throw new ForbiddenException('Only organization owners or admins can manage integrations');
    }
    return { organization, membership };
  }

  async assertCanManageMembers(userId: string, organizationId?: string) {
    const { organization, membership } = await this.getMembership(userId, organizationId);
    if (![OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(membership.role)) {
      throw new ForbiddenException('Only organization owners or admins can manage branch memberships');
    }
    return { organization, membership };
  }

  /**
   * Owner/Admin can access every branch in the active organization.
   * Supervisor/Agent are restricted to explicit store_members rows.
   */
  async listStoresForUser(userId: string, organizationId?: string) {
    const { organization, membership } = await this.getMembership(userId, organizationId);
    let stores: Store[] = [];

    if ([OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(membership.role)) {
      stores = await this.storeRepository.find({
        where: { organizationId: organization.id },
        order: { createdAt: 'ASC' },
      });
    } else {
      const assignments = await this.storeMemberRepository.find({ where: { userId }, relations: ['store'] });
      stores = assignments
        .map((assignment) => assignment.store)
        .filter((store): store is Store => Boolean(store && store.organizationId === organization.id))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    return { organization, membership, stores };
  }

  async getStoreForUser(userId: string, organizationId?: string, storeId?: string) {
    const { organization, stores } = await this.listStoresForUser(userId, organizationId);
    let store: Store | undefined;
    if (storeId) store = stores.find((row) => row.id === storeId);
    else store = stores[0];

    if (!store) throw new ForbiddenException(storeId ? 'You do not have access to this branch' : 'No accessible branch found');
    return { organization, store };
  }

  async assertStoreAccessibleByUser(userId: string, organizationId: string | undefined, storeId: string) {
    const { stores } = await this.listStoresForUser(userId, organizationId);
    const store = stores.find((row) => row.id === storeId);
    if (!store) throw new ForbiddenException('You do not have access to this branch');
    return store;
  }

  /** Internal/system tenant validation. This does not grant a user permission. */
  async assertStoreBelongsToOrganization(organizationId: string, storeId: string) {
    const store = await this.storeRepository.findOne({ where: { id: storeId, organizationId } });
    if (!store) throw new NotFoundException('Store/branch not found in this organization');
    return store;
  }

  async listStoresByOrganization(organizationId: string) {
    return this.storeRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
  }

  async listStoreMembers(actorUserId: string, storeId: string, organizationId?: string) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    await this.assertStoreBelongsToOrganization(organization.id, storeId);
    return this.storeMemberRepository.find({ where: { storeId }, relations: ['user'], order: { createdAt: 'ASC' } });
  }

  async assignStoreMember(actorUserId: string, targetUserId: string, storeId: string, role: StoreMemberRole, organizationId?: string) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    await this.assertStoreBelongsToOrganization(organization.id, storeId);

    const targetMembership = await this.memberRepository.findOne({ where: { userId: targetUserId, organizationId: organization.id } });
    if (!targetMembership) throw new NotFoundException('User is not a member of this organization');

    let assignment = await this.storeMemberRepository.findOne({ where: { storeId, userId: targetUserId } });
    if (!assignment) assignment = this.storeMemberRepository.create({ storeId, userId: targetUserId, role });
    else assignment.role = role;
    return this.storeMemberRepository.save(assignment);
  }

  async removeStoreMember(actorUserId: string, targetUserId: string, storeId: string, organizationId?: string) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    await this.assertStoreBelongsToOrganization(organization.id, storeId);
    await this.storeMemberRepository.delete({ storeId, userId: targetUserId });
    return { success: true };
  }

  async accessibleStoreIds(userId: string, organizationId?: string) {
    const { stores } = await this.listStoresForUser(userId, organizationId);
    return stores.map((store) => store.id);
  }

  async assertRequestedStoresAccessible(userId: string, organizationId: string | undefined, requestedStoreIds?: string[]) {
    const { organization, stores } = await this.listStoresForUser(userId, organizationId);
    const allowed = new Set(stores.map((store) => store.id));
    const requested = [...new Set((requestedStoreIds || []).filter(Boolean))];
    if (!requested.length) return { organization, stores, storeIds: [...allowed] };
    const unauthorized = requested.filter((id) => !allowed.has(id));
    if (unauthorized.length) throw new ForbiddenException('One or more selected branches are not accessible to this user');
    return { organization, stores: stores.filter((store) => requested.includes(store.id)), storeIds: requested };
  }

  private async attachLegacyStores(userId: string, organizationId: string) {
    const stores = await this.storeRepository.find({ where: { owner: { id: userId } }, relations: ['owner'] });
    for (const store of stores) {
      if (!store.organizationId) {
        store.organizationId = organizationId;
        await this.storeRepository.save(store);
      }
    }
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
}
