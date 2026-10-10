import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import MetaWhatsAppSettingsPanel from '../components/settings/MetaWhatsAppSettingsPanel';
import { ArrowLeft, Bell, Building2, Check, Loader2, MapPin, Phone, Plus, Save, X } from 'lucide-react';

interface BranchItem {
  id: string;
  name: string;
  description?: string;
  phoneNumber?: string;
  website?: string;
  createdAt?: string;
}

type Tab = 'profile' | 'branches' | 'meta' | 'kb' | 'ai';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'المتجر والحساب' },
  { key: 'branches', label: 'الفروع' },
  { key: 'meta', label: 'ربط واتساب' },
  { key: 'kb', label: 'قاعدة المعرفة' },
  { key: 'ai', label: 'الرد الآلي' },
];

const DAYS = [
  { id: 0, name: 'الأحد' }, { id: 1, name: 'الاثنين' }, { id: 2, name: 'الثلاثاء' },
  { id: 3, name: 'الأربعاء' }, { id: 4, name: 'الخميس' }, { id: 5, name: 'الجمعة' }, { id: 6, name: 'السبت' },
];

const AI_MODES = [
  { id: 'always', name: 'دائمًا', desc: 'يرد تيل بوت على كل رسالة في أي وقت.' },
  { id: 'off_hours', name: 'خارج الدوام فقط', desc: 'يرد تيل بوت عندما يكون المتجر مغلقًا، ويترك الدوام للفريق.' },
  { id: 'manual', name: 'متوقف', desc: 'لا يرد تيل بوت آليًا؛ الفريق يرد على كل المحادثات.' },
];

const AI_MODELS = [
  { id: 'deepseek_groq', name: 'DeepSeek-R1', via: 'Groq', desc: 'أدق في الأسئلة التي تحتاج تفكيرًا.' },
  { id: 'groq', name: 'Llama 3.1', via: 'Groq', desc: 'متوازن وسريع للردود اليومية.' },
  { id: 'deepseek', name: 'DeepSeek V3', via: 'DeepSeek', desc: 'النسخة الرسمية من DeepSeek.' },
  { id: 'gemini', name: 'Gemini 1.5', via: 'Google', desc: 'جيد في الأسئلة الطويلة والمتشعبة.' },
  { id: 'openai', name: 'GPT-3.5', via: 'OpenAI', desc: 'مستقر ومجرّب.' },
];

const KB_LIMIT = 20000;

const inputClass = 'w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted';
const primaryButton = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
const secondaryButton = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-40 cursor-pointer';

const errorMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join('، ') : message || fallback;
};

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get('tab');
    return TABS.some((t) => t.key === tab) ? (tab as Tab) : 'profile';
  });
  const { showToast } = useToast();

  const [storeData, setStoreData] = useState<any>({
    name: '',
    description: '',
    website: '',
    phoneNumber: '',
    knowledgeBase: '',
    aiMode: 'always',
    preferredModel: 'groq',
    workingHours: { start: '09:00', end: '22:00', enabledDays: [0, 1, 2, 3, 4, 6] },
  });
  const [userData, setUserData] = useState({ fullName: '', email: '' });
  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', phone: '', desc: '' });
  const [addingBranch, setAddingBranch] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [storeRes, userRes, branchesRes] = await Promise.all([
          api.get('/stores/me').catch(() => ({ data: {} })),
          api.get('/users/me').catch(() => ({ data: {} })),
          api.get('/stores').catch(() => ({ data: [] })),
        ]);
        if (storeRes.data?.id) {
          setStoreData({
            ...storeRes.data,
            preferredModel: storeRes.data.preferredModel || 'groq',
            workingHours: storeRes.data.workingHours || { start: '09:00', end: '22:00', enabledDays: [0, 1, 2, 3, 4, 6] },
          });
        }
        setUserData({ fullName: userRes.data?.fullName || '', email: userRes.data?.email || '' });
        setBranches(branchesRes.data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadBranches = async () => {
    try {
      const { data } = await api.get('/stores');
      setBranches(data || []);
    } catch {
      /* the list keeps its previous state */
    }
  };

  const handleSaveStore = async (successMessage = 'تم حفظ إعدادات المتجر.') => {
    setSavingStore(true);
    try {
      const { name, description, website, knowledgeBase, phoneNumber, aiMode, workingHours, preferredModel } = storeData;
      await api.patch('/stores/me', { name, description, website, knowledgeBase, phoneNumber, aiMode, workingHours, preferredModel });
      showToast(successMessage, 'success');
      void loadBranches();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حفظ الإعدادات. تحقق من الاتصال وحاول مرة أخرى.'), 'error');
    } finally {
      setSavingStore(false);
    }
  };

  const handleSaveUser = async () => {
    if (passwords.next && passwords.next.length < 8) return showToast('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.', 'error');
    if (passwords.next !== passwords.confirm) return showToast('تأكيد كلمة المرور غير مطابق.', 'error');
    setSavingUser(true);
    try {
      const payload: Record<string, string> = { fullName: userData.fullName, email: userData.email };
      if (passwords.next) payload.password = passwords.next;
      await api.patch('/users/me', payload);
      // Keep the cached user (shown in the top bar) in sync with the new name/email.
      try {
        const cached = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...cached, fullName: userData.fullName, email: userData.email }));
      } catch { /* storage unavailable */ }
      setPasswords({ next: '', confirm: '' });
      showToast(passwords.next ? 'تم تحديث الحساب وكلمة المرور.' : 'تم تحديث بيانات الحساب.', 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحديث بيانات الحساب.'), 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name.trim()) return showToast('اكتب اسم الفرع.', 'error');
    setAddingBranch(true);
    try {
      await api.post('/stores/branch', {
        name: newBranch.name.trim(),
        phoneNumber: newBranch.phone.trim() || undefined,
        description: newBranch.desc.trim() || undefined,
      });
      showToast(`تمت إضافة فرع «${newBranch.name.trim()}».`, 'success');
      setNewBranch({ name: '', phone: '', desc: '' });
      setShowAddBranch(false);
      await loadBranches();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إضافة الفرع.'), 'error');
    } finally {
      setAddingBranch(false);
    }
  };

  const toggleDay = (day: number) => {
    const days: number[] = storeData.workingHours.enabledDays || [];
    const enabledDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, enabledDays } });
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const testNotification = () => {
    if (!('Notification' in window)) return showToast('المتصفح لا يدعم إشعارات سطح المكتب.', 'error');
    if (Notification.permission !== 'granted') return showToast('فعّل الإشعارات أولًا من أيقونة الجرس أعلى الصفحة.', 'info');
    new Notification('اختبار تيل بوت', { body: 'إشعارات سطح المكتب تعمل.' });
    showToast('تم إرسال إشعار تجريبي.', 'success');
  };

  if (loading) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-3 text-labbaik-text-muted" dir="rtl">
        <Loader2 size={28} className="animate-spin text-labbaik-blue" />
        <p className="text-sm font-bold">جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  const kbLength = String(storeData.knowledgeBase || '').length;

  return (
    <div className="max-w-5xl space-y-4 pb-10" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white">الإعدادات</h1>
        <p className="mt-1 text-sm text-labbaik-text-muted">بيانات المتجر والحساب، والفروع، وربط واتساب، وسلوك الرد الآلي.</p>
      </div>

      <div className="flex gap-1 border-b border-labbaik-border overflow-x-auto" role="tablist" aria-label="أقسام الإعدادات">
        {TABS.map((t) => (
          <button
            type="button"
            role="tab"
            key={t.key}
            aria-selected={activeTab === t.key}
            onClick={() => handleTabChange(t.key)}
            className={`h-10 px-3 -mb-px border-b-2 text-sm font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === t.key ? 'border-labbaik-blue text-labbaik-blue dark:text-purple-300' : 'border-transparent text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
          >
            {t.label}
            {t.key === 'branches' && <span className="text-[11px] tabular-nums px-1.5 rounded-full bg-neutral-500/10">{branches.length}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'meta' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><MetaWhatsAppSettingsPanel /></div>}

      {activeTab === 'profile' && (
        <div className="space-y-4">
          <Panel title="بيانات المتجر" hint="تظهر للعملاء ويستخدمها تيل بوت في التعريف بمتجرك.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="اسم المتجر" htmlFor="store-name">
                <input id="store-name" value={storeData.name || ''} onChange={(e) => setStoreData({ ...storeData, name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="رقم التواصل" htmlFor="store-phone">
                <input id="store-phone" type="tel" dir="ltr" value={storeData.phoneNumber || ''} onChange={(e) => setStoreData({ ...storeData, phoneNumber: e.target.value })} placeholder="+9665XXXXXXXX" className={`${inputClass} text-left tabular-nums`} />
              </Field>
              <Field label="الموقع الإلكتروني" htmlFor="store-website">
                <input id="store-website" type="url" dir="ltr" value={storeData.website || ''} onChange={(e) => setStoreData({ ...storeData, website: e.target.value })} placeholder="https://" className={`${inputClass} text-left`} />
              </Field>
              <Field label="وصف مختصر" htmlFor="store-desc">
                <input id="store-desc" value={storeData.description || ''} onChange={(e) => setStoreData({ ...storeData, description: e.target.value })} placeholder="مثال: متجر أثاث منزلي في الرياض" className={inputClass} />
              </Field>
            </div>
            <div className="mt-4">
              <button type="button" onClick={() => void handleSaveStore()} disabled={savingStore} className={primaryButton}>
                {savingStore ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ بيانات المتجر
              </button>
            </div>
          </Panel>

          <Panel title="حسابك" hint="بيانات دخولك إلى لوحة التحكم.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="الاسم الكامل" htmlFor="user-fullname">
                <input id="user-fullname" autoComplete="name" value={userData.fullName} onChange={(e) => setUserData({ ...userData, fullName: e.target.value })} className={inputClass} />
              </Field>
              <Field label="البريد الإلكتروني" htmlFor="user-email">
                <input id="user-email" type="email" autoComplete="email" dir="ltr" value={userData.email} onChange={(e) => setUserData({ ...userData, email: e.target.value })} className={`${inputClass} text-left`} />
              </Field>
              <Field label="كلمة مرور جديدة (اختياري)" htmlFor="user-password">
                <input id="user-password" type="password" autoComplete="new-password" dir="ltr" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} placeholder="8 أحرف على الأقل" className={`${inputClass} text-left`} />
              </Field>
              <Field label="تأكيد كلمة المرور" htmlFor="user-password-confirm">
                <input id="user-password-confirm" type="password" autoComplete="new-password" dir="ltr" disabled={!passwords.next} value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className={`${inputClass} text-left disabled:opacity-50`} />
              </Field>
            </div>
            {passwords.next && passwords.confirm && passwords.next !== passwords.confirm && (
              <p className="mt-2 text-xs font-bold text-red-700 dark:text-red-400">تأكيد كلمة المرور غير مطابق.</p>
            )}
            <div className="mt-4">
              <button type="button" onClick={() => void handleSaveUser()} disabled={savingUser} className={primaryButton}>
                {savingUser ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} تحديث الحساب
              </button>
            </div>
          </Panel>

          <Panel title="إشعارات سطح المكتب" hint="تأكد أن إشعارات الرسائل الجديدة تصلك حتى والصفحة في الخلفية.">
            <button type="button" onClick={testNotification} className={secondaryButton}>
              <Bell size={16} /> إرسال إشعار تجريبي
            </button>
          </Panel>
        </div>
      )}

      {activeTab === 'branches' && (
        <Panel
          title="فروع المؤسسة"
          hint="لكل فرع محادثاته وعملاؤه، ويمكن ربطه برقم واتساب خاص أو استخدام رقم المنظمة."
          aside={!showAddBranch && (
            <button type="button" onClick={() => setShowAddBranch(true)} className={primaryButton}><Plus size={16} /> فرع جديد</button>
          )}
        >
          {showAddBranch && (
            <form onSubmit={(e) => void handleCreateBranch(e)} className="mb-4 rounded-lg border border-labbaik-border bg-labbaik-page p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-neutral-900 dark:text-white">فرع جديد</h3>
                <button type="button" onClick={() => setShowAddBranch(false)} aria-label="إلغاء" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="اسم الفرع" htmlFor="branch-name">
                  <input id="branch-name" required autoFocus value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="مثال: فرع جدة - الكورنيش" className={inputClass} />
                </Field>
                <Field label="رقم الهاتف (اختياري)" htmlFor="branch-phone">
                  <input id="branch-phone" type="tel" dir="ltr" value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} placeholder="+9665XXXXXXXX" className={`${inputClass} text-left tabular-nums`} />
                </Field>
                <Field label="العنوان أو المدينة (اختياري)" htmlFor="branch-desc">
                  <input id="branch-desc" value={newBranch.desc} onChange={(e) => setNewBranch({ ...newBranch, desc: e.target.value })} placeholder="مثال: شارع الأندلس" className={inputClass} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddBranch(false)} disabled={addingBranch} className="h-10 px-4 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
                <button type="submit" disabled={addingBranch || !newBranch.name.trim()} className={primaryButton}>
                  {addingBranch ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} إضافة الفرع
                </button>
              </div>
            </form>
          )}

          <ul className="divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
            {branches.map((branch, index) => (
              <li key={branch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300"><Building2 size={17} /></span>
                <div className="flex-1 min-w-40">
                  <p className="flex items-center gap-2 font-bold text-neutral-900 dark:text-white">
                    {branch.name}
                    {index === 0 && <span className="h-5 px-1.5 rounded bg-labbaik-blue/10 text-[11px] font-bold leading-5 text-labbaik-blue dark:text-purple-300">الرئيسي</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-labbaik-text-muted">
                    {branch.description && <span className="inline-flex items-center gap-1"><MapPin size={12} />{branch.description}</span>}
                    {branch.phoneNumber && <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr"><Phone size={12} />{branch.phoneNumber}</span>}
                    {!branch.description && !branch.phoneNumber && <span>بدون عنوان أو رقم</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { localStorage.setItem('active_store_id', branch.id); handleTabChange('meta'); }}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-blue dark:text-purple-300 hover:bg-labbaik-blue/10 cursor-pointer"
                >
                  ربط واتساب لهذا الفرع <ArrowLeft size={13} />
                </button>
              </li>
            ))}
            {!branches.length && <li className="py-8 text-center text-sm text-labbaik-text-muted">لا توجد فروع بعد.</li>}
          </ul>
        </Panel>
      )}

      {activeTab === 'kb' && (
        <Panel
          title="قاعدة المعرفة"
          hint="كل ما يجب أن يعرفه تيل بوت عن متجرك ليجيب العملاء بدقة."
          aside={(
            <button type="button" onClick={() => void handleSaveStore('تم حفظ قاعدة المعرفة. سيعتمد عليها تيل بوت في الردود القادمة.')} disabled={savingStore} className={primaryButton}>
              {savingStore ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ
            </button>
          )}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
            <div>
              <label htmlFor="knowledge-base" className="sr-only">قاعدة المعرفة</label>
              <textarea
                id="knowledge-base"
                value={storeData.knowledgeBase || ''}
                onChange={(e) => setStoreData({ ...storeData, knowledgeBase: e.target.value })}
                maxLength={KB_LIMIT}
                placeholder={'مثال:\nساعات العمل: من 9 صباحًا حتى 10 مساءً، الجمعة مغلق.\nالتوصيل: مجاني داخل الرياض للطلبات فوق 500 ريال.\nالاسترجاع: خلال 14 يومًا بشرط سلامة المنتج.'}
                className="w-full min-h-[420px] rounded-lg border border-labbaik-border bg-labbaik-page p-4 text-sm leading-7 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted resize-y"
              />
              <p className="mt-1 text-xs text-labbaik-text-muted tabular-nums text-left" dir="ltr">{kbLength.toLocaleString('en')} / {KB_LIMIT.toLocaleString('en')}</p>
            </div>
            <aside className="rounded-lg bg-labbaik-page p-3 text-sm text-neutral-800 dark:text-neutral-100 space-y-2 h-fit">
              <p className="font-bold">ماذا تكتب هنا؟</p>
              <ul className="space-y-1.5 text-xs text-labbaik-text-muted leading-relaxed list-disc pr-4">
                <li>ساعات العمل والمواقع</li>
                <li>سياسة التوصيل والاسترجاع</li>
                <li>طرق الدفع المتاحة</li>
                <li>الأسئلة الشائعة وإجاباتها</li>
                <li>ما لا يجب أن يجيب عنه تيل بوت ويحوّله للفريق</li>
              </ul>
            </aside>
          </div>
        </Panel>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-4">
          <Panel title="متى يرد تيل بوت آليًا؟">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2" role="radiogroup" aria-label="وضع الرد الآلي">
              {AI_MODES.map((mode) => {
                const on = storeData.aiMode === mode.id;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    key={mode.id}
                    onClick={() => setStoreData({ ...storeData, aiMode: mode.id })}
                    className={`rounded-lg border p-3 text-right transition-colors cursor-pointer ${on ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                      {mode.name}
                      <RadioDot on={on} />
                    </span>
                    <span className="mt-1 block text-xs text-labbaik-text-muted leading-relaxed">{mode.desc}</span>
                  </button>
                );
              })}
            </div>

            {storeData.aiMode === 'off_hours' && (
              <div className="mt-4 pt-4 border-t border-labbaik-border space-y-3">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">ساعات الدوام</p>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <Field label="من" htmlFor="working-start">
                    <input id="working-start" type="time" value={storeData.workingHours.start} onChange={(e) => setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, start: e.target.value } })} className={`${inputClass} tabular-nums`} />
                  </Field>
                  <Field label="إلى" htmlFor="working-end">
                    <input id="working-end" type="time" value={storeData.workingHours.end} onChange={(e) => setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, end: e.target.value } })} className={`${inputClass} tabular-nums`} />
                  </Field>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold text-labbaik-text-muted">أيام العمل</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => {
                      const on = (storeData.workingHours.enabledDays || []).includes(day.id);
                      return (
                        <button
                          type="button"
                          key={day.id}
                          aria-pressed={on}
                          onClick={() => toggleDay(day.id)}
                          className={`inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-bold transition-colors cursor-pointer ${on ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-labbaik-text-muted hover:text-labbaik-blue'}`}
                        >
                          {on && <Check size={12} />}{day.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="محرك الذكاء الاصطناعي" hint="إذا تعطل المحرك المختار ينتقل تيل بوت تلقائيًا إلى محرك احتياطي حتى لا تتوقف الردود.">
            <div className="divide-y divide-labbaik-border rounded-lg border border-labbaik-border" role="radiogroup" aria-label="محرك الذكاء الاصطناعي">
              {AI_MODELS.map((model) => {
                const on = storeData.preferredModel === model.id;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    key={model.id}
                    onClick={() => setStoreData({ ...storeData, preferredModel: model.id })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-right transition-colors cursor-pointer ${on ? 'bg-labbaik-blue/8' : 'hover:bg-labbaik-page'}`}
                  >
                    <RadioDot on={on} />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-neutral-900 dark:text-white" dir="ltr">{model.name}</span>
                      <span className="text-xs text-labbaik-text-muted"> · {model.via}</span>
                      <span className="block text-xs text-labbaik-text-muted">{model.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-labbaik-page/90 border-t border-labbaik-border">
            <button type="button" onClick={() => void handleSaveStore('تم حفظ إعدادات الرد الآلي.')} disabled={savingStore} className={primaryButton}>
              {savingStore ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ إعدادات الرد الآلي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, hint, aside, children }: { title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-black text-neutral-900 dark:text-white">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-labbaik-text-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-labbaik-text-muted">{label}</label>
      {children}
    </div>
  );
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-labbaik-blue dark:border-purple-300' : 'border-neutral-400 dark:border-neutral-500'}`} aria-hidden="true">
      {on && <span className="h-2 w-2 rounded-full bg-labbaik-blue dark:bg-purple-300" />}
    </span>
  );
}
