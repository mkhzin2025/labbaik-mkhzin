import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import api from '../api/client';
import {
  ArrowLeftRight,
  BellOff,
  Building2,
  Check,
  Copy,
  FolderOpen,
  Loader2,
  Mail,
  MessageCircle,
  Save,
  StickyNote,
  Tag as TagIcon,
  User,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toEnglishDigits } from '@/lib/utils';
import CustomerAvatar from './CustomerAvatar';
import { useToast } from './Toast';

interface TaxonomyItem { id: string; name: string; color: string; isActive: boolean; scope?: 'organization' | 'store' }
interface Customer {
  id: string;
  storeId: string;
  store?: { id: string; name: string };
  fullName: string;
  email: string;
  phoneNumber: string;
  whatsappId?: string;
  notes: string;
  marketingOptOut?: boolean;
  marketingOptOutAt?: string | null;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  createdAt: string;
  updatedAt?: string;
}

type FormState = { fullName: string; email: string; notes: string; marketingOptOut: boolean; categoryIds: string[]; tagIds: string[] };

export interface CustomerTransferResult {
  customer: Customer;
  previousCustomerId: string;
  fromStoreId: string;
  toStoreId: string;
  /** Conversation ids before → after; they differ when a thread was merged into one in the target branch. */
  conversations: { from: string; to: string }[];
}

const toForm = (data: Customer): FormState => ({
  fullName: data.fullName || '',
  email: data.email || '',
  notes: data.notes || '',
  marketingOptOut: Boolean(data.marketingOptOut),
  categoryIds: (data.categories || []).map((item) => item.id),
  tagIds: (data.tags || []).map((item) => item.id),
});

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
const formatDate = (value?: string) => (value ? toEnglishDigits(format(new Date(value), 'yyyy/MM/dd')) : '—');
const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

// Names like "WhatsApp 9665..." are generated placeholders, not real customer names.
const isGeneratedName = (name?: string) => !name || /^(WhatsApp|العميل|عميل)\s/.test(name);

