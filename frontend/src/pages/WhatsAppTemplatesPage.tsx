import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  FolderOpen,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  Send,
  Settings,
  Tag,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import CustomerAvatar from '../components/CustomerAvatar';
import type { Branch } from '../components/customers/BranchSelector';

type TemplateComponent = { type: string; text?: string; format?: string; buttons?: any[]; [key: string]: any };
type Template = { id: string; name: string; language: string; category?: string; status?: string; components: TemplateComponent[] };
type Taxonomy = { id: string; name: string; color: string; isActive: boolean; scope?: 'organization' | 'store'; storeId?: string | null };
type Customer = { id: string; storeId: string; store?: Branch; fullName?: string; phoneNumber?: string; whatsappId?: string; email?: string; marketingOptOut?: boolean; categories: Taxonomy[]; tags: Taxonomy[] };
type MetaConnection = { id: string; scope: 'organization' | 'store'; storeId?: string | null; defaultStoreId?: string | null; displayPhoneNumber?: string; phoneNumberId: string; status?: string };
type AudienceMode = 'all' | 'segment' | 'manual';

const MAX_RECIPIENTS = 5000;

const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { details?: string; message?: string } } })?.response?.data;
  return data?.details || data?.message || fallback;
};

const isApproved = (t?: Template | null) => String(t?.status).toUpperCase() === 'APPROVED';

