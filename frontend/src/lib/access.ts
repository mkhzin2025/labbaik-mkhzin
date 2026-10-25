// Mirrors backend/src/modules/organizations/roles.ts. The backend enforces access; this only shapes navigation.

export type Section = 'home' | 'conversations' | 'reviews' | 'customers' | 'flows' | 'whatsapp' | 'channels' | 'analytics' | 'billing' | 'settings' | 'team';
export const ALL_SECTIONS: Section[] = ['home', 'conversations', 'reviews', 'customers', 'flows', 'whatsapp', 'channels', 'analytics', 'billing', 'settings', 'team'];
export type MemberRole = 'owner' | 'admin' | 'support' | 'marketing';

export interface Access {
  organization: { id: string; name: string };
  role: MemberRole;
  sections: Section[];
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'المالك',
  admin: 'مدير',
  support: 'دعم العملاء',
  marketing: 'الحملات',
};

const PATH_SECTIONS: [string, Section][] = [
  ['/dashboard/conversations', 'conversations'],
  ['/dashboard/customers', 'customers'],
  ['/dashboard/reviews', 'reviews'],
  ['/dashboard/flows', 'flows'],
  ['/dashboard/whatsapp-templates', 'whatsapp'],
  ['/dashboard/whatsapp-campaigns', 'whatsapp'],
  ['/dashboard/channels', 'channels'],
  ['/dashboard/analytics', 'analytics'],
  ['/dashboard/billing', 'billing'],
  ['/dashboard/settings', 'settings'],
  ['/dashboard/team', 'team'],
];

/** The section a dashboard path belongs to; null for pages outside the team model (platform admin). */
export function sectionOf(pathname: string): Section | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/dashboard') return 'home';
  const match = PATH_SECTIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}

/** Where a member lands when the page they opened is not theirs. */
export const HOME_PATHS: [Section, string][] = [
  ['home', '/dashboard'],
  ['conversations', '/dashboard/conversations'],
  ['flows', '/dashboard/flows'],
  ['whatsapp', '/dashboard/whatsapp-templates'],
  ['reviews', '/dashboard/reviews'],
];

export const firstAllowedPath = (access: Access) => HOME_PATHS.find(([section]) => access.sections.includes(section))?.[1] || '/dashboard/settings';

const CACHE_KEY = 'access';

export function readCachedAccess(): Access | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Array.isArray(value.sections) ? value : null;
  } catch {
    return null;
  }
}

export function cacheAccess(access: Access | null) {
  try {
    if (access) localStorage.setItem(CACHE_KEY, JSON.stringify(access));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* storage unavailable */ }
}
