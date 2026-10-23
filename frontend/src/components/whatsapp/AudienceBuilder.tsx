import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, FolderOpen, Loader2, MinusCircle, Search, UserRoundCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import CustomerAvatar from '../CustomerAvatar';
import Pagination from '../ui/Pagination';
import type { Branch } from '../customers/BranchSelector';
import { audienceReady, type AudienceOption, type AudienceOptions, type AudienceState } from './audience';

type Customer = { id: string; storeId: string; store?: Branch; fullName?: string; phoneNumber?: string; whatsappId?: string; marketingOptOut?: boolean; categories?: AudienceOption[]; tags?: AudienceOption[] };

export default function AudienceBuilder({
  storeIds,
  branches,
  value,
  onChange,
  options,
  optionsLoading,
}: {
  storeIds: string[];
  branches: Branch[];
  value: AudienceState;
  onChange: (next: AudienceState) => void;
  options: AudienceOptions;
  optionsLoading: boolean;
}) {
  const set = (patch: Partial<AudienceState>) => onChange({ ...value, ...patch });
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name || 'فرع';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-1" role="radiogroup" aria-label="طريقة تحديد الجمهور">
        {([
          ['all', 'كل العملاء', <Users size={15} key="i" />],
          ['segment', 'شريحة محددة', <FolderOpen size={15} key="i" />],
          ['manual', 'اختيار يدوي', <UserRoundCheck size={15} key="i" />],
        ] as const).map(([key, label, icon]) => (
          <button
            type="button"
            key={key}
            role="radio"
            aria-checked={value.mode === key}
            onClick={() => set({ mode: key, excludedIds: [] })}
            className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs sm:text-sm font-bold transition-colors cursor-pointer ${value.mode === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
          >
            {icon}<span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {value.mode === 'segment' && (
        <div className="space-y-3">
          <SegmentStep n={1} title="الفئة" hint="العميل ضمن أيٍّ من الفئات المختارة. اتركها فارغة لتجاهل الفئة." loading={optionsLoading}>
            <OptionPicker kind="category" items={options.categories} selected={value.categoryIds} groupLabel={branchName} multiBranch={storeIds.length > 1}
              onChange={(ids) => set({ categoryIds: ids, excludeCategoryIds: value.excludeCategoryIds.filter((id) => !ids.includes(id)), excludedIds: [] })} />
          </SegmentStep>

          <SegmentStep
            n={2}
            title="التاق"
            hint={value.categoryIds.length ? 'الأرقام بجانب كل تاق محسوبة داخل الفئات المختارة.' : 'العميل يحمل التاقات المختارة.'}
            loading={optionsLoading}
            aside={value.tagIds.length > 1 ? (
              <div className="flex rounded-md border border-labbaik-border p-0.5 text-[11px] font-bold" role="radiogroup" aria-label="مطابقة التاقات">
                {([['any', 'أيٌّ منها'], ['all', 'جميعها معًا']] as const).map(([key, label]) => (
                  <button type="button" key={key} role="radio" aria-checked={value.tagMatch === key} onClick={() => set({ tagMatch: key, excludedIds: [] })}
                    className={`h-6 px-2 rounded cursor-pointer ${value.tagMatch === key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted'}`}>{label}</button>
                ))}
              </div>
            ) : undefined}
          >
            <OptionPicker kind="tag" items={options.tags} selected={value.tagIds} groupLabel={branchName} multiBranch={storeIds.length > 1}
              onChange={(ids) => set({ tagIds: ids, excludeTagIds: value.excludeTagIds.filter((id) => !ids.includes(id)), excludedIds: [] })} />
          </SegmentStep>

          <Exclusions
            options={options}
            value={value}
            groupLabel={branchName}
            multiBranch={storeIds.length > 1}
            onChange={(patch) => set({ ...patch, excludedIds: [] })}
          />

          <p className="text-xs text-labbaik-text-muted">
            لا تجد الفئة أو التاق؟ <Link to="/dashboard/customers" className="font-bold text-labbaik-blue dark:text-purple-300 hover:underline">إدارة الفئات والتاقات</Link>
          </p>
        </div>
      )}

      {(value.mode !== 'segment' || audienceReady(value)) && storeIds.length > 0 && (
        <CustomerReview key={value.mode} storeIds={storeIds} value={value} onChange={onChange} showBranch={storeIds.length > 1} />
      )}
    </div>
  );
}

function SegmentStep({ n, title, hint, loading, aside, children }: { n: number; title: string; hint: string; loading: boolean; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-labbaik-border p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-black text-neutral-900 dark:text-white">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-labbaik-page text-[11px] tabular-nums text-labbaik-text-muted">{n}</span>{title}
            {loading && <Loader2 size={13} className="animate-spin text-labbaik-blue" />}
          </p>
          <p className="mt-0.5 text-[11px] text-labbaik-text-muted">{hint}</p>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Exclusions({ options, value, groupLabel, multiBranch, onChange }: {
  options: AudienceOptions; value: AudienceState; groupLabel: (id: string | null) => string; multiBranch: boolean;
  onChange: (patch: Partial<AudienceState>) => void;
}) {
  const count = value.excludeCategoryIds.length + value.excludeTagIds.length;
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="rounded-lg border border-labbaik-border">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-black text-neutral-900 dark:text-white cursor-pointer">
        <span className="flex items-center gap-1.5"><MinusCircle size={15} className="text-red-600 dark:text-red-400" /> استثناء {count > 0 && <span className="text-xs text-red-700 dark:text-red-300 tabular-nums">({count})</span>}</span>
        <ChevronDown size={16} className={`text-labbaik-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-labbaik-text-muted">يُستبعد كل عميل لديه أيٌّ مما تختاره هنا، حتى لو طابق الشروط أعلاه.</p>
          <OptionPicker kind="category" items={options.categories.filter((o) => !value.categoryIds.includes(o.id))} selected={value.excludeCategoryIds} groupLabel={groupLabel} multiBranch={multiBranch} tone="exclude" showCounts={false}
            onChange={(ids) => onChange({ excludeCategoryIds: ids })} />
          <OptionPicker kind="tag" items={options.tags.filter((o) => !value.tagIds.includes(o.id))} selected={value.excludeTagIds} groupLabel={groupLabel} multiBranch={multiBranch} tone="exclude" showCounts={false}
            onChange={(ids) => onChange({ excludeTagIds: ids })} />
        </div>
      )}
    </div>
  );
}

function OptionPicker({
  kind, items, selected, onChange, groupLabel, multiBranch, tone = 'include', showCounts = true,
}: {
  kind: 'category' | 'tag'; items: AudienceOption[]; selected: string[]; onChange: (ids: string[]) => void;
  groupLabel: (storeId: string | null) => string; multiBranch: boolean; tone?: 'include' | 'exclude'; showCounts?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((item) => item.name.toLowerCase().includes(q) || selected.includes(item.id)) : items;
  }, [items, filter, selected]);
  // Organization-wide labels first, then one group per branch.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: AudienceOption[] }>();
    for (const item of visible) {
      const key = item.scope === 'organization' ? 'org' : item.storeId || 'org';
      if (!map.has(key)) map.set(key, { label: key === 'org' ? 'على مستوى كل الفروع' : groupLabel(item.storeId), items: [] });
      map.get(key)!.items.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 'org' ? -1 : b === 'org' ? 1 : 0)).map(([, group]) => group);
  }, [visible, groupLabel]);
  const word = kind === 'category' ? 'فئات' : 'تاقات';

  if (!items.length) return <p className="text-xs text-labbaik-text-muted">لا توجد {word} في الفروع المحددة.</p>;
  return (
    <div className="space-y-2">
      {items.length > 12 && (
        <div className="relative">
          <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`ابحث في ${word} (${items.length})`} aria-label={`بحث في ${word}`}
            className="w-full h-8 rounded-md border border-labbaik-border bg-labbaik-page pr-8 pl-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30" />
        </div>
      )}
      <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-2">
        {groups.map((group) => (
          <div key={group.label}>
            {(multiBranch || groups.length > 1) && <p className="mb-1 text-[11px] font-bold text-labbaik-text-muted">{group.label}</p>}
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const on = selected.includes(item.id);
                const exclude = tone === 'exclude';
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 border text-xs font-bold transition-colors cursor-pointer ${kind === 'category' ? 'rounded-md' : 'rounded-full'} ${
                      on
                        ? exclude ? 'border-red-500/60 bg-red-500/10 text-red-800 dark:text-red-200 line-through' : 'text-neutral-900 dark:text-white'
                        : `border-labbaik-border hover:text-neutral-900 dark:hover:text-white ${showCounts && !item.customers ? 'text-labbaik-text-muted/60' : 'text-labbaik-text-muted'}`
                    }`}
                    style={on && !exclude ? { borderColor: item.color, backgroundColor: `${item.color}1f` } : undefined}
                  >
                    {on && !exclude ? <Check size={12} style={{ color: item.color }} /> : <span className={`h-2 w-2 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: item.color }} />}
                    {kind === 'tag' && '#'}{item.name}
                    {showCounts && <span className="tabular-nums font-normal opacity-70">{item.customers.toLocaleString('en')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!visible.length && <p className="text-xs text-labbaik-text-muted">لا نتائج.</p>}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

/** Server-paged list of the matching customers, to untick individuals (all/segment) or pick them (manual). */
function CustomerReview({ storeIds, value, onChange, showBranch }: { storeIds: string[]; value: AudienceState; onChange: (next: AudienceState) => void; showBranch: boolean }) {
  const manual = value.mode === 'manual';
  const [open, setOpen] = useState(manual);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  // Same filters the summary and send use; one string so a changed filter restarts at page 1.
  const filters = useMemo(() => {
    const csv = (ids: string[]) => (ids.length ? ids.join(',') : undefined);
    const params: Record<string, string | undefined> = { storeIds: storeIds.join(',') };
    if (value.mode === 'segment') {
      Object.assign(params, {
        categoryIds: csv(value.categoryIds), tagIds: csv(value.tagIds), tagMatch: value.tagMatch,
        excludeCategoryIds: csv(value.excludeCategoryIds), excludeTagIds: csv(value.excludeTagIds),
      });
    }
    return JSON.stringify(params);
  }, [storeIds, value.mode, value.categoryIds, value.tagIds, value.tagMatch, value.excludeCategoryIds, value.excludeTagIds]);
  const [pagedFilters, setPagedFilters] = useState(filters);
  if (pagedFilters !== filters) {
    setPagedFilters(filters);
    setPage(1);
  }

  const load = useCallback(async () => {
    if (!open) return;
    const id = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const params = { ...JSON.parse(filters), page, limit: PAGE_SIZE, whatsappOnly: true, scope: 'organization', search: query || undefined, sort: 'fullName', dir: 'asc' };
      const { data } = await api.get('/customers', { params });
      if (id !== request.current) return;
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [open, page, query, filters]);

  useEffect(() => { void load(); }, [load]);

  const isIncluded = (id: string) => (manual ? value.manualIds.includes(id) : !value.excludedIds.includes(id));
  const toggle = (id: string) => onChange(manual
    ? { ...value, manualIds: value.manualIds.includes(id) ? value.manualIds.filter((x) => x !== id) : [...value.manualIds, id] }
    : { ...value, excludedIds: value.excludedIds.includes(id) ? value.excludedIds.filter((x) => x !== id) : [...value.excludedIds, id] });
  const setPageRows = (include: boolean) => {
    const ids = rows.map((r) => r.id);
    if (manual) onChange({ ...value, manualIds: include ? [...new Set([...value.manualIds, ...ids])] : value.manualIds.filter((id) => !ids.includes(id)) });
    else onChange({ ...value, excludedIds: include ? value.excludedIds.filter((id) => !ids.includes(id)) : [...new Set([...value.excludedIds, ...ids])] });
  };
  const changed = manual ? value.manualIds.length : value.excludedIds.length;

  return (
    <div className="rounded-lg border border-labbaik-border">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer">
        <span className="text-sm font-black text-neutral-900 dark:text-white">
          {manual ? 'اختر العملاء' : 'مراجعة العملاء واستبعاد أفراد'}
          {changed > 0 && <span className="ms-2 text-xs font-bold text-labbaik-blue dark:text-purple-300 tabular-nums">{manual ? `${changed} محدد` : `${changed} مستبعد`}</span>}
        </span>
        <ChevronDown size={16} className={`text-labbaik-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..." aria-label="بحث في العملاء"
                className="w-full h-9 rounded-lg border border-labbaik-border bg-labbaik-page pr-9 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 placeholder:text-labbaik-text-muted" />
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <button type="button" onClick={() => setPageRows(true)} className="text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">تحديد الصفحة</button>
              <button type="button" onClick={() => setPageRows(false)} className="text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء الصفحة</button>
              {changed > 0 && (
                <button type="button" onClick={() => onChange(manual ? { ...value, manualIds: [] } : { ...value, excludedIds: [] })} className="text-red-700 dark:text-red-300 hover:underline cursor-pointer">
                  {manual ? 'مسح الاختيار' : 'إعادة الكل'}
                </button>
              )}
            </div>
          </div>
          <ul className={`max-h-[42vh] overflow-y-auto custom-scrollbar divide-y divide-labbaik-border rounded-lg border border-labbaik-border transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {rows.map((c) => <CustomerRow key={c.id} customer={c} checked={isIncluded(c.id)} onToggle={() => toggle(c.id)} showBranch={showBranch} />)}
            {!rows.length && !loading && <li className="py-6 text-center text-sm text-labbaik-text-muted">{failed ? 'تعذر تحميل العملاء.' : 'لا يوجد عملاء مطابقون.'}</li>}
            {!rows.length && loading && <li className="py-6 grid place-items-center"><Loader2 size={18} className="animate-spin text-labbaik-blue" /></li>}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-labbaik-text-muted tabular-nums">{total.toLocaleString('en')} عميل مطابق</span>
            <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} onChange={setPage} label="صفحات العملاء" />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerRow({ customer, checked, onToggle, showBranch }: { customer: Customer; checked: boolean; onToggle: () => void; showBranch: boolean }) {
  const name = customer.fullName && !/^(WhatsApp|العميل|عميل)\s/.test(customer.fullName) ? customer.fullName : '';
  const phone = customer.phoneNumber || customer.whatsappId || '';
  return (
    <li>
      <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? '' : 'opacity-60'} hover:bg-labbaik-page`}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 rounded accent-[#643B89] cursor-pointer" />
        <CustomerAvatar name={name} seed={phone || customer.id} size={28} className="rounded-full" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-neutral-900 dark:text-white truncate">{name || phone || 'عميل بدون اسم'}</span>
          {name && <span dir="ltr" className="block text-xs text-labbaik-text-muted text-right tabular-nums">{phone}</span>}
        </span>
        {customer.marketingOptOut && <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">رافض للتسويق</span>}
        <span className="hidden sm:flex items-center gap-1 shrink-0">
          {(customer.categories || []).slice(0, 2).map((c) => <span key={c.id} title={c.name} className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />)}
          {(customer.tags || []).slice(0, 3).map((t) => <span key={t.id} title={`#${t.name}`} className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />)}
        </span>
        {showBranch && customer.store?.name && <span className="shrink-0 text-[11px] text-labbaik-text-muted">{customer.store.name}</span>}
      </label>
    </li>
  );
}