export default function CustomerProfile({ customerId, onClose, onUpdated, onTransferred }: {
  customerId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onTransferred?: (result: CustomerTransferResult) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [targetStoreId, setTargetStoreId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<FormState>({ fullName: '', email: '', notes: '', marketingOptOut: false, categoryIds: [], tagIds: [] });
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const { data } = await api.get<Customer>(`/customers/${customerId}`);
        const taxonomy = await api.get('/customers/taxonomy', { params: { storeId: data.storeId } });
        if (!active) return;
        setCustomer(data);
        setForm(toForm(data));
        setCategories(taxonomy.data?.categories || []);
        setTags(taxonomy.data?.tags || []);
      } catch (error) {
        if (active) showToast(errorMessage(error, 'تعذر جلب بيانات العميل.'), 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [customerId, showToast]);

  useEffect(() => {
    api.get('/stores')
      .then(({ data }) => setBranches(Array.isArray(data) ? data : (data?.stores || [])))
      .catch(() => setBranches([]));
  }, []);

  const handleTransfer = async () => {
    if (!customer || !targetStoreId || targetStoreId === customer.storeId) return;
    const targetName = branches.find((branch) => branch.id === targetStoreId)?.name || 'الفرع المحدد';
    if (dirty && !window.confirm('لديك تعديلات غير محفوظة ستضيع عند النقل. هل تريد المتابعة؟')) return;
    if (!window.confirm(`نقل العميل ومحادثاته إلى «${targetName}»؟\nرسائله القادمة ستصل إلى هذا الفرع.`)) return;
    setTransferring(true);
    try {
      const { data } = await api.patch<CustomerTransferResult>(`/conversations/customers/${customer.id}/store`, { storeId: targetStoreId });
      const taxonomy = await api.get('/customers/taxonomy', { params: { storeId: data.customer.storeId } }).catch(() => null);
      setCustomer(data.customer);
      setForm(toForm(data.customer));
      if (taxonomy) { setCategories(taxonomy.data?.categories || []); setTags(taxonomy.data?.tags || []); }
      setTargetStoreId('');
      showToast(`تم نقل العميل إلى «${targetName}».`, 'success');
      onTransferred?.(data);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر نقل العميل.'), 'error');
    } finally {
      setTransferring(false);
    }
  };

  const dirty = useMemo(() => {
    if (!customer) return false;
    const original = toForm(customer);
    return original.fullName !== form.fullName
      || original.email !== form.email
      || original.notes !== form.notes
      || original.marketingOptOut !== form.marketingOptOut
      || !sameIds(original.categoryIds, form.categoryIds)
      || !sameIds(original.tagIds, form.tagIds);
  }, [customer, form]);

  // Closing plays the slide-out first; onClose fires when the panel has left the screen.
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (closing) return;
    if (dirty && !window.confirm('لديك تعديلات غير محفوظة. هل تريد الإغلاق بدون حفظ؟')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) onClose();
    else setClosing(true);
  }, [closing, dirty, onClose]);

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [requestClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<FormState> = { ...form };
      if (!payload.email) delete payload.email;
      const { data } = await api.patch<Customer>(`/customers/${customerId}`, payload);
      setCustomer(data);
      setForm(toForm(data));
      showToast('تم حفظ بيانات العميل.', 'success');
      onUpdated?.();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حفظ بيانات العميل.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: 'categoryIds' | 'tagIds', id: string) => {
    setForm((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((item) => item !== id) : [...current[field], id] }));
  };

  const phone = customer?.phoneNumber || customer?.whatsappId || '';
  const phoneDigits = phone.replace(/[^0-9]/g, '');

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('تعذر نسخ الرقم.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-labelledby="customer-profile-title" dir="rtl">
      <div className={`absolute inset-0 bg-black/40 ${closing ? 'drawer-backdrop-out' : 'drawer-backdrop-in'}`} onClick={requestClose} />
      <aside
        onAnimationEnd={(event) => { if (closing && event.target === event.currentTarget) onClose(); }}
        className={`absolute inset-y-0 left-0 w-full max-w-lg flex flex-col bg-labbaik-surface border-r border-labbaik-border shadow-[0_0_48px_-12px_rgba(15,10,30,0.45)] ${closing ? 'drawer-left-out' : 'drawer-left-in'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-labbaik-border">
          {customer ? (
            <div className="flex items-center gap-3 min-w-0">
              <CustomerAvatar name={isGeneratedName(customer.fullName) ? '' : customer.fullName} seed={phone || customer.id} size={48} className="rounded-full" />
              <div className="min-w-0">
                <h2 id="customer-profile-title" className="text-lg font-black text-neutral-900 dark:text-white truncate">
                  {isGeneratedName(customer.fullName) ? phone || 'عميل بدون اسم' : customer.fullName}
                </h2>
                <p className="flex items-center gap-1 text-xs font-bold text-labbaik-text-muted">
                  <Building2 size={12} /> {customer.store?.name || 'فرع غير معروف'}
                </p>
              </div>
            </div>
          ) : (
            <h2 id="customer-profile-title" className="text-lg font-black text-neutral-900 dark:text-white">بيانات العميل</h2>
          )}
          <button type="button" onClick={requestClose} aria-label="إغلاق" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white hover:bg-labbaik-page cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {loading || !customer ? (
          <div className="flex-1 grid place-items-center">
            {loading ? <Loader2 className="animate-spin text-labbaik-blue" size={28} /> : <p className="text-sm text-labbaik-text-muted">تعذر تحميل بيانات العميل.</p>}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-6">
              {/* Contact */}
              <section className="space-y-2">
                {phone ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-10 flex items-center rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-black tabular-nums text-neutral-900 dark:text-white" dir="ltr">{phone}</span>
                    <button type="button" onClick={() => void copyPhone()} aria-label="نسخ الرقم" title="نسخ الرقم" className="grid h-10 w-10 place-items-center rounded-lg border border-labbaik-border text-labbaik-text-muted hover:text-labbaik-blue hover:border-labbaik-blue/40 cursor-pointer">
                      {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                    {phoneDigits && (
                      <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" aria-label="فتح في واتساب" title="فتح في واتساب" className="grid h-10 w-10 place-items-center rounded-lg border border-labbaik-border text-emerald-700 dark:text-emerald-400 hover:border-emerald-500/50">
                        <MessageCircle size={16} />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-labbaik-text-muted">لا يوجد رقم مسجل.</p>
                )}
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-labbaik-page px-3 py-2">
                    <dt className="text-labbaik-text-muted">تاريخ الإضافة</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-neutral-900 dark:text-white">{formatDate(customer.createdAt)}</dd>
                  </div>
                  <div className="rounded-lg bg-labbaik-page px-3 py-2">
                    <dt className="text-labbaik-text-muted">آخر تحديث</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-neutral-900 dark:text-white">{formatDate(customer.updatedAt)}</dd>
                  </div>
                </dl>
              </section>

              {/* Branch */}
              {branches.length > 1 && (
                <Field label="الفرع" icon={<Building2 size={13} />} htmlFor="customer-branch">
                  <div className="flex items-center gap-2">
                    <select
                      id="customer-branch"
                      value={targetStoreId || customer.storeId}
                      onChange={(e) => setTargetStoreId(e.target.value === customer.storeId ? '' : e.target.value)}
                      disabled={transferring}
                      className={`${inputClass} flex-1 cursor-pointer`}
                    >
                      {!branches.some((branch) => branch.id === customer.storeId) && <option value={customer.storeId}>{customer.store?.name || 'فرع غير معروف'}</option>}
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}{branch.id === customer.storeId ? ' (الحالي)' : ''}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleTransfer()}
                      disabled={!targetStoreId || transferring}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-labbaik-blue text-labbaik-blue text-sm font-black hover:bg-labbaik-blue hover:text-labbaik-on-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-labbaik-blue cursor-pointer"
                    >
                      {transferring ? <Loader2 className="animate-spin" size={15} /> : <ArrowLeftRight size={15} />} نقل
                    </button>
                  </div>
                  {targetStoreId && <p className="text-xs text-labbaik-text-muted">سينتقل العميل ومحادثاته، وتصل رسائله القادمة إلى الفرع الجديد.</p>}
                </Field>
              )}

              {/* Identity */}
              <section className="space-y-3">
                <Field label="الاسم" icon={<User size={13} />} htmlFor="customer-name">
                  <input id="customer-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
                </Field>
                <Field label="البريد الإلكتروني" icon={<Mail size={13} />} htmlFor="customer-email">
                  <input id="customer-email" type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" className={`${inputClass} text-right`} />
                </Field>
              </section>

              <SelectionBlock title="الفئات" kind="category" icon={<FolderOpen size={14} />} items={categories} selected={form.categoryIds} onToggle={(id) => toggle('categoryIds', id)} />
              <SelectionBlock title="التاقات" kind="tag" icon={<TagIcon size={14} />} items={tags} selected={form.tagIds} onToggle={(id) => toggle('tagIds', id)} />

              {/* Marketing consent */}
              <label
                htmlFor="customer-marketing-opt-out"
                className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors ${form.marketingOptOut ? 'border-red-500/40 bg-red-500/5' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
              >
                <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
                  <input
                    id="customer-marketing-opt-out"
                    type="checkbox"
                    role="switch"
                    checked={form.marketingOptOut}
                    onChange={(e) => setForm({ ...form, marketingOptOut: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-neutral-300 dark:bg-neutral-600 transition-colors peer-checked:bg-red-600 peer-focus-visible:ring-2 peer-focus-visible:ring-labbaik-blue/40" />
                  <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white"><BellOff size={14} /> لا يرغب في الرسائل التسويقية</span>
                  <span className="block mt-0.5 text-xs text-labbaik-text-muted">
                    {form.marketingOptOut && customer.marketingOptOut && customer.marketingOptOutAt
                      ? `مستبعد من الحملات منذ ${formatDate(customer.marketingOptOutAt)}، في كل الفروع.`
                      : 'يُستبعد رقمه تلقائيًا من حملات القوالب في كل الفروع. المحادثات العادية لا تتأثر.'}
                  </span>
                </span>
              </label>

              <Field label="ملاحظات الفريق" icon={<StickyNote size={13} />} htmlFor="customer-notes">
                <textarea
                  id="customer-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="معلومات تفيد الفريق عند التواصل مع العميل..."
                  className={`${inputClass} h-28 py-2.5 resize-none`}
                />
              </Field>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-labbaik-border">
              <span className="text-xs font-bold text-labbaik-text-muted">{dirty ? 'تعديلات غير محفوظة' : 'لا توجد تعديلات'}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={requestClose} className="h-10 px-4 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إغلاق</button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

const inputClass = 'w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted';

function Field({ label, icon, htmlFor, children }: { label: string; icon: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-labbaik-text-muted flex items-center gap-1.5">{icon}{label}</label>
      {children}
    </div>
  );
}

function SelectionBlock({ title, kind, icon, items, selected, onToggle }: { title: string; kind: 'category' | 'tag'; icon: ReactNode; items: TaxonomyItem[]; selected: string[]; onToggle: (id: string) => void }) {
  // Hidden items stay visible here only while the customer still has them, so they can be removed.
  const visible = items.filter((item) => item.isActive || selected.includes(item.id));
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold text-labbaik-text-muted flex items-center gap-1.5">{icon}{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((item) => {
          const on = selected.includes(item.id);
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onToggle(item.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 border text-xs font-bold transition-colors cursor-pointer ${kind === 'category' ? 'rounded-md' : 'rounded-full'} ${on ? 'text-neutral-900 dark:text-white' : 'border-labbaik-border text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
              style={on ? { borderColor: item.color, backgroundColor: `${item.color}1f` } : undefined}
            >
              {on ? <Check size={13} style={{ color: item.color }} /> : <span className={`h-2 w-2 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: item.color }} />}
              {kind === 'tag' && '#'}{item.name}
            </button>
          );
        })}
        {!visible.length && <span className="text-xs text-labbaik-text-muted">لا توجد {kind === 'category' ? 'فئات' : 'تاقات'} بعد. أضفها من صفحة العملاء ← «الفئات والتاقات».</span>}
      </div>
    </section>
  );
}