export default function WhatsAppTemplatesPage() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [singleStoreId, setSingleStoreId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [taxonomy, setTaxonomy] = useState<{ categories: Taxonomy[]; tags: Taxonomy[] }>({ categories: [], tags: [] });
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'single' | 'list'>('list');
  const [to, setTo] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [bodyValues, setBodyValues] = useState<string[]>([]);
  const [headerValues, setHeaderValues] = useState<string[]>([]);
  const [buttonValues, setButtonValues] = useState<Array<{ index: number; text: string; label: string; url?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const audienceRequest = useRef(0);

  const connection = useMemo(() => connections.find((item) => item.id === connectionId), [connections, connectionId]);
  const isOrgNumber = connection?.scope === 'organization';
  const targetStoreIds = useMemo(
    () => (connection ? (isOrgNumber ? selectedStoreIds : connection.storeId ? [connection.storeId] : []) : []),
    [connection, isOrgNumber, selectedStoreIds],
  );

  const resetAudience = () => {
    setCategoryFilter([]);
    setTagFilter([]);
    setManualIds([]);
    setExcludedIds([]);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [storeRes, connectionRes] = await Promise.all([api.get('/stores'), api.get('/integrations/meta/whatsapp/connections')]);
        const branchRows: Branch[] = storeRes.data || [];
        const connectionRows: MetaConnection[] = connectionRes.data || [];
        setBranches(branchRows);
        setConnections(connectionRows);
        const preferred = connectionRows.find((item) => item.scope === 'organization') || connectionRows[0];
        setConnectionId(preferred?.id || '');
        if (!preferred) setLoading(false);
      } catch (error) {
        showToast(errorMessage(error, 'تعذر تحميل إعدادات واتساب.'), 'error');
        setLoading(false);
      }
    })();
  }, [showToast]);

  const loadTemplates = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/integrations/meta/whatsapp/templates', { params: { connectionId: id } });
      setTemplates(data || []);
    } catch (error) {
      setTemplates([]);
      showToast(errorMessage(error, 'تعذر تحميل القوالب.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Switching the sending number resets the template, audience and target branches.
  useEffect(() => {
    if (!connection) return;
    setSelected(null);
    resetAudience();
    if (connection.scope === 'store') {
      const sid = connection.storeId || '';
      setSelectedStoreIds(sid ? [sid] : []);
      setSingleStoreId(sid);
    } else {
      setSelectedStoreIds(branches.map((b) => b.id));
      setSingleStoreId(connection.defaultStoreId || branches[0]?.id || '');
    }
    void loadTemplates(connection.id);
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audience: every WhatsApp-reachable customer in the target branches, plus the categories/tags available there.
  useEffect(() => {
    if (!connection || !targetStoreIds.length) { setCustomers([]); return; }
    const id = ++audienceRequest.current;
    setAudienceLoading(true);
    void (async () => {
      try {
        const params: Record<string, unknown> = { whatsappOnly: true };
        if (isOrgNumber) { params.scope = 'organization'; params.storeIds = targetStoreIds.join(','); }
        else params.storeId = connection.storeId;
        const [customerRes, ...taxonomyRes] = await Promise.all([
          api.get('/customers', { params }),
          ...targetStoreIds.map((storeId) => api.get('/customers/taxonomy', { params: { storeId } })),
        ]);
        if (id !== audienceRequest.current) return;
        setCustomers(Array.isArray(customerRes.data) ? customerRes.data : []);
        const merge = (key: 'categories' | 'tags') => {
          const map = new Map<string, Taxonomy>();
          taxonomyRes.forEach((res) => (res.data?.[key] || []).forEach((item: Taxonomy) => item.isActive && map.set(item.id, item)));
          return [...map.values()];
        };
        setTaxonomy({ categories: merge('categories'), tags: merge('tags') });
      } catch (error) {
        if (id === audienceRequest.current) showToast(errorMessage(error, 'تعذر تحميل جمهور الإرسال.'), 'error');
      } finally {
        if (id === audienceRequest.current) setAudienceLoading(false);
      }
    })();
  }, [connection, isOrgNumber, targetStoreIds, showToast]);

  const sync = async () => {
    if (!connectionId) return;
    setSyncing(true);
    try {
      const { data } = await api.post('/integrations/meta/whatsapp/templates/sync', null, { params: { connectionId } });
      setTemplates(data.templates || []);
      showToast(`تم جلب ${data.synced || 0} قالب من Meta.`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'فشل جلب القوالب.'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const isAuth = isAuthTemplate(selected);

  const choose = (template: Template) => {
    setSelected(template);
    setOtpCode('');
    setBodyValues(Array(bodyPlaceholderCount(template)).fill(''));
    setHeaderValues(Array(headerPlaceholderCount(template)).fill(''));
    setButtonValues(getDynamicButtons(template));
  };

  // ---- Audience ----
  const matchesSegment = useCallback((customer: Customer) => {
    const inCategory = !categoryFilter.length || (customer.categories || []).some((item) => categoryFilter.includes(item.id));
    const inTag = !tagFilter.length || (customer.tags || []).some((item) => tagFilter.includes(item.id));
    return inCategory && inTag;
  }, [categoryFilter, tagFilter]);

  const baseAudience = useMemo(() => {
    if (audienceMode === 'all') return customers;
    if (audienceMode === 'segment') return categoryFilter.length || tagFilter.length ? customers.filter(matchesSegment) : [];
    return customers.filter((customer) => manualIds.includes(customer.id));
  }, [audienceMode, customers, categoryFilter, tagFilter, manualIds, matchesSegment]);

  const chosen = useMemo(
    () => (audienceMode === 'manual' ? baseAudience : baseAudience.filter((customer) => !excludedIds.includes(customer.id))),
    [audienceMode, baseAudience, excludedIds],
  );
  // Customers who declined marketing never receive a campaign; the server enforces the same rule.
  const recipients = useMemo(() => chosen.filter((customer) => !customer.marketingOptOut), [chosen]);
  const optedOutCount = chosen.length - recipients.length;
  const recipientStats = dedupeStats(recipients);

  const listForPicker = useMemo(() => {
    const pool = audienceMode === 'manual' ? customers : baseAudience;
    const q = customerSearch.trim().toLowerCase();
    if (!q) return pool;
    const digits = q.replace(/[^0-9]/g, '').replace(/^0+/, '');
    return pool.filter((customer) => {
      const text = `${customer.fullName || ''} ${customer.store?.name || ''}`.toLowerCase();
      const phone = String(customer.phoneNumber || customer.whatsappId || '');
      return text.includes(q) || (digits && phone.includes(digits));
    });
  }, [audienceMode, customers, baseAudience, customerSearch]);

  const isIncluded = (id: string) => (audienceMode === 'manual' ? manualIds.includes(id) : !excludedIds.includes(id));
  const toggleCustomer = (id: string) => {
    if (audienceMode === 'manual') setManualIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    else setExcludedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };
  const includeShown = () => {
    const ids = listForPicker.map((c) => c.id);
    if (audienceMode === 'manual') setManualIds((current) => [...new Set([...current, ...ids])]);
    else setExcludedIds((current) => current.filter((id) => !ids.includes(id)));
  };
  const excludeShown = () => {
    const ids = listForPicker.map((c) => c.id);
    if (audienceMode === 'manual') setManualIds((current) => current.filter((id) => !ids.includes(id)));
    else setExcludedIds((current) => [...new Set([...current, ...ids])]);
  };

  const toggleBranch = (id: string) => {
    if (!isOrgNumber) return;
    setSelectedStoreIds((current) => (current.includes(id) ? (current.length > 1 ? current.filter((x) => x !== id) : current) : [...current, id]));
    setManualIds([]);
    setExcludedIds([]);
  };

  const audienceSummary = () => {
    const branchNames = branches.filter((b) => targetStoreIds.includes(b.id)).map((b) => b.name);
    const parts = [branchNames.length === branches.length && branches.length > 1 ? 'كل الفروع' : branchNames.join('، ')];
    if (audienceMode === 'segment') {
      const names = (ids: string[], items: Taxonomy[]) => items.filter((i) => ids.includes(i.id)).map((i) => i.name).join(' أو ');
      if (categoryFilter.length) parts.push(`الفئة: ${names(categoryFilter, taxonomy.categories)}`);
      if (tagFilter.length) parts.push(`التاق: ${names(tagFilter, taxonomy.tags)}`);
    }
    if (audienceMode === 'manual') parts.push('اختيار يدوي');
    if (audienceMode !== 'manual' && excludedIds.length) parts.push(`باستثناء ${excludedIds.filter((id) => baseAudience.some((c) => c.id === id)).length}`);
    return parts.filter(Boolean).join(' · ');
  };

  // ---- Send ----
  const validateVariables = () => {
    if (isAuth) {
      if (!otpCode.trim()) { showToast('أدخل رمز التحقق (OTP).', 'error'); return false; }
      return true;
    }
    if ([...bodyValues, ...headerValues].some((value) => !value.trim())) { showToast('أكمل جميع متغيرات نص القالب.', 'error'); return false; }
    if (buttonValues.some((b) => !b.text.trim())) { showToast('أكمل متغيرات الأزرار الديناميكية.', 'error'); return false; }
    return true;
  };

  const requestSend = () => {
    if (!selected || !connection || !validateVariables()) return;
    if (mode === 'single') { if (!to.trim()) { showToast('أدخل رقم المستلم.', 'error'); return; } void send(); return; }
    if (!recipients.length) { showToast('لا يوجد مستلمون في الجمهور الحالي.', 'error'); return; }
    if (recipients.length > MAX_RECIPIENTS) { showToast(`الحد الأقصى ${MAX_RECIPIENTS} عميل في الإرسال الواحد. ضيّق الجمهور بفئة أو تاق.`, 'error'); return; }
    setConfirming(true);
  };

  const send = async () => {
    if (!selected || !connection) return;
    setConfirming(false);
    setSending(true);
    try {
      const basePayload: Record<string, unknown> = isAuth
        ? { otpCode: otpCode.trim(), bodyParameters: [otpCode.trim()] }
        : {
            bodyParameters: bodyValues,
            headerParameters: headerValues,
            buttonParameters: buttonValues.length ? buttonValues.map((b) => ({ index: b.index, text: b.text })) : undefined,
          };

      if (mode === 'single') {
        await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send`, { storeId: singleStoreId || undefined, to, ...basePayload });
        setTo('');
        if (isAuth) setOtpCode('');
        showToast('تم إرسال القالب.', 'success');
      } else {
        const { data } = await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send-bulk`, {
          storeId: connection.scope === 'store' ? connection.storeId : undefined,
          storeIds: connection.scope === 'organization' ? selectedStoreIds : undefined,
          customerIds: recipients.map((c) => c.id),
          ...basePayload,
        });
        showToast(`الإرسال: ${data.sent} ناجح، ${data.failed} فشل، وحُذف ${data.duplicatesRemoved || 0} تكرار${data.optedOutSkipped ? `، واستُبعد ${data.optedOutSkipped} رافض للتسويق` : ''}.`, data.failed ? 'info' : 'success');
        setManualIds([]);
        setExcludedIds([]);
        if (isAuth) setOtpCode('');
      }
    } catch (error) {
      showToast(errorMessage(error, 'فشل إرسال القالب.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredTemplates = useMemo(
    () => templates.filter((item) => `${item.name} ${item.language} ${item.category}`.toLowerCase().includes(search.toLowerCase())),
    [templates, search],
  );

  if (loading && !branches.length && !connections.length) {
    return <div className="h-[60vh] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-labbaik-blue" /></div>;
  }

  if (!connections.length) {
    return (
      <div className="max-w-xl mx-auto rounded-xl border border-dashed border-labbaik-border py-14 px-6 text-center" dir="rtl">
        <Settings size={36} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
        <h2 className="mt-3 text-lg font-black text-neutral-900 dark:text-white">لا يوجد رقم واتساب مربوط</h2>
        <p className="mt-1 text-sm text-labbaik-text-muted">اربط رقم المنظمة أو رقم فرع من الإعدادات لتتمكن من إرسال القوالب.</p>
        <Link to="/dashboard/settings" className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174]">
          <Settings size={16} /> الذهاب إلى الإعدادات
        </Link>
      </div>
    );
  }

  const canSend = Boolean(selected) && isApproved(selected) && !sending && (mode === 'list' ? recipients.length > 0 : Boolean(to.trim()));

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">قوالب وقوائم الإرسال</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">اختر القالب، ثم حدّد الجمهور حسب الفرع أو الفئة أو التاق، وراجع قبل الإرسال.</p>
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-labbaik-border bg-labbaik-surface text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-50 cursor-pointer"
        >
          {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} مزامنة القوالب من Meta
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* 1. Sender */}
          <Section step={1} title="رقم الإرسال" hint={isOrgNumber ? 'رقم المنظمة يرسل لعملاء كل الفروع المحددة، ويحذف الأرقام المكررة تلقائيًا.' : undefined}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {connections.map((item) => {
                const active = connectionId === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setConnectionId(item.id)}
                    aria-pressed={active}
                    className={`rounded-lg border px-3 py-2.5 text-right transition-colors cursor-pointer ${active ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                      {item.scope === 'organization' ? <Network size={15} className="text-labbaik-blue dark:text-purple-300" /> : <Building2 size={15} className="text-labbaik-blue dark:text-purple-300" />}
                      {item.scope === 'organization' ? 'رقم المنظمة' : branches.find((b) => b.id === item.storeId)?.name || 'رقم فرع'}
                      {active && <Check size={14} className="ms-auto text-labbaik-blue dark:text-purple-300" />}
                    </span>
                    <span dir="ltr" className="mt-1 block text-xs text-labbaik-text-muted text-right tabular-nums">{item.displayPhoneNumber || item.phoneNumberId}</span>
                  </button>
                );
              })}
            </div>
            {isOrgNumber && branches.length > 1 && (
              <div className="mt-3 pt-3 border-t border-labbaik-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-labbaik-text-muted">الفروع المستهدفة</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-labbaik-text-muted">{selectedStoreIds.length}/{branches.length}</span>
                    {selectedStoreIds.length < branches.length && (
                      <button type="button" onClick={() => { setSelectedStoreIds(branches.map((b) => b.id)); setManualIds([]); setExcludedIds([]); }} className="font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">كل الفروع</button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {branches.map((b) => {
                    const on = selectedStoreIds.includes(b.id);
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => toggleBranch(b.id)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold transition-colors cursor-pointer ${on ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-labbaik-text-muted hover:text-labbaik-blue'}`}
                      >
                        {on && <Check size={12} />}{b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* 2. Template */}
          <Section step={2} title="القالب" aside={<span className="text-xs text-labbaik-text-muted tabular-nums">{templates.length} قالب</span>}>
            <div className="relative mb-2">
              <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم القالب أو اللغة أو الفئة..."
                aria-label="بحث في القوالب"
                className="w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page pr-10 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted"
              />
            </div>
            {loading ? (
              <div className="py-8 grid place-items-center"><Loader2 size={22} className="animate-spin text-labbaik-blue" /></div>
            ) : filteredTemplates.length === 0 ? (
              <p className="py-8 text-center text-sm text-labbaik-text-muted">{templates.length ? 'لا توجد قوالب تطابق البحث.' : 'لا توجد قوالب بعد. اضغط «مزامنة القوالب من Meta».'}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                {filteredTemplates.map((t) => <TemplateButton key={t.id} template={t} selected={selected?.id === t.id} onClick={() => choose(t)} />)}
              </div>
            )}
          </Section>

          {/* 3. Audience */}
          {mode === 'list' && (
            <Section
              step={3}
              title="الجمهور"
              aside={audienceLoading ? <Loader2 size={15} className="animate-spin text-labbaik-blue" /> : <span className="text-xs text-labbaik-text-muted tabular-nums">{customers.length} عميل لديه واتساب</span>}
            >
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-1" role="radiogroup" aria-label="طريقة تحديد الجمهور">
                {([
                  ['all', 'كل العملاء', <Users size={15} key="i" />],
                  ['segment', 'حسب الفئة أو التاق', <FolderOpen size={15} key="i" />],
                  ['manual', 'اختيار يدوي', <UserRoundCheck size={15} key="i" />],
                ] as const).map(([key, label, icon]) => (
                  <button
                    type="button"
                    key={key}
                    role="radio"
                    aria-checked={audienceMode === key}
                    onClick={() => { setAudienceMode(key); setExcludedIds([]); }}
                    className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs sm:text-sm font-bold transition-colors cursor-pointer ${audienceMode === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
                  >
                    {icon}<span className="truncate">{label}</span>
                  </button>
                ))}
              </div>

              {audienceMode === 'segment' && (
                <div className="mt-3 space-y-3">
                  <TaxonomyPicker label="الفئات" icon={<FolderOpen size={14} />} kind="category" items={taxonomy.categories} selected={categoryFilter} onChange={(ids) => { setCategoryFilter(ids); setExcludedIds([]); }} />
                  <TaxonomyPicker label="التاقات" icon={<Tag size={14} />} kind="tag" items={taxonomy.tags} selected={tagFilter} onChange={(ids) => { setTagFilter(ids); setExcludedIds([]); }} />
                  <p className="text-xs text-labbaik-text-muted">
                    {categoryFilter.length && tagFilter.length
                      ? 'يُرسل لمن لديه إحدى الفئات المختارة وإحدى التاقات المختارة معًا.'
                      : categoryFilter.length || tagFilter.length
                        ? 'يُرسل لكل عميل لديه أي عنصر من المختار.'
                        : 'اختر فئة أو تاقًا واحدًا على الأقل.'}
                    {' '}<Link to="/dashboard/customers" className="font-bold text-labbaik-blue dark:text-purple-300 hover:underline">إدارة الفئات والتاقات</Link>
                  </p>
                </div>
              )}

              {(audienceMode === 'manual' || baseAudience.length > 0) && (
                <div className="mt-3 pt-3 border-t border-labbaik-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-labbaik-text-muted">
                      {audienceMode === 'manual' ? 'حدّد العملاء' : 'راجع القائمة، وألغِ تحديد من لا تريد الإرسال له'}
                    </span>
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <button type="button" onClick={includeShown} className="text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">تحديد الظاهر</button>
                      <button type="button" onClick={excludeShown} className="text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء الظاهر</button>
                    </div>
                  </div>
                  <div className="relative mb-2">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
                    <input
                      type="search"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="بحث بالاسم أو الرقم أو الفرع..."
                      aria-label="بحث في العملاء"
                      className="w-full h-9 rounded-lg border border-labbaik-border bg-labbaik-page pr-9 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 placeholder:text-labbaik-text-muted"
                    />
                  </div>
                  <ul className="max-h-[42vh] overflow-y-auto custom-scrollbar divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
                    {listForPicker.slice(0, 300).map((c) => (
                      <CustomerRow key={c.id} customer={c} checked={isIncluded(c.id)} onToggle={() => toggleCustomer(c.id)} showBranch={targetStoreIds.length > 1} />
                    ))}
                    {!listForPicker.length && <li className="py-6 text-center text-sm text-labbaik-text-muted">لا يوجد عملاء.</li>}
                  </ul>
                  {listForPicker.length > 300 && <p className="mt-1.5 text-xs text-labbaik-text-muted">يظهر أول 300 فقط؛ استخدم البحث للوصول للبقية. الإرسال يشمل الجميع.</p>}
                </div>
              )}
            </Section>
          )}
        </div>

        {/* 4. Message + send */}
        <aside className="xl:sticky xl:top-0 rounded-xl border border-labbaik-border bg-labbaik-surface">
          <div className="p-3 border-b border-labbaik-border">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-1" role="radiogroup" aria-label="نوع الإرسال">
              {([['list', 'إرسال جماعي', <Users size={15} key="i" />], ['single', 'رقم واحد', <UserRoundCheck size={15} key="i" />]] as const).map(([key, label, icon]) => (
                <button
                  type="button"
                  key={key}
                  role="radio"
                  aria-checked={mode === key}
                  onClick={() => setMode(key)}
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-bold transition-colors cursor-pointer ${mode === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>

          {!selected ? (
            <div className="py-14 px-6 text-center">
              <MessageSquareText size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
              <p className="mt-3 text-sm font-bold text-labbaik-text-muted">اختر قالبًا لعرض المعاينة والمتغيرات</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div>
                <h2 className="font-black text-neutral-900 dark:text-white break-all" dir="ltr" style={{ textAlign: 'right' }}>{selected.name}</h2>
                <p className="mt-0.5 text-xs text-labbaik-text-muted">{selected.language} · {selected.category}</p>
                {!isApproved(selected) && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> هذا القالب غير معتمد من Meta ({selected.status})، ولا يمكن إرساله.
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3">
                <div className="ms-auto max-w-[90%] rounded-lg rounded-tr-sm bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 text-sm leading-relaxed text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap">
                  {renderPreview(selected, bodyValues, headerValues, otpCode, buttonValues)}
                </div>
              </div>

              {mode === 'single' ? (
                <div className="space-y-3">
                  <Field label="رقم المستلم" htmlFor="single-to">
                    <input id="single-to" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} text-left tabular-nums`} placeholder="9665XXXXXXXX" />
                  </Field>
                  {isOrgNumber && (
                    <Field label="الفرع الذي تُسجَّل عليه المحادثة" htmlFor="single-store">
                      <select id="single-store" value={singleStoreId} onChange={(e) => setSingleStoreId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-labbaik-border p-3 space-y-2">
                  <p className="text-xs text-labbaik-text-muted leading-relaxed">{audienceSummary()}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <Stat label="سجلات" value={chosen.length} />
                    <Stat label="رفضوا التسويق" value={optedOutCount} />
                    <Stat label="مكرر" value={recipientStats.duplicates} />
                    <Stat label="سيستلمون" value={recipientStats.unique} highlight />
                  </div>
                </div>
              )}

              {isAuth ? (
                <Field label="رمز التحقق (OTP)" htmlFor="otp">
                  <input id="otp" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="مثال: 123456" className={inputClass} dir="ltr" />
                </Field>
              ) : (
                (headerValues.length > 0 || bodyValues.length > 0 || buttonValues.length > 0) && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-labbaik-text-muted">متغيرات القالب</p>
                    {headerValues.map((v, i) => (
                      <Field key={`h${i}`} label={`العنوان {{${i + 1}}}`} htmlFor={`h${i}`}>
                        <input id={`h${i}`} value={v} onChange={(e) => setHeaderValues((c) => c.map((z, j) => (j === i ? e.target.value : z)))} className={inputClass} />
                      </Field>
                    ))}
                    {bodyValues.map((v, i) => (
                      <Field key={`b${i}`} label={`النص {{${i + 1}}}`} htmlFor={`b${i}`}>
                        <input id={`b${i}`} value={v} onChange={(e) => setBodyValues((c) => c.map((z, j) => (j === i ? e.target.value : z)))} className={inputClass} />
                      </Field>
                    ))}
                    {buttonValues.map((btn, i) => (
                      <Field key={`btn-${btn.index}`} label={`متغير زر «${btn.label}»`} htmlFor={`btn${i}`}>
                        <input id={`btn${i}`} value={btn.text} onChange={(e) => setButtonValues((curr) => curr.map((b, j) => (j === i ? { ...b, text: e.target.value } : b)))} placeholder="مثال: invite-code" className={inputClass} dir="ltr" />
                        {btn.url && <p dir="ltr" className="mt-1 text-[11px] text-labbaik-text-muted break-all text-left">{btn.url.replace(/\{\{1\}\}/g, btn.text || '{{1}}')}</p>}
                      </Field>
                    ))}
                    {mode === 'list' && (
                      <p className="text-[11px] leading-relaxed text-labbaik-text-muted">
                        لتخصيص الرسالة لكل عميل استخدم: <code dir="ltr">{'{{customer.fullName}}'}</code> <code dir="ltr">{'{{customer.phoneNumber}}'}</code> <code dir="ltr">{'{{customer.email}}'}</code> <code dir="ltr">{'{{customer.branchName}}'}</code>
                      </p>
                    )}
                  </div>
                )
              )}

              <button
                type="button"
                onClick={requestSend}
                disabled={!canSend}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} className="-scale-x-100" />}
                {mode === 'list' ? `مراجعة وإرسال إلى ${recipientStats.unique} رقم` : 'إرسال القالب'}
              </button>
            </div>
          )}
        </aside>
      </div>

      {confirming && selected && (
        <ConfirmSend
          templateName={selected.name}
          summary={audienceSummary()}
          unique={recipientStats.unique}
          duplicates={recipientStats.duplicates}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void send()}
        />
      )}
    </div>
  );
}

const inputClass = 'w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted';

function Section({ step, title, hint, aside, children }: { step: number; title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="flex items-center gap-2 font-black text-neutral-900 dark:text-white">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-labbaik-blue/10 text-xs font-black text-labbaik-blue dark:text-purple-300 tabular-nums">{step}</span>
            {title}
          </h2>
          {hint && <p className="mt-1 text-xs text-labbaik-text-muted">{hint}</p>}
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

function TemplateButton({ template, selected, onClick }: { template: Template; selected: boolean; onClick: () => void }) {
  const approved = isApproved(template);
  const body = template.components?.find((c) => String(c.type).toUpperCase() === 'BODY')?.text || '';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-right rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${selected ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-neutral-900 dark:text-white truncate" dir="ltr">{template.name}</span>
        <span className={`shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-bold ${approved ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}>
          {approved ? <CheckCircle2 size={11} /> : <Clock size={11} />}{approved ? 'معتمد' : template.status}
        </span>
      </div>
      {body && <p className="mt-1 text-xs text-labbaik-text-muted line-clamp-2">{body}</p>}
      <p className="mt-1 text-[11px] text-labbaik-text-muted">{template.language} · {template.category}</p>
    </button>
  );
}

function TaxonomyPicker({ label, icon, kind, items, selected, onChange }: { label: string; icon: ReactNode; kind: 'category' | 'tag'; items: Taxonomy[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-bold text-labbaik-text-muted flex items-center gap-1 min-w-16">{icon}{label}</span>
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => toggle(item.id)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 border text-xs font-bold transition-colors cursor-pointer ${kind === 'category' ? 'rounded-md' : 'rounded-full'} ${on ? 'text-neutral-900 dark:text-white' : 'border-labbaik-border text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
            style={on ? { borderColor: item.color, backgroundColor: `${item.color}1f` } : undefined}
          >
            {on ? <Check size={12} style={{ color: item.color }} /> : <span className={`h-2 w-2 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: item.color }} />}
            {kind === 'tag' && '#'}{item.name}
          </button>
        );
      })}
      {!items.length && <span className="text-xs text-labbaik-text-muted">لا توجد {kind === 'category' ? 'فئات' : 'تاقات'} في الفروع المحددة.</span>}
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
        <span className="hidden sm:flex items-center gap-1 shrink-0">
          {(customer.categories || []).slice(0, 2).map((c) => <span key={c.id} title={c.name} className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />)}
          {(customer.tags || []).slice(0, 2).map((t) => <span key={t.id} title={`#${t.name}`} className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />)}
        </span>
        {showBranch && customer.store?.name && <span className="shrink-0 text-[11px] text-labbaik-text-muted">{customer.store.name}</span>}
      </label>
    </li>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-labbaik-page px-2 py-2">
      <div className={`text-lg font-black tabular-nums ${highlight ? 'text-labbaik-blue dark:text-purple-300' : 'text-neutral-900 dark:text-white'}`}>{value.toLocaleString('en')}</div>
      <div className="text-[11px] text-labbaik-text-muted">{label}</div>
    </div>
  );
}

function ConfirmSend({ templateName, summary, unique, duplicates, onCancel, onConfirm }: { templateName: string; summary: string; unique: number; duplicates: number; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-send-title" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-labbaik-border bg-labbaik-surface p-6 shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] animate-slide-up">
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-send-title" className="text-lg font-black text-neutral-900 dark:text-white">تأكيد الإرسال الجماعي</h2>
          <button type="button" onClick={onCancel} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
          سيُرسل القالب <b dir="ltr">{templateName}</b> إلى <b className="tabular-nums">{unique.toLocaleString('en')}</b> رقم واتساب{duplicates > 0 && <> (وحُذف <span className="tabular-nums">{duplicates}</span> رقم مكرر)</>}.
        </p>
        <p className="mt-2 text-xs text-labbaik-text-muted">{summary}</p>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> لا يمكن التراجع بعد الإرسال، وتُحتسب الرسائل على حساب Meta.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
          <button type="button" onClick={onConfirm} autoFocus className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] cursor-pointer">
            <Send size={16} className="-scale-x-100" /> إرسال الآن
          </button>
        </div>
      </div>
    </div>
  );
}

function dedupeStats(rows: Customer[]) {
  const normalized = rows.map((r) => String(r.phoneNumber || r.whatsappId || '').replace(/[^0-9]/g, '')).filter(Boolean);
  const unique = new Set(normalized).size;
  return { unique, duplicates: Math.max(0, normalized.length - unique) };
}
function placeholderCount(text?: string) { if (!text) return 0; const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])); return matches.length ? Math.max(...matches) : 0; }
function bodyPlaceholderCount(t: Template) { return placeholderCount(t.components?.find((c) => String(c.type).toUpperCase() === 'BODY')?.text); }
function headerPlaceholderCount(t: Template) { const h = t.components?.find((c) => String(c.type).toUpperCase() === 'HEADER'); return String(h?.format || 'TEXT').toUpperCase() === 'TEXT' ? placeholderCount(h?.text) : 0; }
function isAuthTemplate(t?: Template | null) {
  if (!t) return false;
  if (String(t.category).toUpperCase() === 'AUTHENTICATION') return true;
  return t.components?.some((c) => c.buttons?.some((b: any) => b.otp_type === 'COPY_CODE' || b.type === 'OTP'));
}
function getDynamicButtons(t?: Template | null) {
  if (!t || isAuthTemplate(t)) return [];
  const list: Array<{ index: number; text: string; label: string; url?: string }> = [];
  const btnComp = t.components?.find((c) => String(c.type).toUpperCase() === 'BUTTONS');
  if (btnComp && Array.isArray(btnComp.buttons)) {
    btnComp.buttons.forEach((btn, idx) => {
      if (String(btn.type).toUpperCase() === 'URL' && /\{\{\d+\}\}/.test(btn.url || '')) {
        list.push({ index: idx, text: '', label: btn.text || `زر رابط ${idx + 1}`, url: btn.url });
      }
    });
  }
  return list;
}
function renderPreview(t: Template, body: string[], header: string[], otp = '', buttons: Array<{ index: number; text: string; url?: string }> = []) {
  if (isAuthTemplate(t)) {
    const b = t.components?.find((c) => String(c.type).toUpperCase() === 'BODY');
    const f = t.components?.find((c) => String(c.type).toUpperCase() === 'FOOTER');
    const bodyText = (b?.text || t.name).replace(/\{\{1\}\}/g, otp || '{{1}}');
    const parts = [bodyText];
    if (f?.text) parts.push(f.text);
    parts.push(`🔘 نسخ رمز التحقق (${otp || '123456'})`);
    return parts.join('\n\n');
  }

  const h = t.components?.find((c) => String(c.type).toUpperCase() === 'HEADER');
  const b = t.components?.find((c) => String(c.type).toUpperCase() === 'BODY');
  const f = t.components?.find((c) => String(c.type).toUpperCase() === 'FOOTER');
  const btnsComp = t.components?.find((c) => String(c.type).toUpperCase() === 'BUTTONS');

  const fill = (text: string, values: string[]) => values.reduce((a, v, i) => a.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`), text);
  const parts = [h?.text ? fill(h.text, header) : '', b?.text ? fill(b.text, body) : t.name, f?.text || ''].filter(Boolean);

  if (btnsComp?.buttons?.length) {
    const btnLines = btnsComp.buttons.map((btn: any, idx: number) => {
      let url = btn.url || '';
      const customVal = buttons.find((item) => item.index === idx)?.text;
      if (customVal && url.includes('{{1}}')) url = url.replace(/\{\{1\}\}/g, customVal);
      return `🔘 ${btn.text || 'زر'}${url ? ` (${url})` : ''}`;
    });
    parts.push(btnLines.join('\n'));
  }

  return parts.join('\n\n');
}
