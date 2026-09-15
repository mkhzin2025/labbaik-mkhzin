import { useEffect, useMemo, useState, type ReactNode } from 'react';
import api from '../api/client';
import {
  Calendar,
  ChevronLeft,
  Filter,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toEnglishDigits } from '@/lib/utils';
import CustomerProfile from '../components/CustomerProfile';
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

export default function CustomersPage() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showTaxonomy, setShowTaxonomy] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [taxonomyScope, setTaxonomyScope] = useState<'organization' | 'store'>('store');
  const [savingTaxonomy, setSavingTaxonomy] = useState(false);

  useEffect(() => { void loadBranches(); }, []);

  useEffect(() => {
    if (!storeId) return;
    localStorage.setItem('active_store_id', storeId);
    setCategoryFilter([]);
    setTagFilter([]);
    void loadTaxonomy(storeId);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    const timer = window.setTimeout(() => void fetchCustomers(), 220);
    return () => window.clearTimeout(timer);
  }, [storeId, searchTerm, categoryFilter.join(','), tagFilter.join(',')]);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/stores');
      const rows: Branch[] = data || [];
      setBranches(rows);
      const saved = localStorage.getItem('active_store_id');
      setStoreId(rows.some((row) => row.id === saved) ? saved! : rows[0]?.id || '');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر تحميل الفروع.', 'error');
      setLoading(false);
    }
  };

  const loadTaxonomy = async (branchId = storeId) => {
    if (!branchId) return;
    try {
      const { data } = await api.get('/customers/taxonomy', { params: { storeId: branchId } });
      setCategories(data?.categories || []);
      setTags(data?.tags || []);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر تحميل الفئات والتاقات.', 'error');
    }
  };

  const fetchCustomers = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/customers', {
        params: {
          storeId,
          search: searchTerm || undefined,
          categoryIds: categoryFilter.length ? categoryFilter.join(',') : undefined,
          tagIds: tagFilter.length ? tagFilter.join(',') : undefined,
        },
      });
      setCustomers(data || []);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر تحميل العملاء.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createTaxonomy = async (type: 'category' | 'tag') => {
    const name = (type === 'category' ? newCategory : newTag).trim();
    if (!storeId || !name) return;
    setSavingTaxonomy(true);
    try {
      await api.post(type === 'category' ? '/customers/categories' : '/customers/tags', { scope: taxonomyScope, storeId: taxonomyScope === 'store' ? storeId : undefined, name });
      if (type === 'category') setNewCategory(''); else setNewTag('');
      await loadTaxonomy();
      showToast(type === 'category' ? 'تمت إضافة الفئة.' : 'تمت إضافة التاق.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حفظ التصنيف.', 'error');
    } finally {
      setSavingTaxonomy(false);
    }
  };

  const deleteTaxonomy = async (type: 'category' | 'tag', id: string) => {
    if (!storeId) return;
    try {
      await api.delete(`${type === 'category' ? '/customers/categories' : '/customers/tags'}/${id}`, { params: { storeId } });
      await Promise.all([loadTaxonomy(), fetchCustomers()]);
      showToast('تم الحذف وفك الربط من العملاء.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر الحذف.', 'error');
    }
  };

  const activeBranch = useMemo(() => branches.find((branch) => branch.id === storeId), [branches, storeId]);

  if (loading && !customers.length && !branches.length) {
    return <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400"><Loader2 size={40} className="animate-spin text-labbaik-blue" /><p className="font-bold">جاري تحميل العملاء...</p></div>;
  }

  return (
    <div className="space-y-7 animate-fade-in relative" dir="rtl">
      <div className="bg-labbaik-surface p-6 lg:p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div>
            <h1 className="text-3xl font-black text-neutral-900 dark:text-white flex items-center gap-4">إدارة العملاء <span className="bg-labbaik-blue/10 text-labbaik-blue text-xs px-4 py-1.5 rounded-full border border-labbaik-blue/20">{customers.length}</span></h1>
            <p className="text-neutral-500 mt-2 font-medium">كل عميل مرتبط بفرع، ويمكن إنشاء فئات وتاقات للمنظمة كلها أو للفرع فقط واستخدامها مباشرة في قوائم الإرسال.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {branches.length > 0 && <BranchSelector branches={branches} value={storeId} onChange={setStoreId} />}
            <button onClick={() => setShowTaxonomy((value) => !value)} className="rounded-2xl px-5 py-3.5 border border-labbaik-blue/20 bg-labbaik-blue/10 text-labbaik-blue text-sm font-black flex items-center justify-center gap-2"><FolderOpen size={17} /> الفئات والتاقات</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
          <div className="relative group">
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-labbaik-blue" size={18} />
            <input type="text" placeholder="ابحث بالاسم أو الرقم أو البريد..." value={searchTerm} onChange={(e) => setSearchInput(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-6 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 font-bold" />
          </div>
          <div className="flex items-center gap-2 text-xs font-black text-neutral-500 px-2"><Filter size={16} className="text-labbaik-blue" /> الفرع: <span className="text-neutral-900 dark:text-white">{activeBranch?.name || '-'}</span></div>
        </div>

        {(categories.length > 0 || tags.length > 0) && (
          <div className="space-y-3 border-t border-white/5 pt-5">
            <FilterRow label="الفئات" items={categories} selected={categoryFilter} setSelected={setCategoryFilter} icon={<FolderOpen size={14} />} />
            <FilterRow label="التاقات" items={tags} selected={tagFilter} setSelected={setTagFilter} icon={<Tag size={14} />} />
            {(categoryFilter.length > 0 || tagFilter.length > 0) && <button onClick={() => { setCategoryFilter([]); setTagFilter([]); }} className="text-xs font-black text-red-400 flex items-center gap-1"><X size={13} /> مسح الفلاتر</button>}
          </div>
        )}
      </div>

      {showTaxonomy && (
        <div className="space-y-4">
          <div className="bg-labbaik-surface rounded-3xl border border-white/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><div className="text-sm font-black text-neutral-900 dark:text-white">نطاق التصنيف الجديد</div><p className="text-xs text-neutral-500 mt-1">تصنيف المنظمة يظهر لكل الفروع، وتصنيف الفرع يظهر لهذا الفرع فقط.</p></div>
            <div className="flex rounded-2xl bg-white/5 border border-white/10 p-1"><button onClick={() => setTaxonomyScope('organization')} className={`px-4 py-2 rounded-xl text-xs font-black ${taxonomyScope === 'organization' ? 'bg-labbaik-blue text-white' : 'text-neutral-500'}`}>المنظمة</button><button onClick={() => setTaxonomyScope('store')} className={`px-4 py-2 rounded-xl text-xs font-black ${taxonomyScope === 'store' ? 'bg-labbaik-blue text-white' : 'text-neutral-500'}`}>الفرع</button></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TaxonomyManager title="فئات العملاء" hint="مثل: جملة، أفراد، VIP، شركات" value={newCategory} onChange={setNewCategory} items={categories} onAdd={() => createTaxonomy('category')} onDelete={(id) => deleteTaxonomy('category', id)} saving={savingTaxonomy} icon={<FolderOpen size={18} />} />
            <TaxonomyManager title="تاقات العملاء" hint="مثل: مهتم، يحتاج متابعة، حملة رمضان" value={newTag} onChange={setNewTag} items={tags} onAdd={() => createTaxonomy('tag')} onDelete={(id) => deleteTaxonomy('tag', id)} saving={savingTaxonomy} icon={<Tag size={18} />} />
          </div>
        </div>
      )}

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-labbaik-blue" size={34} /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {customers.length > 0 ? customers.map((customer) => (
            <div key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} className="bg-labbaik-surface p-7 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-labbaik-blue/30 hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden flex flex-col">
              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-labbaik-blue/20 to-transparent rounded-[1.3rem] flex items-center justify-center border border-labbaik-blue/20"><UserIcon size={27} className="text-labbaik-blue" /></div>
                <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-neutral-500 flex items-center gap-1"><FolderOpen size={11} /> {customer.store?.name || activeBranch?.name || 'فرع'}</span>
              </div>
              <div className="space-y-5 flex-1">
                <div><h3 className="text-xl font-black text-neutral-900 dark:text-white truncate">{customer.fullName || 'عميل مجهول'}</h3><div className="flex items-center gap-2 text-neutral-500 mt-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full" /><span className="text-xs font-bold tabular-nums">{customer.phoneNumber || 'بدون رقم'}</span></div></div>
                <div className="space-y-2">
                  <BadgeList label="الفئات" items={customer.categories || []} empty="بدون فئة" />
                  <BadgeList label="التاقات" items={customer.tags || []} empty="بدون تاقات" />
                </div>
              </div>
              <div className="mt-8 pt-5 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-neutral-500"><span className="flex items-center gap-2"><Calendar size={12} className="text-labbaik-blue" /> {toEnglishDigits(format(new Date(customer.createdAt), 'yyyy/MM/dd'))}</span><span className="group-hover:text-labbaik-blue flex items-center gap-1">عرض التفاصيل <ChevronLeft size={14} /></span></div>
            </div>
          )) : <div className="col-span-full py-28 text-center space-y-5"><div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto"><Users size={40} className="text-neutral-600" /></div><p className="font-black text-neutral-500">لا يوجد عملاء يطابقون الفرع والفلاتر الحالية.</p></div>}
        </div>
      )}

      {selectedCustomerId && <CustomerProfile customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} onUpdated={() => { void fetchCustomers(); void loadTaxonomy(); }} />}
    </div>
  );
}

