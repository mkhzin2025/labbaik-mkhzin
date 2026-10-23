import type { Branch } from '../customers/BranchSelector';

export type AudienceMode = 'all' | 'segment' | 'manual';

export type AudienceState = {
  mode: AudienceMode;
  categoryIds: string[];
  tagIds: string[];
  tagMatch: 'any' | 'all';
  excludeCategoryIds: string[];
  excludeTagIds: string[];
  /** manual mode: hand-picked customers */
  manualIds: string[];
  /** all/segment modes: customers unticked in the review list */
  excludedIds: string[];
};

export type AudienceOption = { id: string; name: string; color: string; scope: 'organization' | 'store'; storeId: string | null; customers: number };
export type AudienceOptions = { categories: AudienceOption[]; tags: AudienceOption[] };

export type AudienceSummary = {
  records: number;
  optedOut: number;
  duplicates: number;
  recipients: number;
  byBranch: { storeId: string; storeName: string; recipients: number }[];
  overLimit: boolean;
  limit: number;
};


export const emptyAudience = (): AudienceState => ({
  mode: 'all', categoryIds: [], tagIds: [], tagMatch: 'any', excludeCategoryIds: [], excludeTagIds: [], manualIds: [], excludedIds: [],
});

/** Whether the audience is complete enough to count or send. */
export function audienceReady(state: AudienceState) {
  if (state.mode === 'manual') return state.manualIds.length > 0;
  if (state.mode === 'segment') return Boolean(state.categoryIds.length || state.tagIds.length || state.excludeCategoryIds.length || state.excludeTagIds.length);
  return true;
}

/** The audience as the API expects it (summary + send). */
export function audiencePayload(state: AudienceState, storeIds: string[]) {
  const base = { mode: state.mode, storeIds };
  if (state.mode === 'manual') return { ...base, customerIds: state.manualIds };
  const payload: Record<string, unknown> = { ...base, excludeCustomerIds: state.excludedIds.length ? state.excludedIds : undefined };
  if (state.mode === 'segment') {
    Object.assign(payload, {
      categoryIds: state.categoryIds,
      tagIds: state.tagIds,
      tagMatch: state.tagMatch,
      excludeCategoryIds: state.excludeCategoryIds,
      excludeTagIds: state.excludeTagIds,
    });
  }
  return payload;
}

/** Plain-language description, e.g. "فرع الرياض · فئة: VIP أو جديد · لديه كل التاقات: #مسابقة و #عمر 10". */
export function describeAudience(state: AudienceState, storeIds: string[], branches: Branch[], options: AudienceOptions) {
  const branchNames = branches.filter((b) => storeIds.includes(b.id)).map((b) => b.name);
  const parts = [branchNames.length === branches.length && branches.length > 1 ? 'كل الفروع' : branchNames.join('، ')];
  const names = (ids: string[], items: AudienceOption[], prefix = '') => items.filter((i) => ids.includes(i.id)).map((i) => `${prefix}${i.name}`);
  if (state.mode === 'segment') {
    if (state.categoryIds.length) parts.push(`الفئة: ${names(state.categoryIds, options.categories).join(' أو ')}`);
    if (state.tagIds.length) parts.push(`${state.tagMatch === 'all' ? 'لديه كل التاقات' : 'التاق'}: ${names(state.tagIds, options.tags, '#').join(state.tagMatch === 'all' ? ' و ' : ' أو ')}`);
    const excluded = [...names(state.excludeCategoryIds, options.categories), ...names(state.excludeTagIds, options.tags, '#')];
    if (excluded.length) parts.push(`باستثناء: ${excluded.join('، ')}`);
  }
  if (state.mode === 'manual') parts.push(`اختيار يدوي (${state.manualIds.length})`);
  else if (state.excludedIds.length) parts.push(`مع استبعاد ${state.excludedIds.length} عميل يدويًا`);
  return parts.filter(Boolean).join(' · ');
}
