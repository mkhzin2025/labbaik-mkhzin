import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import api from '../api/client';
import {
  Building2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  Minus,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toEnglishDigits } from '@/lib/utils';
import CustomerProfile from '../components/CustomerProfile';
import CustomerAvatar from '../components/CustomerAvatar';
import BranchSelector from '../components/customers/BranchSelector';
import type { Branch } from '../components/customers/BranchSelector';
import { useToast } from '../components/Toast';

interface TaxonomyItem {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  scope?: 'organization' | 'store';
  storeId?: string | null;
}

interface Customer {
  id: string;
  storeId: string;
  store?: Branch;
  fullName: string;
  email: string;
  phoneNumber: string;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'table' | 'cards';
type SortKey = 'fullName' | 'phoneNumber' | 'createdAt' | 'updatedAt';
type Segment = 'all' | 'categorized' | 'uncategorized' | 'tagged' | 'untagged';
type TaxonomyKind = 'category' | 'tag';

interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
  counts: Record<Segment, number>;
}

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'categorized', label: 'لديهم فئة' },
  { key: 'uncategorized', label: 'بدون فئة' },
  { key: 'tagged', label: 'لديهم تاقات' },
  { key: 'untagged', label: 'بدون تاقات' },
];

const PAGE_SIZES = [25, 50, 100];
const EMPTY_SELECTION: Set<string> = new Set();
const EMPTY_COUNTS: Record<Segment, number> = { all: 0, categorized: 0, uncategorized: 0, tagged: 0, untagged: 0 };
const TAXONOMY_COLORS = ['#7c3aed', '#2563eb', '#0e7490', '#047857', '#b45309', '#dc2626', '#be185d', '#4f46e5'];

const VIEW_MODE_KEY = 'customers_view_mode';
const PAGE_SIZE_KEY = 'customers_page_size';
const BRANCH_FILTER_KEY = 'customers_branch';
const ALL_BRANCHES = 'all';

const readStored = <T,>(key: string, parse: (value: string | null) => T): T => {
  try { return parse(localStorage.getItem(key)); } catch { return parse(null); }
};
const writeStored = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

