/**
 * Which branch a WhatsApp customer picked in the bot, read from their own messages.
 * Same rules as scripts/transfer-main-to-branches/transfer.js.
 */

export type DistributionBranch = { id: string; name: string };
export type BranchPick = { storeId: string; how: 'menu' | 'name' | 'offers' };

type PickMessage = { from?: string; type?: string; text?: string; timestamp?: unknown };

// "عروض <region>" only identifies a branch when the region has exactly one (Riyadh and Jeddah have several).
const OFFER_REGIONS: Record<string, string> = { 'تبوك': 'تبوك', 'القصيم': 'بريدة', 'حفر الباطن': 'حفر الباطن' };

export const lettersOnly = (text: unknown) => String(text || '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const fromCustomer = (m: PickMessage) => m.from !== 'me' && m.from !== 'system' && m.type !== 'system_error';

/**
 * Latest branch the customer picked, by strength: "فرع [حي] X" menu reply > bare "X" > "عروض <single-branch region>".
 * Free text that merely mentions a city ("وظائف في تبوك") is ignored.
 */
export function pickBranch(messages: PickMessage[] | undefined, branches: DistributionBranch[]): BranchPick | null {
  const cleaned = branches.map((branch) => ({ id: branch.id, clean: lettersOnly(branch.name) }));
  const latestFirst = (messages || []).filter(fromCustomer)
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  let bare: BranchPick | null = null;
  let offers: BranchPick | null = null;
  for (const message of latestFirst) {
    const text = lettersOnly(message.text).replace(/^فرع\s*حي\s*/, 'فرع ');
    for (const branch of cleaned) {
      if (text === `فرع ${branch.clean}` || text === `فرع${branch.clean}`) return { storeId: branch.id, how: 'menu' };
      if (!bare && text === branch.clean) bare = { storeId: branch.id, how: 'name' };
    }
    if (!offers) {
      const region = Object.keys(OFFER_REGIONS).find((name) => text === `عروض ${name}`);
      const branch = region && cleaned.find((item) => item.clean === OFFER_REGIONS[region]);
      if (branch) offers = { storeId: branch.id, how: 'offers' };
    }
  }
  return bare || offers;
}
