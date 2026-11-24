import { OrganizationRole } from './entities/organization-member.entity';
import { editsFlows, memberRoleOf, SECTIONS, sectionsFor, seesAllBranches } from './roles';

describe('team roles', () => {
  it('gives owners and admins every section and every branch', () => {
    expect(sectionsFor(OrganizationRole.OWNER)).toEqual(SECTIONS);
    expect(sectionsFor(OrganizationRole.ADMIN)).toEqual(SECTIONS);
    expect(seesAllBranches(OrganizationRole.ADMIN)).toBe(true);
  });

  it('limits support staff to home, conversations, reviews and flows', () => {
    expect([...sectionsFor(OrganizationRole.AGENT)]).toEqual(['home', 'conversations', 'reviews', 'flows']);
    expect(memberRoleOf(OrganizationRole.SUPERVISOR)).toBe('support');
    expect(seesAllBranches(OrganizationRole.AGENT)).toBe(false);
  });

  it('limits campaign staff to flows and WhatsApp templates and campaigns', () => {
    expect([...sectionsFor(OrganizationRole.MARKETING)]).toEqual(['flows', 'whatsapp']);
    expect(sectionsFor(OrganizationRole.MARKETING)).not.toContain('team');
  });

  it('shows flows read-only to support staff unless they were given flow editing', () => {
    expect(editsFlows({ role: OrganizationRole.AGENT, canEditFlows: false })).toBe(false);
    expect(editsFlows({ role: OrganizationRole.SUPERVISOR })).toBe(false);
    expect(editsFlows({ role: OrganizationRole.AGENT, canEditFlows: true })).toBe(true);
    expect(editsFlows({ role: OrganizationRole.MARKETING, canEditFlows: false })).toBe(true);
    expect(editsFlows({ role: OrganizationRole.ADMIN, canEditFlows: false })).toBe(true);
  });
});
