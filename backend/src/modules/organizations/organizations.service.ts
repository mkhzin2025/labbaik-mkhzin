import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Organization } from './entities/organization.entity';
import { OrganizationMember, OrganizationRole } from './entities/organization-member.entity';
import { StoreMember, StoreMemberRole } from './entities/store-member.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { MEMBER_ROLES, memberRoleOf, sectionsFor, seesAllBranches } from './roles';
import type { MemberRole } from './roles';
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

    const orgName = organizationName?.trim() || (user.fullName ? `${user.fullName} Workspace` : 'Tael Bot Workspace');
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
      name: user.fullName ? `${user.fullName} Workspace` : 'Tael Bot Workspace',
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

  // --- Team members ---

  /** The caller's role and the dashboard sections it opens; the frontend shapes navigation from it. */
  async getAccess(userId: string, organizationId?: string) {
    const { organization, membership } = await this.getMembership(userId, organizationId);
    return { organization: { id: organization.id, name: organization.name }, role: memberRoleOf(membership.role), sections: sectionsFor(membership.role) };
  }

  async listMembers(actorUserId: string, organizationId?: string) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    const members = await this.memberRepository.find({ where: { organizationId: organization.id }, relations: ['user'], order: { createdAt: 'ASC' } });
    const orgStoreIds = new Set((await this.listStoresByOrganization(organization.id)).map((store) => store.id));
    const assignments = members.length
      ? await this.storeMemberRepository.find({ where: { userId: In(members.map((member) => member.userId)) } })
      : [];
    return members.map((member) => ({
      userId: member.userId,
      fullName: member.user?.fullName || '',
      email: member.user?.email || '',
      role: memberRoleOf(member.role),
      // null = every branch (owners and admins)
      storeIds: seesAllBranches(member.role)
        ? null
        : assignments.filter((row) => row.userId === member.userId && orgStoreIds.has(row.storeId)).map((row) => row.storeId),
      isYou: member.userId === actorUserId,
      createdAt: member.createdAt,
    }));
  }

  /**
   * Creates the member's login (the admin sets the first password) and gives them their branches.
   * An email that already has an account is refused: logins resolve to a single organization.
   */
  async addMember(actorUserId: string, organizationId: string | undefined, dto: { fullName?: string; email?: string; password?: string; role?: string; storeIds?: string[] }) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    const fullName = String(dto.fullName || '').trim();
    const email = String(dto.email || '').trim().toLowerCase();
    const role = this.parseMemberRole(dto.role);
    if (!fullName) throw new BadRequestException('اكتب اسم العضو.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('اكتب بريدًا إلكترونيًا صحيحًا.');
    this.assertPassword(dto.password);

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      const alreadyMember = await this.memberRepository.findOne({ where: { userId: existing.id, organizationId: organization.id } });
      throw new ConflictException(alreadyMember ? 'هذا البريد عضو في فريقك بالفعل.' : 'هذا البريد مسجّل بحساب آخر في المنصة. استخدم بريدًا مختلفًا.');
    }

    const storeIds = await this.resolveMemberStores(organization.id, role, dto.storeIds);
    const userId = await this.memberRepository.manager.transaction(async (manager) => {
      const user = await manager.save(manager.create(User, {
        email,
        fullName,
        password: await bcrypt.hash(String(dto.password), 10),
        role: UserRole.EMPLOYEE,
      }));
      await manager.save(manager.create(OrganizationMember, { organizationId: organization.id, userId: user.id, role }));
      if (storeIds.length) {
        await manager.save(storeIds.map((storeId) => manager.create(StoreMember, { storeId, userId: user.id, role: StoreMemberRole.AGENT })));
      }
      return user.id;
    });
    return (await this.listMembers(actorUserId, organization.id)).find((member) => member.userId === userId);
  }

  async updateMember(actorUserId: string, organizationId: string | undefined, targetUserId: string, dto: { fullName?: string; password?: string; role?: string; storeIds?: string[] }) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    const member = await this.memberRepository.findOne({ where: { userId: targetUserId, organizationId: organization.id }, relations: ['user'] });
    if (!member) throw new NotFoundException('العضو غير موجود في فريقك.');
    if (member.role === OrganizationRole.OWNER) throw new ForbiddenException('لا يمكن تعديل مالك المنظمة.');
    if (dto.role !== undefined && targetUserId === actorUserId) throw new ForbiddenException('لا يمكنك تغيير صلاحيتك بنفسك.');

    const role = dto.role !== undefined ? this.parseMemberRole(dto.role) : member.role;
    if (dto.password !== undefined) this.assertPassword(dto.password);
    const fullName = dto.fullName !== undefined ? String(dto.fullName).trim() : undefined;
    if (fullName === '') throw new BadRequestException('اكتب اسم العضو.');
    const branchesChange = dto.storeIds !== undefined || role !== member.role;
    const storeIds = branchesChange ? await this.resolveMemberStores(organization.id, role, dto.storeIds) : [];

    await this.memberRepository.manager.transaction(async (manager) => {
      await manager.update(OrganizationMember, { id: member.id }, { role });
      const userPatch: Partial<User> = {};
      if (fullName) userPatch.fullName = fullName;
      if (dto.password !== undefined) userPatch.password = await bcrypt.hash(String(dto.password), 10);
      if (Object.keys(userPatch).length) await manager.update(User, { id: targetUserId }, userPatch);
      if (branchesChange) {
        const orgStoreIds = (await this.listStoresByOrganization(organization.id)).map((store) => store.id);
        if (orgStoreIds.length) await manager.delete(StoreMember, { userId: targetUserId, storeId: In(orgStoreIds) });
        if (storeIds.length) {
          await manager.save(storeIds.map((storeId) => manager.create(StoreMember, { storeId, userId: targetUserId, role: StoreMemberRole.AGENT })));
        }
      }
    });
    return (await this.listMembers(actorUserId, organization.id)).find((row) => row.userId === targetUserId);
  }

  /** Removes the member and their login, so the email can be used again. */
  async removeMember(actorUserId: string, organizationId: string | undefined, targetUserId: string) {
    const { organization } = await this.assertCanManageMembers(actorUserId, organizationId);
    if (targetUserId === actorUserId) throw new ForbiddenException('لا يمكنك حذف نفسك من الفريق.');
    const member = await this.memberRepository.findOne({ where: { userId: targetUserId, organizationId: organization.id } });
    if (!member) throw new NotFoundException('العضو غير موجود في فريقك.');
    if (member.role === OrganizationRole.OWNER) throw new ForbiddenException('لا يمكن حذف مالك المنظمة.');

    await this.memberRepository.manager.transaction(async (manager) => {
      const otherMemberships = await manager.count(OrganizationMember, { where: { userId: targetUserId } });
      const ownsStores = await manager.count(Store, { where: { owner: { id: targetUserId } } });
      if (otherMemberships > 1 || ownsStores > 0) {
        // Keep an account that still belongs elsewhere; only take it out of this organization.
        const orgStoreIds = (await this.listStoresByOrganization(organization.id)).map((store) => store.id);
        if (orgStoreIds.length) await manager.delete(StoreMember, { userId: targetUserId, storeId: In(orgStoreIds) });
        await manager.delete(OrganizationMember, { id: member.id });
        return;
      }
      await manager.query('DELETE FROM notifications WHERE "userId" = $1', [targetUserId]);
      await manager.delete(User, { id: targetUserId }); // memberships and branch assignments cascade
    });
    return { success: true };
  }

  private parseMemberRole(value?: string): OrganizationRole {
    const role = MEMBER_ROLES[value as MemberRole];
    if (!role) throw new BadRequestException('اختر صلاحية العضو: مدير، دعم، أو حملات.');
    return role;
  }

  private assertPassword(password?: string) {
    if (String(password || '').length < 8) throw new BadRequestException('كلمة المرور 8 أحرف على الأقل.');
  }

  /** Branch ids for a role: none for admins (they see all), the chosen ones, or every branch when none are chosen. */
  private async resolveMemberStores(organizationId: string, role: OrganizationRole, requested?: string[]) {
    if (seesAllBranches(role)) return [];
    const orgStoreIds = (await this.listStoresByOrganization(organizationId)).map((store) => store.id);
    const chosen = [...new Set((requested || []).filter(Boolean))];
    if (chosen.some((id) => !orgStoreIds.includes(id))) throw new BadRequestException('أحد الفروع المختارة لا يتبع منظمتك.');
    return chosen.length ? chosen : orgStoreIds;
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
