import { OrganizationRole } from './entities/organization-member.entity';
import { memberRoleOf, SECTIONS, sectionsFor, seesAllBranches } from './roles';

describe('team roles', () => {
  it('gives owners and admins every section and every branch', () => {
    expect(sectionsFor(OrganizationRole.OWNER)).toEqual(SECTIONS);
    expect(sectionsFor(OrganizationRole.ADMIN)).toEqual(SECTIONS);
    expect(seesAllBranches(OrganizationRole.ADMIN)).toBe(true);
  });

  it('limits support staff to home, conversations and reviews', () => {
    expect([...sectionsFor(OrganizationRole.AGENT)]).toEqual(['home', 'conversations', 'reviews']);
    expect(memberRoleOf(OrganizationRole.SUPERVISOR)).toBe('support');
    expect(seesAllBranches(OrganizationRole.AGENT)).toBe(false);
  });

  it('limits campaign staff to flows and WhatsApp templates and campaigns', () => {
    expect([...sectionsFor(OrganizationRole.MARKETING)]).toEqual(['flows', 'whatsapp']);
    expect(sectionsFor(OrganizationRole.MARKETING)).not.toContain('team');
  });
});
