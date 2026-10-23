import { normalizePhoneNumber } from '../../common/utils/phone.util';
import type { CompetitionSyncStats } from './entities/competition-sync-state.entity';

/** One participant as returned by GET /api/integrations/participants on the competition site. */
export type CompetitionParticipant = {
  fullName?: string | null;
  phone?: string | null;
  branch?: string | null;
  status?: string | null;
  registrationType?: 'direct' | 'referral' | 'source' | string | null;
  ageCategory?: string | null;
};

export type PlannedCustomer = { phone: string; name: string; online: boolean; ageTag: string | null };

export const COMPETITION_CATEGORY = 'المسابقة';
export const COMPETITION_ONLINE_CATEGORY = 'المسابقة - online';
export const AGE_TAG_PREFIX = 'عمر ';

/**
 * "26 - 35" -> "عمر 26 إلى 35", "أكثر من 45" -> "عمر أكثر من 45". Ranges are spelled out because a hyphen
 * between numbers is reordered by the bidi algorithm inside Arabic text ("35 - 26").
 */
export function ageTagName(ageCategory: string | null | undefined) {
  const value = String(ageCategory || '').replace(/\s+/g, ' ').trim();
  if (!value || value === '-') return null;
  const range = value.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return `${AGE_TAG_PREFIX}${range ? `${range[1]} إلى ${range[2]}` : value}`;
}

/** "فرع حي المروة" / "المروة" / "▪️المروة" all map to the same key. */
export function branchKey(name: string | null | undefined) {
  return String(name || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^فرع\s*/, '')
    .replace(/^حي\s*/, '')
    .trim();
}

export function emptyStats(fromPage: number, toPage: number): CompetitionSyncStats {
  return {
    fromPage, toPage, pagesDone: 0, participants: 0, created: 0, renamed: 0,
    linkedDirect: 0, linkedOnline: 0, switched: 0, linkedAge: 0, cancelled: 0, invalidPhone: 0, unknownBranches: {},
  };
}

/**
 * Groups a page of participants by branch. Only REGISTERED participants with a usable phone and a known
 * branch are kept; "direct" goes to the competition category, referral/source to the online one.
 */
export function planCompetitionPage(
  items: CompetitionParticipant[],
  storeIdByBranch: Map<string, string>,
  stats: CompetitionSyncStats,
) {
  const byStore = new Map<string, Map<string, PlannedCustomer>>();
  for (const item of items) {
    stats.participants += 1;
    if (item.status !== 'REGISTERED') { stats.cancelled += 1; continue; }
    const phone = normalizePhoneNumber(item.phone);
    if (phone.length < 8 || phone.length > 15) { stats.invalidPhone += 1; continue; }
    const storeId = storeIdByBranch.get(branchKey(item.branch));
    if (!storeId) {
      const label = String(item.branch || '').trim() || 'بدون فرع';
      stats.unknownBranches[label] = (stats.unknownBranches[label] || 0) + 1;
      continue;
    }
    const customers = byStore.get(storeId) || new Map<string, PlannedCustomer>();
    customers.set(phone, {
      phone,
      name: String(item.fullName || '').trim().replace(/\s+/g, ' ').slice(0, 200),
      online: item.registrationType !== 'direct',
      ageTag: ageTagName(item.ageCategory),
    });
    byStore.set(storeId, customers);
  }
  return byStore;
}
