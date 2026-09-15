import { useEffect, useState, type ReactNode } from 'react';
import api from '../api/client';
import {
  Building2,
  Calendar,
  FolderOpen,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  StickyNote,
  Tag as TagIcon,
  User,
  X,
} from 'lucide-react';
import { useToast } from './Toast';

interface TaxonomyItem { id: string; name: string; color: string; isActive: boolean; }
interface Customer {
  id: string;
  storeId: string;
  store?: { id: string; name: string };
  fullName: string;
  email: string;
  phoneNumber: string;
  notes: string;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  createdAt: string;
}

export default function CustomerProfile({ customerId, onClose, onUpdated }: { customerId: string; onClose: () => void; onUpdated?: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', email: '', notes: '', categoryIds: [] as string[], tagIds: [] as string[] });
  const { showToast } = useToast();

  useEffect(() => { void fetchCustomer(); }, [customerId]);

  const fetchCustomer = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${customerId}`);
      setCustomer(data);
      setFormData({
        fullName: data.fullName || '',
        email: data.email || '',
        notes: data.notes || '',
        categoryIds: (data.categories || []).map((item: TaxonomyItem) => item.id),
        tagIds: (data.tags || []).map((item: TaxonomyItem) => item.id),
      });
      const taxonomy = await api.get('/customers/taxonomy', { params: { storeId: data.storeId } });
      setCategories(taxonomy.data?.categories || []);
      setTags(taxonomy.data?.tags || []);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر جلب بطاقة العميل.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...formData };
      if (!payload.email) delete payload.email;
      const { data } = await api.patch(`/customers/${customerId}`, payload);
      setCustomer(data);
      setFormData((current) => ({ ...current, categoryIds: (data.categories || []).map((item: TaxonomyItem) => item.id), tagIds: (data.tags || []).map((item: TaxonomyItem) => item.id) }));
      showToast('تم حفظ بيانات وتصنيفات العميل بنجاح.', 'success');
      onUpdated?.();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'فشل حفظ بيانات العميل.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: 'categoryIds' | 'tagIds', id: string) => {
    setFormData((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((item) => item !== id) : [...current[field], id] }));
  };

  if (loading) return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-md"><div className="bg-labbaik-surface p-16 rounded-[3rem] border border-white/5 flex flex-col items-center gap-4"><Loader2 className="animate-spin text-labbaik-blue" size={44} /><p className="font-black text-neutral-500">جاري جلب الملف...</p></div></div>;
  if (!customer) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-labbaik-surface border border-white/10 rounded-[3rem] shadow-3xl w-full max-w-3xl overflow-hidden animate-slide-up" dir="rtl">
        <div className="bg-gradient-to-r from-labbaik-blue/10 to-transparent p-7 lg:p-9 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-5"><div className="w-14 h-14 bg-labbaik-blue/20 rounded-2xl flex items-center justify-center border border-labbaik-blue/30"><User className="text-labbaik-blue" size={28} /></div><div><h3 className="text-2xl font-black text-neutral-900 dark:text-white">بطاقة العميل</h3><p className="text-neutral-500 text-xs mt-1 font-bold">الهوية، الفرع، الفئات والتاقات المستخدمة في قوائم الإرسال.</p></div></div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl text-neutral-500 hover:text-white"><X size={26} /></button>
        </div>

        <div className="p-7 lg:p-9 space-y-8 max-h-[72vh] overflow-y-auto custom-scrollbar">
          <div className="rounded-2xl border border-labbaik-blue/15 bg-labbaik-blue/5 p-4 flex items-center gap-3"><Building2 size={19} className="text-labbaik-blue" /><div><div className="text-[10px] font-black text-neutral-500">الفرع المرتبط</div><div className="font-black text-neutral-900 dark:text-white">{customer.store?.name || customer.storeId}</div></div></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="الاسم بالكامل" icon={<User size={12} />}><input value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} className="field-input" /></Field>
            <Field label="البريد الإلكتروني" icon={<Mail size={12} />}><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="field-input" /></Field>
            <Field label="رقم التواصل" icon={<Phone size={12} />}><div className="field-input flex items-center gap-3"><ShieldCheck size={17} className="text-green-500" /><span className="font-black tabular-nums">{customer.phoneNumber || 'غير مسجل'}</span></div></Field>
            <Field label="تاريخ الانضمام" icon={<Calendar size={12} />}><div className="field-input text-xs text-neutral-500">{new Date(customer.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</div></Field>
          </div>

          <SelectionBlock title="فئات العميل" icon={<FolderOpen size={15} />} items={categories} selected={formData.categoryIds} onToggle={(id) => toggle('categoryIds', id)} empty="أنشئ الفئات من شاشة العملاء أولاً." />
          <SelectionBlock title="تاقات العميل" icon={<TagIcon size={15} />} items={tags} selected={formData.tagIds} onToggle={(id) => toggle('tagIds', id)} empty="أنشئ التاقات من شاشة العملاء أولاً." />

          <Field label="ملاحظات الموظف" icon={<StickyNote size={13} />}><textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full h-32 bg-white/5 border border-white/10 rounded-[1.7rem] p-5 text-sm text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-labbaik-blue/40 resize-none" /></Field>
        </div>

        <div className="p-7 bg-white/5 border-t border-white/5 flex justify-end"><button onClick={handleSave} disabled={saving} className="bg-labbaik-blue text-white px-9 py-3.5 rounded-2xl font-black text-sm flex items-center gap-3 hover:scale-[1.02] transition disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ التحديثات</button></div>
      </div>
      <style>{`.field-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:1rem;padding:.9rem 1.15rem;font-size:.875rem;outline:none}.field-input:focus{box-shadow:0 0 0 2px rgba(80,90,255,.25)}`}</style>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 px-1 flex items-center gap-2">{icon}{label}</label>{children}</div>;
}

function SelectionBlock({ title, icon, items, selected, onToggle, empty }: { title: string; icon: ReactNode; items: TaxonomyItem[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  return <div className="space-y-3"><h4 className="text-xs font-black text-neutral-500 flex items-center gap-2">{icon}{title}</h4><div className="flex flex-wrap gap-2">{items.filter((item) => item.isActive).map((item) => <button type="button" key={item.id} onClick={() => onToggle(item.id)} className={`px-4 py-2 rounded-xl text-xs font-black border transition ${selected.includes(item.id) ? 'ring-2 ring-labbaik-blue/20' : 'opacity-60 hover:opacity-100'}`} style={{ color: item.color, borderColor: `${item.color}55`, backgroundColor: selected.includes(item.id) ? `${item.color}1f` : `${item.color}0c` }}>{item.name}{selected.includes(item.id) ? ' ✓' : ''}</button>)}{!items.length && <span className="text-xs text-neutral-600">{empty}</span>}</div></div>;
}