const formatDate = (value?: string) => (value ? toEnglishDigits(format(new Date(value), 'yyyy/MM/dd')) : '—');
const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export default function CustomersPage() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState('');
  const [result, setResult] = useState<CustomerPage | null>(null);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [usage, setUsage] = useState<{ categories: Record<string, number>; tags: Record<string, number> }>({ categories: {}, tags: {} });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [segment, setSegment] = useState<Segment>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(() => readStored(PAGE_SIZE_KEY, (v) => (PAGE_SIZES.includes(Number(v)) ? Number(v) : 25)));
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStored(VIEW_MODE_KEY, (v) => (v === 'cards' ? 'cards' : 'table')));
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showTaxonomy, setShowTaxonomy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const requestId = useRef(0);

  useEffect(() => { writeStored(VIEW_MODE_KEY, viewMode); }, [viewMode]);
  useEffect(() => { writeStored(PAGE_SIZE_KEY, String(pageSize)); }, [pageSize]);

  // Debounce typing so every keystroke doesn't hit the server.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Any change to what is being looked at starts again from page 1 with nothing selected.
  // Derived from a key instead of reset in an effect, so a filter change sends one request, not two.
  const filtersKey = JSON.stringify([storeId, search, categoryFilter, tagFilter, segment, sortKey, sortDir, pageSize]);
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const page = pageState.key === filtersKey ? pageState.page : 1;
  const setPage = useCallback((next: number) => setPageState({ key: filtersKey, page: next }), [filtersKey]);
  const selectionKey = `${filtersKey}|${page}`;
  const [selectionState, setSelectionState] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const selection = selectionState.key === selectionKey ? selectionState.ids : EMPTY_SELECTION;
  const setSelection = (update: Set<string> | ((current: Set<string>) => Set<string>)) =>
    setSelectionState((state) => {
      const current = state.key === selectionKey ? state.ids : EMPTY_SELECTION;
      return { key: selectionKey, ids: typeof update === 'function' ? update(current) : update };
    });

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get('/stores');
        const rows: Branch[] = data || [];
        setBranches(rows);
        // Opens on every branch; a branch picked here is remembered for next time.
        const saved = readStored(BRANCH_FILTER_KEY, (v) => v);
        setStoreId(rows.length > 1 ? (saved && rows.some((row) => row.id === saved) ? saved : ALL_BRANCHES) : rows[0]?.id || '');
        if (!rows.length) setLoading(false);
      } catch (error) {
        showToast(errorMessage(error, 'تعذر تحميل الفروع.'), 'error');
        setLoading(false);
      }
    })();
  }, [showToast]);

  const loadTaxonomy = useCallback(async (branchId: string) => {
    if (!branchId) return;
    // Across all branches only organization-wide categories/tags apply, and usage counts are per branch.
    const all = branchId === ALL_BRANCHES;
    try {
      const [taxonomy, counts] = await Promise.all([
        api.get('/customers/taxonomy', { params: all ? {} : { storeId: branchId } }),
        all ? Promise.resolve({ data: {} }) : api.get('/customers/taxonomy/usage', { params: { storeId: branchId } }),
      ]);
      setCategories(taxonomy.data?.categories || []);
      setTags(taxonomy.data?.tags || []);
      setUsage({ categories: counts.data?.categories || {}, tags: counts.data?.tags || {} });
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل الفئات والتاقات.'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!storeId) return;
    writeStored(BRANCH_FILTER_KEY, storeId);
    if (storeId !== ALL_BRANCHES) writeStored('active_store_id', storeId);
    setCategoryFilter([]);
    setTagFilter([]);
    void loadTaxonomy(storeId);
  }, [storeId, loadTaxonomy]);

  const fetchCustomers = useCallback(async () => {
    if (!storeId) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const { data } = await api.get<CustomerPage>('/customers', {
        params: {
          ...(storeId === ALL_BRANCHES ? { scope: 'organization' } : { storeId }),
          page,
          limit: pageSize,
          segment,
          sort: sortKey,
          dir: sortDir,
          search: search || undefined,
          categoryIds: categoryFilter.length ? categoryFilter.join(',') : undefined,
          tagIds: tagFilter.length ? tagFilter.join(',') : undefined,
        },
      });
      if (id !== requestId.current) return; // a newer request already replaced this one
      setResult(data);
      // Deleting the last customers of a page would otherwise leave the user on an empty page.
      const lastPage = Math.max(1, Math.ceil((data.total || 0) / pageSize));
      if (page > lastPage) setPage(lastPage);
    } catch (error) {
      if (id === requestId.current) showToast(errorMessage(error, 'تعذر تحميل العملاء.'), 'error');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [storeId, page, setPage, pageSize, segment, sortKey, sortDir, search, categoryFilter, tagFilter, showToast]);

  useEffect(() => { void fetchCustomers(); }, [fetchCustomers]);

  const customers = result?.items || [];
  const counts = result?.counts || EMPTY_COUNTS;
  const total = result?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeBranch = useMemo(() => branches.find((branch) => branch.id === storeId), [branches, storeId]);
  const allBranches = storeId === ALL_BRANCHES;
  const branchName = (id?: string) => branches.find((branch) => branch.id === id)?.name || 'فرع غير معروف';
  const highlight = useMemo(() => new Set([...categoryFilter, ...tagFilter]), [categoryFilter, tagFilter]);
  const hasFilters = categoryFilter.length > 0 || tagFilter.length > 0 || segment !== 'all' || Boolean(search);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc'); }
  };

  const clearFilters = () => {
    setCategoryFilter([]);
    setTagFilter([]);
    setSegment('all');
    setSearchInput('');
    setSearch('');
  };

  const toggleSelected = (id: string) => setSelection((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = customers.length > 0 && customers.every((customer) => selection.has(customer.id));
  const toggleSelectPage = () => setSelection(allOnPageSelected ? new Set() : new Set(customers.map((customer) => customer.id)));

  const applyBulk = async (kind: TaxonomyKind, item: TaxonomyItem, mode: 'add' | 'remove') => {
    if (!selection.size) return;
    setBulkBusy(true);
    try {
      // Bulk edits are validated per branch, so a selection spanning branches is sent one branch at a time.
      const byBranch = new Map<string, string[]>();
      for (const customer of customers) {
        if (!selection.has(customer.id)) continue;
        byBranch.set(customer.storeId, [...(byBranch.get(customer.storeId) || []), customer.id]);
      }
      for (const [branchId, customerIds] of byBranch) {
        await api.patch('/customers/bulk', {
          storeId: branchId,
          customerIds,
          mode,
          ...(kind === 'category' ? { categoryIds: [item.id] } : { tagIds: [item.id] }),
        });
      }
      const label = kind === 'category' ? 'الفئة' : 'التاق';
      showToast(mode === 'add' ? `تمت إضافة ${label} «${item.name}» إلى ${selection.size} عميل.` : `تمت إزالة ${label} «${item.name}» من ${selection.size} عميل.`, 'success');
      setSelection(new Set());
      await Promise.all([fetchCustomers(), loadTaxonomy(storeId)]);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحديث العملاء المحددين.'), 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  if (!branches.length && loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-labbaik-text-muted">
        <Loader2 size={32} className="animate-spin text-labbaik-blue" />
        <p className="text-sm font-bold">جاري تحميل العملاء...</p>
      </div>
    );
  }

  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">العملاء</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">
            <span className="tabular-nums font-bold">{counts.all.toLocaleString('en')}</span> عميل في {allBranches ? 'كل الفروع' : activeBranch?.name || 'الفرع'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 1 && <BranchSelector branches={branches} value={storeId} onChange={setStoreId} allLabel="كل الفروع" />}
          <button
            type="button"
            onClick={() => setShowTaxonomy(true)}
            disabled={allBranches}
            title={allBranches ? 'اختر فرعاً لإدارة فئاته وتاقاته' : undefined}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-labbaik-border bg-labbaik-surface text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-labbaik-border disabled:hover:text-neutral-800 dark:disabled:hover:text-neutral-100"
          >
            <Settings2 size={16} /> الفئات والتاقات
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border border-labbaik-border bg-labbaik-surface p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted group-focus-within:text-labbaik-blue" size={16} />
            <input
              type="search"
              aria-label="بحث في العملاء"
              placeholder="ابحث بالاسم أو رقم الجوال أو البريد..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-10 bg-labbaik-page border border-labbaik-border rounded-lg pr-10 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="customers-sort">ترتيب حسب</label>
            <select
              id="customers-sort"
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSortKey(key as SortKey); setSortDir(dir as 'asc' | 'desc'); }}
              className="h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 cursor-pointer"
            >
              <option value="updatedAt:desc">آخر تحديث</option>
              <option value="createdAt:desc">الأحدث إضافة</option>
              <option value="createdAt:asc">الأقدم إضافة</option>
              <option value="fullName:asc">الاسم (أ ← ي)</option>
              <option value="fullName:desc">الاسم (ي ← أ)</option>
            </select>
            <div className="flex rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="group" aria-label="طريقة العرض">
              <ViewButton active={viewMode === 'table'} onClick={() => setViewMode('table')} label="جدول"><List size={15} /></ViewButton>
              <ViewButton active={viewMode === 'cards'} onClick={() => setViewMode('cards')} label="بطاقات"><LayoutGrid size={15} /></ViewButton>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="شرائح العملاء">
          {SEGMENTS.map((seg) => (
            <button
              type="button"
              role="tab"
              aria-selected={segment === seg.key}
              key={seg.key}
              onClick={() => setSegment(seg.key)}
              className={`h-8 px-3 rounded-full text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${segment === seg.key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'bg-labbaik-page text-labbaik-text-muted hover:text-labbaik-blue'}`}
            >
              {seg.label}
              <span className={`tabular-nums text-[11px] px-1.5 rounded-full ${segment === seg.key ? 'bg-white/25' : 'bg-neutral-500/10'}`}>{counts[seg.key].toLocaleString('en')}</span>
            </button>
          ))}
        </div>

        {(categories.some((c) => c.isActive) || tags.some((t) => t.isActive)) && (
          <div className="space-y-2 border-t border-labbaik-border pt-3">
            <FilterRow label="الفئات" kind="category" items={categories} selected={categoryFilter} setSelected={setCategoryFilter} icon={<FolderOpen size={14} />} />
            <FilterRow label="التاقات" kind="tag" items={tags} selected={tagFilter} setSelected={setTagFilter} icon={<Tag size={14} />} />
          </div>
        )}

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-black text-red-600 dark:text-red-400 hover:underline cursor-pointer">
            <X size={13} /> مسح البحث والفلاتر
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selection.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-labbaik-blue/30 bg-labbaik-surface px-3 py-2 shadow-[0_12px_32px_-16px_rgba(15,10,30,0.4)]">
          <span className="text-sm font-black text-neutral-900 dark:text-white tabular-nums">{selection.size} محدد</span>
          <span className="h-5 w-px bg-labbaik-border" />
          <BulkMenu label="فئة" icon={<FolderOpen size={15} />} kind="category" items={categories} busy={bulkBusy} onPick={applyBulk} />
          <BulkMenu label="تاق" icon={<Tag size={15} />} kind="tag" items={tags} busy={bulkBusy} onPick={applyBulk} />
          {bulkBusy && <Loader2 size={16} className="animate-spin text-labbaik-blue" />}
          <button type="button" onClick={() => setSelection(new Set())} className="ms-auto inline-flex items-center gap-1 h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">
            <X size={14} /> إلغاء التحديد
          </button>
        </div>
      )}

      {/* Results */}
      <div className={`transition-opacity ${loading && result ? 'opacity-60' : ''}`} aria-busy={loading}>
        {!result && loading ? (
          <TableSkeleton />
        ) : customers.length === 0 ? (
          <EmptyCustomers filtered={hasFilters} onClear={clearFilters} />
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-xl border border-labbaik-border bg-labbaik-surface">
            <table className="w-full text-sm text-right">
              <thead className="border-b border-labbaik-border text-xs font-black text-labbaik-text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox checked={allOnPageSelected} indeterminate={selection.size > 0 && !allOnPageSelected} onChange={toggleSelectPage} label="تحديد كل عملاء الصفحة" />
                  </th>
                  <SortHeader label="العميل" active={sortKey === 'fullName'} dir={sortDir} onClick={() => toggleSort('fullName')} />
                  <SortHeader label="رقم الجوال" active={sortKey === 'phoneNumber'} dir={sortDir} onClick={() => toggleSort('phoneNumber')} />
                  <th className="px-4 py-3 whitespace-nowrap">الفئات</th>
                  <th className="px-4 py-3 whitespace-nowrap">التاقات</th>
                  <SortHeader label="تاريخ الإضافة" active={sortKey === 'createdAt'} dir={sortDir} onClick={() => toggleSort('createdAt')} />
                  <SortHeader label="آخر تحديث" active={sortKey === 'updatedAt'} dir={sortDir} onClick={() => toggleSort('updatedAt')} />
                  <th className="w-8 px-2 py-3"><span className="sr-only">فتح</span></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const selected = selection.has(customer.id);
                  return (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`border-t border-labbaik-border first:border-t-0 cursor-pointer transition-colors group ${selected ? 'bg-labbaik-blue/8' : 'hover:bg-labbaik-page'}`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected} onChange={() => toggleSelected(customer.id)} label={`تحديد ${customer.fullName || customer.phoneNumber}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-48">
                          <CustomerAvatar name={isGeneratedName(customer) ? '' : customer.fullName} seed={customer.phoneNumber || customer.id} size={34} className="rounded-full" />
                          <div className="min-w-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedCustomerId(customer.id); }} className="block font-bold text-neutral-900 dark:text-white truncate max-w-56 text-right hover:text-labbaik-blue cursor-pointer">
                              {displayName(customer)}
                            </button>
                            {allBranches && (
                              <div className="flex items-center gap-1 text-xs font-bold text-labbaik-text-muted truncate max-w-56"><Building2 size={11} className="shrink-0" />{customer.store?.name || branchName(customer.storeId)}</div>
                            )}
                            {customer.email && <div className="text-xs text-labbaik-text-muted truncate max-w-56">{customer.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold tabular-nums text-neutral-700 dark:text-neutral-200 whitespace-nowrap" dir="ltr" style={{ textAlign: 'right' }}>{customer.phoneNumber || '—'}</td>
                      <td className="px-4 py-3 min-w-36"><BadgeList kind="category" highlight={highlight} items={customer.categories || []} /></td>
                      <td className="px-4 py-3 min-w-36"><BadgeList kind="tag" highlight={highlight} items={customer.tags || []} /></td>
                      <td className="px-4 py-3 text-xs font-bold tabular-nums text-labbaik-text-muted whitespace-nowrap">{formatDate(customer.createdAt)}</td>
                      <td className="px-4 py-3 text-xs font-bold tabular-nums text-labbaik-text-muted whitespace-nowrap">{formatDate(customer.updatedAt)}</td>
                      <td className="px-2 py-3 text-labbaik-text-muted group-hover:text-labbaik-blue"><ChevronLeft size={16} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {customers.map((customer) => {
              const selected = selection.has(customer.id);
              return (
                <div
                  key={customer.id}
                  className={`relative rounded-xl border bg-labbaik-surface p-4 transition-colors ${selected ? 'border-labbaik-blue' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
                >
                  <div className="absolute top-3 left-3">
                    <Checkbox checked={selected} onChange={() => toggleSelected(customer.id)} label={`تحديد ${customer.fullName || customer.phoneNumber}`} />
                  </div>
                  <button type="button" onClick={() => setSelectedCustomerId(customer.id)} className="w-full text-right cursor-pointer">
                    <div className="flex items-center gap-3 pl-8">
                      <CustomerAvatar name={isGeneratedName(customer) ? '' : customer.fullName} seed={customer.phoneNumber || customer.id} size={44} className="rounded-full" />
                      <div className="min-w-0">
                        <h3 className="font-black text-neutral-900 dark:text-white truncate">{displayName(customer)}</h3>
                        <p className="text-xs font-bold tabular-nums text-labbaik-text-muted" dir="ltr" style={{ textAlign: 'right' }}>{customer.phoneNumber || '—'}</p>
                        {allBranches && (
                          <p className="flex items-center gap-1 text-xs font-bold text-labbaik-text-muted truncate"><Building2 size={11} className="shrink-0" />{customer.store?.name || branchName(customer.storeId)}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <BadgeList label="الفئات" kind="category" highlight={highlight} items={customer.categories || []} />
                      <BadgeList label="التاقات" kind="tag" highlight={highlight} items={customer.tags || []} />
                    </div>
                    <div className="mt-4 pt-3 border-t border-labbaik-border flex items-center justify-between text-xs font-bold text-labbaik-text-muted">
                      <span className="tabular-nums">أُضيف {formatDate(customer.createdAt)}</span>
                      <span className="flex items-center gap-0.5 text-labbaik-blue dark:text-purple-300">التفاصيل <ChevronLeft size={14} /></span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3 text-labbaik-text-muted">
            <span className="tabular-nums">عرض <b className="text-neutral-800 dark:text-neutral-100">{rangeStart}–{rangeEnd}</b> من <b className="text-neutral-800 dark:text-neutral-100">{total.toLocaleString('en')}</b></span>
            <label className="flex items-center gap-1.5">
              <span className="text-xs">لكل صفحة</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-labbaik-border bg-labbaik-surface px-2 text-xs font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      {selectedCustomerId && (
        <CustomerProfile
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdated={() => { void fetchCustomers(); void loadTaxonomy(storeId); }}
          onTransferred={(result) => { setSelectedCustomerId(result.customer.id); void fetchCustomers(); void loadTaxonomy(storeId); }}
        />
      )}

      {showTaxonomy && (
        <TaxonomyDialog
          storeId={storeId}
          branchName={activeBranch?.name}
          categories={categories}
          tags={tags}
          usage={usage}
          onClose={() => setShowTaxonomy(false)}
          onChanged={async () => { await Promise.all([loadTaxonomy(storeId), fetchCustomers()]); }}
        />
      )}
    </div>
  );
}

function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`عرض ك${label}`}
      className={`h-8 px-2.5 rounded-md text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${active ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted hover:text-labbaik-blue'}`}
    >
      {children}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Checkbox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-4 w-4 rounded accent-[#643B89] cursor-pointer"
    />
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-4 py-3 whitespace-nowrap" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={onClick} className={`flex items-center gap-1.5 font-black hover:text-labbaik-blue cursor-pointer ${active ? 'text-labbaik-blue dark:text-purple-300' : ''}`}>
        {label}<Icon size={12} />
      </button>
    </th>
  );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  // First, last, and a window around the current page; gaps become an ellipsis.
  const pages = [...new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
  const cell = 'h-8 min-w-8 px-2 grid place-items-center rounded-md text-xs font-black tabular-nums transition-colors';
  return (
    <nav className="flex items-center gap-1" aria-label="صفحات العملاء">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة" className={`${cell} border border-labbaik-border text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
        <ChevronRight size={15} />
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-labbaik-text-muted">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${cell} cursor-pointer ${p === page ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-blue/10'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية" className={`${cell} border border-labbaik-border text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
        <ChevronLeft size={15} />
      </button>
    </nav>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-labbaik-border bg-labbaik-surface divide-y divide-labbaik-border" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-8 w-8 rounded-full bg-labbaik-page animate-pulse" />
          <div className="h-3 w-40 rounded bg-labbaik-page animate-pulse" />
          <div className="h-3 w-24 rounded bg-labbaik-page animate-pulse ms-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyCustomers({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-labbaik-border py-16 text-center">
      <Users size={36} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
      <p className="mt-3 font-bold text-neutral-800 dark:text-neutral-100">{filtered ? 'لا يوجد عملاء يطابقون البحث أو الفلاتر.' : 'لا يوجد عملاء في هذا الفرع بعد.'}</p>
      <p className="mt-1 text-sm text-labbaik-text-muted">{filtered ? 'جرّب كلمة بحث أخرى أو امسح الفلاتر.' : 'يُضاف العملاء تلقائيًا عند أول محادثة معهم.'}</p>
      {filtered && <button type="button" onClick={onClear} className="mt-4 h-9 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:border-labbaik-blue/40 cursor-pointer">مسح الفلاتر</button>}
    </div>
  );
}

// Categories read as squared chips with a folder; tags as rounded pills with '#'. Text stays neutral so any color is legible.
function TaxonomyBadge({ item, kind, highlighted }: { item: TaxonomyItem; kind: TaxonomyKind; highlighted?: boolean }) {
  const color = item.color || '#7c3aed';
  return (
    <span
      title={`${kind === 'category' ? 'فئة' : 'تاق'} · ${item.scope === 'organization' ? 'المنظمة' : 'الفرع'}`}
      className={`inline-flex items-center gap-1.5 h-6 px-2 text-[11px] font-bold whitespace-nowrap border text-neutral-800 dark:text-neutral-100 ${kind === 'category' ? 'rounded-md' : 'rounded-full'} ${highlighted ? 'ring-2 ring-labbaik-blue/50' : ''}`}
      style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}
    >
      <span className={`h-2 w-2 shrink-0 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: color }} />
      {kind === 'tag' && '#'}{item.name}
    </span>
  );
}

function FilterRow({ label, kind, items, selected, setSelected, icon }: { label: string; kind: TaxonomyKind; items: TaxonomyItem[]; selected: string[]; setSelected: (value: string[]) => void; icon: ReactNode }) {
  const active = items.filter((item) => item.isActive);
  if (!active.length) return null;
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-black text-labbaik-text-muted flex items-center gap-1 min-w-16">{icon}{label}</span>
      {active.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => toggle(item.id)}
            aria-pressed={on}
            className={`rounded-md cursor-pointer transition-opacity ${selected.length && !on ? 'opacity-50 hover:opacity-100' : ''}`}
          >
            <TaxonomyBadge item={item} kind={kind} highlighted={on} />
          </button>
        );
      })}
    </div>
  );
}

