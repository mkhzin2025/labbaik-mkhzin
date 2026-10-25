import { OrganizationRole } from './entities/organization-member.entity';

/** Dashboard areas a team member can be allowed into. */
export const SECTIONS = ['home', 'conversations', 'reviews', 'customers', 'flows', 'whatsapp', 'channels', 'analytics', 'billing', 'settings', 'team'] as const;
export type Section = (typeof SECTIONS)[number];

/** Roles offered when adding a member, and the stored organization role behind each. */
export const MEMBER_ROLES = { admin: OrganizationRole.ADMIN, support: OrganizationRole.AGENT, marketing: OrganizationRole.MARKETING } as const;
export type MemberRole = keyof typeof MEMBER_ROLES;

export function memberRoleOf(role: OrganizationRole): MemberRole | 'owner' {
  if (role === OrganizationRole.OWNER) return 'owner';
  if (role === OrganizationRole.ADMIN) return 'admin';
  if (role === OrganizationRole.MARKETING) return 'marketing';
  return 'support'; // agent, and the older supervisor role
}

const ROLE_SECTIONS: Record<MemberRole | 'owner', readonly Section[]> = {
  owner: SECTIONS,
  admin: SECTIONS,
  support: ['home', 'conversations', 'reviews'],
  marketing: ['flows', 'whatsapp'],
};

export function sectionsFor(role: OrganizationRole): readonly Section[] {
  return ROLE_SECTIONS[memberRoleOf(role)];
}

/** Owners and admins see every branch; other roles only the branches assigned to them. */
export const seesAllBranches = (role: OrganizationRole) => role === OrganizationRole.OWNER || role === OrganizationRole.ADMIN;