function FilterRow({ label, items, selected, setSelected, icon }: { label: string; items: TaxonomyItem[]; selected: string[]; setSelected: (value: string[]) => void; icon: ReactNode }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-black text-neutral-500 flex items-center gap-1 min-w-16">{icon}{label}</span>{items.filter((item) => item.isActive).map((item) => <button key={item.id} onClick={() => toggle(item.id)} className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition ${selected.includes(item.id) ? 'border-labbaik-blue bg-labbaik-blue/15 text-labbaik-blue' : 'border-white/10 bg-white/5 text-neutral-500'}`}>{item.name}</button>)}</div>;
}

function TaxonomyManager({ title, hint, value, onChange, items, onAdd, onDelete, saving, icon }: { title: string; hint: string; value: string; onChange: (value: string) => void; items: TaxonomyItem[]; onAdd: () => void; onDelete: (id: string) => void; saving: boolean; icon: ReactNode }) {
  return <div className="bg-labbaik-surface rounded-[2rem] border border-white/5 p-6 space-y-5"><div><h3 className="font-black text-neutral-900 dark:text-white flex items-center gap-2 text-lg">{icon}{title}</h3><p className="text-xs text-neutral-500 mt-1">{hint}</p></div><div className="flex gap-2"><input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }} placeholder="اسم جديد" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-white outline-none" /><button disabled={saving || !value.trim()} onClick={onAdd} className="w-12 rounded-xl bg-labbaik-blue text-white flex items-center justify-center disabled:opacity-40">{saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={18} />}</button></div><div className="flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="group flex items-center gap-2 border border-white/10 rounded-xl px-3 py-2 text-xs font-black" style={{ color: item.color }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}<span className="text-[8px] text-neutral-500">{item.scope === 'organization' ? 'المنظمة' : 'الفرع'}</span><button onClick={() => onDelete(item.id)} className="text-neutral-600 hover:text-red-400"><Trash2 size={12} /></button></span>)}{!items.length && <span className="text-xs text-neutral-600">لا توجد عناصر بعد.</span>}</div></div>;
}

function BadgeList({ label, items, empty }: { label: string; items: TaxonomyItem[]; empty: string }) {
  return <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[9px] text-neutral-600 font-black min-w-10">{label}</span>{items.length ? items.slice(0, 3).map((item) => <span key={item.id} className="text-[9px] font-black px-2.5 py-1 rounded-lg border" style={{ color: item.color, borderColor: `${item.color}44`, backgroundColor: `${item.color}12` }}>{item.name}{item.scope === 'organization' ? ' · المنظمة' : ' · الفرع'}</span>) : <span className="text-[9px] text-neutral-600">{empty}</span>}{items.length > 3 && <span className="text-[9px] text-neutral-500 font-black">+{items.length - 3}</span>}</div>;
}