function BadgeList({ label, items, kind, highlight }: { label?: string; items: TaxonomyItem[]; kind: TaxonomyKind; highlight: Set<string> }) {
  // Filtered matches first so they stay visible when a customer has many labels.
  const ordered = [...items].sort((a, b) => Number(highlight.has(b.id)) - Number(highlight.has(a.id)));
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {label && <span className="text-[11px] text-labbaik-text-muted font-bold min-w-12">{label}</span>}
      {ordered.length
        ? ordered.slice(0, 3).map((item) => <TaxonomyBadge key={item.id} item={item} kind={kind} highlighted={highlight.has(item.id)} />)
        : <span className="text-xs text-labbaik-text-muted">—</span>}
      {ordered.length > 3 && <span title={ordered.slice(3).map((item) => item.name).join('، ')} className="text-[11px] text-labbaik-text-muted font-black">+{ordered.length - 3}</span>}
    </div>
  );
}

function BulkMenu({ label, icon, kind, items, busy, onPick }: { label: string; icon: ReactNode; kind: TaxonomyKind; items: TaxonomyItem[]; busy: boolean; onPick: (kind: TaxonomyKind, item: TaxonomyItem, mode: 'add' | 'remove') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const active = items.filter((item) => item.isActive);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-labbaik-border text-xs font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-50 cursor-pointer"
      >
        {icon} {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 rounded-lg border border-labbaik-border bg-labbaik-surface p-1 shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-40 max-h-72 overflow-y-auto custom-scrollbar">
          {active.length ? active.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-labbaik-page">
              <span className={`h-2.5 w-2.5 shrink-0 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: item.color }} />
              <span className="flex-1 truncate text-sm font-bold text-neutral-800 dark:text-neutral-100">{item.name}</span>
              <button type="button" onClick={() => { setOpen(false); onPick(kind, item, 'add'); }} title="إضافة للمحددين" aria-label={`إضافة ${item.name} للمحددين`} className="grid h-7 w-7 place-items-center rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"><Plus size={15} /></button>
              <button type="button" onClick={() => { setOpen(false); onPick(kind, item, 'remove'); }} title="إزالة من المحددين" aria-label={`إزالة ${item.name} من المحددين`} className="grid h-7 w-7 place-items-center rounded-md text-red-700 dark:text-red-300 hover:bg-red-500/15 cursor-pointer"><Minus size={15} /></button>
            </div>
          )) : <p className="px-3 py-2 text-xs text-labbaik-text-muted">لا توجد {kind === 'category' ? 'فئات' : 'تاقات'} بعد. أضفها من «الفئات والتاقات».</p>}
        </div>
      )}
    </div>
  );
}

function TaxonomyDialog({ storeId, branchName, categories, tags, usage, onClose, onChanged }: {
  storeId: string;
  branchName?: string;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  usage: { categories: Record<string, number>; tags: Record<string, number> };
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="taxonomy-title" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] animate-slide-up">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-labbaik-border">
          <div>
            <h2 id="taxonomy-title" className="text-lg font-black text-neutral-900 dark:text-white">الفئات والتاقات</h2>
            <p className="mt-0.5 text-sm text-labbaik-text-muted">الفئة تصنيف ثابت للعميل (جملة، أفراد، شركات)، والتاق علامة مرنة للمتابعة والحملات.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white hover:bg-labbaik-page cursor-pointer"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-y-auto custom-scrollbar">
          <TaxonomyColumn kind="category" title="الفئات" hint="مثل: جملة، أفراد، VIP، شركات" storeId={storeId} branchName={branchName} items={categories} usage={usage.categories} onChanged={onChanged} />
          <TaxonomyColumn kind="tag" title="التاقات" hint="مثل: مهتم، يحتاج متابعة، حملة رمضان" storeId={storeId} branchName={branchName} items={tags} usage={usage.tags} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

function TaxonomyColumn({ kind, title, hint, storeId, branchName, items, usage, onChanged }: {
  kind: TaxonomyKind;
  title: string;
  hint: string;
  storeId: string;
  branchName?: string;
  items: TaxonomyItem[];
  usage: Record<string, number>;
  onChanged: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(kind === 'category' ? TAXONOMY_COLORS[0] : TAXONOMY_COLORS[1]);
  const [scope, setScope] = useState<'store' | 'organization'>('store');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const endpoint = kind === 'category' ? '/customers/categories' : '/customers/tags';
  const noun = kind === 'category' ? 'الفئة' : 'التاق';

  const create = async () => {
    const value = name.trim();
    if (!value) return;
    setSaving(true);
    try {
      await api.post(endpoint, { scope, storeId: scope === 'store' ? storeId : undefined, name: value, color });
      setName('');
      await onChanged();
      showToast(`تمت إضافة ${noun} «${value}».`, 'success');
    } catch (error) {
      showToast(errorMessage(error, `تعذر حفظ ${noun}.`), 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = async (item: TaxonomyItem, patch: Partial<Pick<TaxonomyItem, 'color' | 'isActive'>>) => {
    try {
      await api.patch(`${endpoint}/${item.id}`, patch);
      await onChanged();
    } catch (error) {
      showToast(errorMessage(error, `تعذر تحديث ${noun}.`), 'error');
    }
  };

  const remove = async (item: TaxonomyItem) => {
    try {
      await api.delete(`${endpoint}/${item.id}`, { params: { storeId } });
      setConfirmDelete(null);
      await onChanged();
      showToast(`تم حذف ${noun} «${item.name}» وإزالتها من العملاء.`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر الحذف.'), 'error');
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-black text-neutral-900 dark:text-white flex items-center gap-2">{kind === 'category' ? <FolderOpen size={16} /> : <Tag size={16} />}{title}</h3>
        <p className="text-xs text-labbaik-text-muted mt-0.5">{hint}</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-2.5 rounded-xl border border-labbaik-border bg-labbaik-page p-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={`اسم ${noun} الجديد`}
            aria-label={`اسم ${noun} الجديد`}
            className="flex-1 min-w-0 h-10 rounded-lg border border-labbaik-border bg-labbaik-surface px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted"
          />
          <button type="submit" disabled={saving || !name.trim()} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} إضافة
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ColorPicker value={color} onChange={setColor} label={`لون ${noun}`} />
          <div className="flex rounded-md border border-labbaik-border bg-labbaik-surface p-0.5 text-xs font-bold" role="radiogroup" aria-label="نطاق الاستخدام">
            {(['store', 'organization'] as const).map((value) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
                title={value === 'store' ? `متاح في ${branchName || 'هذا الفرع'} فقط` : 'متاح في كل الفروع'}
                className={`h-7 px-2.5 rounded cursor-pointer ${scope === value ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted hover:text-labbaik-blue'}`}
              >
                {value === 'store' ? 'هذا الفرع' : 'كل الفروع'}
              </button>
            ))}
          </div>
        </div>
      </form>

      <ul className="divide-y divide-labbaik-border border-y border-labbaik-border">
        {items.map((item) => (
          <li key={item.id} className={`flex items-center gap-3 py-2.5 ${item.isActive ? '' : 'opacity-60'}`}>
            <ColorPicker compact value={item.color} onChange={(next) => void update(item, { color: next })} label={`لون ${item.name}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">{kind === 'tag' && '#'}{item.name}</p>
              <p className="text-[11px] text-labbaik-text-muted">
                {item.scope === 'organization' ? 'كل الفروع' : 'هذا الفرع'} · <span className="tabular-nums">{usage[item.id] || 0}</span> عميل
                {!item.isActive && ' · مخفي من الفلاتر'}
              </p>
            </div>
            {confirmDelete === item.id ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void remove(item)} className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-black hover:bg-red-700 cursor-pointer">تأكيد الحذف</button>
                <button type="button" onClick={() => setConfirmDelete(null)} className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
              </div>
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void update(item, { isActive: !item.isActive })}
                  title={item.isActive ? 'إخفاء من الفلاتر والاختيار' : 'إظهار في الفلاتر والاختيار'}
                  aria-pressed={item.isActive}
                  className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer"
                >
                  {item.isActive ? 'إخفاء' : 'إظهار'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(item.id)} aria-label={`حذف ${item.name}`} title="حذف" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 cursor-pointer">
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </li>
        ))}
        {!items.length && <li className="py-6 text-center text-sm text-labbaik-text-muted">لا توجد {kind === 'category' ? 'فئات' : 'تاقات'} بعد.</li>}
      </ul>
    </section>
  );
}

function ColorPicker({ value, onChange, label, compact = false }: { value: string; onChange: (color: string) => void; label: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const swatches = (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {TAXONOMY_COLORS.map((color) => (
        <button
          type="button"
          key={color}
          role="radio"
          aria-checked={value.toLowerCase() === color}
          aria-label={color}
          onClick={() => { onChange(color); setOpen(false); }}
          className="grid h-6 w-6 place-items-center rounded-full cursor-pointer ring-offset-2 ring-offset-labbaik-surface hover:ring-2 hover:ring-neutral-400/50"
          style={{ backgroundColor: color }}
        >
          {value.toLowerCase() === color && <Check size={13} className="text-white" />}
        </button>
      ))}
    </div>
  );

  if (!compact) return swatches;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={`تغيير ${label}`} aria-expanded={open} className="block h-5 w-5 rounded-full cursor-pointer ring-2 ring-transparent hover:ring-neutral-400/50" style={{ backgroundColor: value }} />
      {open && <div className="absolute right-0 top-7 z-10 w-44 rounded-lg border border-labbaik-border bg-labbaik-surface p-2 shadow-[0_12px_32px_-12px_rgba(15,10,30,0.4)]">{swatches}</div>}
    </div>
  );
}

// Names like "WhatsApp 9665..." are generated placeholders, not real customer names.
const isGeneratedName = (customer: Customer) => !customer.fullName || /^(WhatsApp|العميل|عميل)\s/.test(customer.fullName);
const displayName = (customer: Customer) => (isGeneratedName(customer) ? customer.phoneNumber || 'عميل بدون اسم' : customer.fullName);
