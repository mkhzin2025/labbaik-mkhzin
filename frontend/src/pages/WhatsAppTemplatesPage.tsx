import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  Send,
  Settings,
  UserRoundCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import Pagination from '../components/ui/Pagination';
import type { Branch } from '../components/customers/BranchSelector';
import AudienceBuilder from '../components/whatsapp/AudienceBuilder';
import {
  audiencePayload,
  audienceReady,
  describeAudience,
  emptyAudience,
  type AudienceOptions,
  type AudienceState,
  type AudienceSummary,
} from '../components/whatsapp/audience';
import MessageComposer from '../components/whatsapp/MessageComposer';
import TemplatePreview from '../components/whatsapp/TemplatePreview';
import CampaignsList from '../components/whatsapp/CampaignsList';
import {
  CATEGORY_LABELS,
  analyzeTemplate,
  emptyValues,
  isApproved,
  missingValues,
  sendPayload,
  usesCustomerTokens,
  type Template,
  type TemplateValues,
} from '../components/whatsapp/templateUtils';

type MetaConnection = { id: string; scope: 'organization' | 'store'; storeId?: string | null; defaultStoreId?: string | null; displayPhoneNumber?: string; phoneNumberId: string; status?: string };

const TEMPLATE_PAGE_SIZE = 8;
/** Matches TEST_PHONES_LIMIT on the server. */
const TEST_PHONES_LIMIT = 5000;

/**
 * The raw entries of the test-numbers box: one per line or comma. A chunk with spaces stays one number
 * ("+966 50 123 4567") unless its digits are too many for one, then each space starts a new number.
 */
const testNumbers = (text: string) => text.split(/[\n,،;\t]+/).flatMap((chunk) => {
  const value = chunk.trim();
  return value.replace(/[^0-9٠-٩]/g, '').length > 15 ? value.split(/\s+/) : [value];
}).filter(Boolean);

/** Same rules as the server's parseTestPhones (05…, +966…, Arabic digits), so the count shown is what gets sent. */
const normalizeTestPhone = (value: string) => {
  let digits = value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('9660')) digits = `966${digits.slice(4)}`;
  if (digits.length === 10 && digits.startsWith('05')) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('5')) return `966${digits}`;
  return digits;
};

function testPhonesSummary(text: string): AudienceSummary & { invalid: number } {
  const entries = testNumbers(text);
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const entry of entries) {
    const phone = normalizeTestPhone(entry);
    if (phone.length < 10 || phone.length > 15) invalid += 1;
    else if (seen.has(phone)) duplicates += 1;
    else seen.add(phone);
  }
  return { records: entries.length, optedOut: 0, duplicates, invalid, recipients: seen.size, byBranch: [], overLimit: entries.length > TEST_PHONES_LIMIT, limit: TEST_PHONES_LIMIT };
}

const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { details?: string; message?: string | string[] } } })?.response?.data;
  return data?.details || (Array.isArray(data?.message) ? data?.message.join('، ') : data?.message) || fallback;
};

export default function WhatsAppTemplatesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'campaigns' ? 'campaigns' : 'send';
  const templateFilter = searchParams.get('templateId') || undefined;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [singleStoreId, setSingleStoreId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [values, setValues] = useState<TemplateValues | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [templateStatus, setTemplateStatus] = useState<'approved' | 'all'>('approved');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templatePage, setTemplatePage] = useState(1);
  const [audience, setAudience] = useState<AudienceState>(emptyAudience);
  const [options, setOptions] = useState<AudienceOptions>({ categories: [], tags: [] });
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  // Test send: pasted numbers replace the audience; the server does not save them as customers.
  const [testMode, setTestMode] = useState(false);
  const [testText, setTestText] = useState('');
  // ?to=<number> (from a conversation whose 24h window has closed) opens a single send to that customer.
  const [mode, setMode] = useState<'single' | 'list'>(() => (searchParams.get('to') ? 'single' : 'list'));
  const [to, setTo] = useState(() => searchParams.get('to') || '');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const summaryRequest = useRef(0);
  const optionsRequest = useRef(0);

  const connection = useMemo(() => connections.find((item) => item.id === connectionId), [connections, connectionId]);
  const isOrgNumber = connection?.scope === 'organization';
  const targetStoreIds = useMemo(
    () => (connection ? (isOrgNumber ? selectedStoreIds : connection.storeId ? [connection.storeId] : []) : []),
    [connection, isOrgNumber, selectedStoreIds],
  );
  const analysis = useMemo(() => (selected ? analyzeTemplate(selected) : null), [selected]);

  const setTab = (next: 'send' | 'campaigns') => setSearchParams(next === 'campaigns' ? { tab: 'campaigns' } : {}, { replace: true });

  const replaceMediaUrl = useCallback((url: string | null) => {
    setMediaUrl((current) => { if (current?.startsWith('blob:')) URL.revokeObjectURL(current); return url; });
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [storeRes, connectionRes] = await Promise.all([api.get('/stores'), api.get('/integrations/meta/whatsapp/connections')]);
        const connectionRows: MetaConnection[] = connectionRes.data || [];
        setBranches(storeRes.data || []);
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

  // Switching the sending number resets the template, its uploaded media (tied to the number), the audience and target branches.
  useEffect(() => {
    if (!connection) return;
    setSelected(null);
    setValues(null);
    replaceMediaUrl(null);
    setAudience(emptyAudience());
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

  // Categories/tags of the target branches, with counts narrowed by the chosen categories.
  const categoryKey = audience.categoryIds.join(',');
  useEffect(() => {
    if (!targetStoreIds.length) { setOptions({ categories: [], tags: [] }); return; }
    const id = ++optionsRequest.current;
    setOptionsLoading(true);
    const timer = setTimeout(() => {
      api.get('/customers/audience/options', { params: { storeIds: targetStoreIds.join(','), categoryIds: categoryKey || undefined } })
        .then(({ data }) => { if (id === optionsRequest.current) setOptions(data); })
        .catch((error) => id === optionsRequest.current && showToast(errorMessage(error, 'تعذر تحميل الفئات والتاقات.'), 'error'))
        .finally(() => id === optionsRequest.current && setOptionsLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [targetStoreIds, categoryKey, showToast]);

  // Server-side count with the exact rules the send uses (opt-outs, duplicate numbers across branches).
  const payload = useMemo(() => audiencePayload(audience, targetStoreIds), [audience, targetStoreIds]);
  const ready = mode === 'list' && !testMode && targetStoreIds.length > 0 && audienceReady(audience);
  const testSummary = useMemo(() => (testMode ? testPhonesSummary(testText) : null), [testMode, testText]);
  // Everything downstream (counts, confirm dialog, send button) reads one summary, whichever source it came from.
  const activeSummary = testMode ? testSummary : summary;
  useEffect(() => {
    if (!ready) { setSummary(null); return; }
    const id = ++summaryRequest.current;
    setSummaryLoading(true);
    const timer = setTimeout(() => {
      api.post('/customers/audience/summary', payload)
        .then(({ data }) => { if (id === summaryRequest.current) setSummary(data); })
        .catch((error) => { if (id === summaryRequest.current) { setSummary(null); showToast(errorMessage(error, 'تعذر حساب الجمهور.'), 'error'); } })
        .finally(() => id === summaryRequest.current && setSummaryLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, payload, showToast]);

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

  const choose = (template: Template) => {
    setSelected(template);
    setValues(emptyValues(analyzeTemplate(template)));
    replaceMediaUrl(null);
    setCampaignName('');
  };

  const toggleBranch = (id: string) => {
    if (!isOrgNumber) return;
    setSelectedStoreIds((current) => (current.includes(id) ? (current.length > 1 ? current.filter((x) => x !== id) : current) : [...current, id]));
    setAudience((current) => ({ ...current, manualIds: [], excludedIds: [] }));
  };

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => (templateStatus === 'all' || isApproved(t))
      && (!templateCategory || String(t.category).toUpperCase() === templateCategory)
      && (!q || `${t.name} ${t.language} ${t.category} ${analyzeTemplate(t).bodyText}`.toLowerCase().includes(q)));
  }, [templates, search, templateStatus, templateCategory]);
  const templatePageCount = Math.ceil(filteredTemplates.length / TEMPLATE_PAGE_SIZE);
  useEffect(() => { setTemplatePage(1); }, [search, templateStatus, templateCategory, connectionId]);
  const categories = useMemo(() => [...new Set(templates.map((t) => String(t.category || '').toUpperCase()).filter(Boolean))], [templates]);

  const missing = analysis && values ? missingValues(analysis, values) : [];
  const scheduledIso = timing === 'later' && scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
  const scheduleError = timing === 'later' ? scheduleProblem(scheduledIso) : '';
  const audienceText = testMode
    ? `أرقام تجربة (${(testSummary?.recipients || 0).toLocaleString('en')}) · لا تُحفظ كعملاء ولا تظهر في المحادثات.`
    : describeAudience(audience, targetStoreIds, branches, options);

  const requestSend = () => {
    if (!selected || !connection || !analysis || !values) return;
    if (missing.length) { showToast(`أكمل قبل الإرسال: ${missing.join('، ')}.`, 'error'); return; }
    if (mode === 'single') {
      if (!to.trim()) { showToast('أدخل رقم المستلم.', 'error'); return; }
      if (usesCustomerTokens(values)) { showToast('حقول العميل تعمل في الإرسال الجماعي فقط؛ اكتب القيمة مباشرة.', 'error'); return; }
      void send();
      return;
    }
    if (!activeSummary?.recipients) { showToast(testMode ? 'أدخل رقمًا صالحًا واحدًا على الأقل.' : 'لا يوجد مستلمون في الجمهور الحالي.', 'error'); return; }
    if (activeSummary.overLimit) { showToast(`الحد الأقصى ${activeSummary.limit.toLocaleString('en')} رقم في الحملة الواحدة.`, 'error'); return; }
    if (scheduleError) { showToast(scheduleError, 'error'); return; }
    setConfirming(true);
  };

  const send = async () => {
    if (!selected || !connection || !analysis || !values) return;
    setConfirming(false);
    setSending(true);
    try {
      const base = sendPayload(analysis, values);
      if (mode === 'single') {
        await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send`, { storeId: singleStoreId || undefined, to, ...base });
        setTo('');
        if (analysis.isAuth) setValues({ ...values, otp: '' });
        showToast('تم إرسال القالب.', 'success');
      } else {
        const { data } = await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send-bulk`, {
          ...(testMode ? { testPhones: testNumbers(testText), storeId: targetStoreIds[0] } : { audience: payload }),
          name: campaignName.trim() || undefined,
          nameFallback: values.nameFallback.trim() || undefined,
          scheduledAt: scheduledIso,
          messagesPerSecond: speed,
          ...base,
        });
        showToast(data.status === 'scheduled'
          ? `جُدولت الحملة إلى ${data.totalRecipients.toLocaleString('en')} رقم في ${formatSchedule(data.scheduledAt)}.`
          : `بدأ إرسال الحملة إلى ${data.totalRecipients.toLocaleString('en')} رقم.`, 'success');
        navigate(`/dashboard/whatsapp-campaigns/${data.id}`);
      }
    } catch (error) {
      showToast(errorMessage(error, 'فشل إرسال القالب.'), 'error');
    } finally {
      setSending(false);
    }
  };

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

  const canSend = Boolean(selected) && isApproved(selected) && !sending && !missing.length
    && (mode === 'list' ? Boolean(activeSummary?.recipients) && !activeSummary?.overLimit && (testMode || !summaryLoading) : Boolean(to.trim()));

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">قوالب وحملات واتساب</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">اختر القالب، حدّد الجمهور بدقة (فرع › فئة › تاق)، وتابع نتيجة كل حملة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-labbaik-border bg-labbaik-surface p-0.5" role="tablist" aria-label="الأقسام">
            {([['send', 'حملة جديدة', <Send key="i" size={14} className="-scale-x-100" />], ['campaigns', 'سجل الحملات', <History key="i" size={14} />]] as const).map(([key, label, icon]) => (
              <button type="button" key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-bold transition-colors cursor-pointer ${tab === key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}>
                {icon}{label}
              </button>
            ))}
          </div>
          {tab === 'send' && (
            <button type="button" onClick={() => void sync()} disabled={syncing}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-labbaik-border bg-labbaik-surface text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-50 cursor-pointer">
              {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} مزامنة القوالب
            </button>
          )}
        </div>
      </div>

      {tab === 'campaigns' ? (
        <CampaignsList templateId={templateFilter} onClearTemplate={() => setSearchParams({ tab: 'campaigns' }, { replace: true })} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {/* 1. Sender */}
            <Section step={1} title="رقم الإرسال والفروع" hint={isOrgNumber ? 'رقم المنظمة يرسل لعملاء الفروع المحددة، ويحذف الأرقام المكررة بين الفروع تلقائيًا.' : undefined}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {connections.map((item) => {
                  const active = connectionId === item.id;
                  return (
                    <button type="button" key={item.id} onClick={() => setConnectionId(item.id)} aria-pressed={active}
                      className={`rounded-lg border px-3 py-2.5 text-right transition-colors cursor-pointer ${active ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}>
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
                        <button type="button" onClick={() => { setSelectedStoreIds(branches.map((b) => b.id)); setAudience((c) => ({ ...c, manualIds: [], excludedIds: [] })); }} className="font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">كل الفروع</button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {branches.map((b) => {
                      const on = selectedStoreIds.includes(b.id);
                      return (
                        <button type="button" key={b.id} onClick={() => toggleBranch(b.id)} aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold transition-colors cursor-pointer ${on ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-labbaik-text-muted hover:text-labbaik-blue'}`}>
                          {on && <Check size={12} />}{b.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>

            {/* 2. Template */}
            <Section step={2} title="القالب" aside={<span className="text-xs text-labbaik-text-muted tabular-nums">{filteredTemplates.length} من {templates.length}</span>}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="relative flex-1 min-w-52">
                  <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو نص الرسالة..." aria-label="بحث في القوالب"
                    className="w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page pr-10 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted" />
                </div>
                <select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)} aria-label="فئة القالب" className="h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer">
                  <option value="">كل الأنواع</option>
                  {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-labbaik-border text-xs font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer">
                  <input type="checkbox" checked={templateStatus === 'approved'} onChange={(e) => setTemplateStatus(e.target.checked ? 'approved' : 'all')} className="h-4 w-4 accent-[#643B89]" />
                  المعتمدة فقط
                </label>
              </div>
              {loading ? (
                <div className="py-8 grid place-items-center"><Loader2 size={22} className="animate-spin text-labbaik-blue" /></div>
              ) : filteredTemplates.length === 0 ? (
                <p className="py-8 text-center text-sm text-labbaik-text-muted">{templates.length ? 'لا توجد قوالب تطابق البحث.' : 'لا توجد قوالب بعد. اضغط «مزامنة القوالب».'}</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {filteredTemplates.slice((templatePage - 1) * TEMPLATE_PAGE_SIZE, templatePage * TEMPLATE_PAGE_SIZE).map((t) => (
                      <TemplateCard key={t.id} template={t} selected={selected?.id === t.id} onClick={() => choose(t)} />
                    ))}
                  </div>
                  <div className="mt-3 flex justify-center"><Pagination page={templatePage} pageCount={templatePageCount} onChange={setTemplatePage} label="صفحات القوالب" /></div>
                </>
              )}
            </Section>

            {/* 3. Audience */}
            {mode === 'list' && (
              <Section step={3} title="الجمهور" aside={!testMode && summaryLoading ? <Loader2 size={15} className="animate-spin text-labbaik-blue" /> : activeSummary ? <span className="text-xs font-bold text-labbaik-blue dark:text-purple-300 tabular-nums">{activeSummary.recipients.toLocaleString('en')} رقم</span> : undefined}>
                <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-1 sm:w-80" role="radiogroup" aria-label="مصدر الأرقام">
                  {([[false, 'من العملاء', <Users size={14} key="i" />], [true, 'أرقام تجربة', <FlaskConical size={14} key="i" />]] as const).map(([key, label, icon]) => (
                    <button type="button" key={label} role="radio" aria-checked={testMode === key} onClick={() => setTestMode(key)}
                      className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-bold transition-colors cursor-pointer ${testMode === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
                {testMode ? (
                  <div className="space-y-1.5">
                    <label htmlFor="test-phones" className="text-xs font-bold text-labbaik-text-muted">اكتب الأرقام أو الصقها (رقم في كل سطر، أو مفصولة بفاصلة أو مسافة)</label>
                    <textarea id="test-phones" dir="ltr" rows={6} value={testText} onChange={(e) => setTestText(e.target.value)} placeholder={'0501234567\n966551234567'}
                      className="w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 py-2 text-sm text-left tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted" />
                    <p className="text-[11px] text-labbaik-text-muted">
                      {testSummary && testSummary.records > 0 && <><span className="tabular-nums font-bold text-neutral-800 dark:text-neutral-100">{testSummary.recipients.toLocaleString('en')}</span> رقم صالح{testSummary.duplicates > 0 && <> · <span className="tabular-nums">{testSummary.duplicates}</span> مكرر</>}{testSummary.invalid > 0 && <> · <span className="tabular-nums">{testSummary.invalid}</span> غير صالح</>} · </>}
                      للتجربة فقط: لا تُحفظ الأرقام كعملاء ولا تظهر في المحادثات، لكن الرسائل حقيقية وتُحتسب على حساب Meta.
                    </p>
                  </div>
                ) : (
                  <AudienceBuilder storeIds={targetStoreIds} branches={branches} value={audience} onChange={setAudience} options={options} optionsLoading={optionsLoading} />
                )}
              </Section>
            )}
          </div>

          {/* 4. Message + send */}
          <aside className="xl:sticky xl:top-0 rounded-xl border border-labbaik-border bg-labbaik-surface">
            <div className="p-3 border-b border-labbaik-border">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-1" role="radiogroup" aria-label="نوع الإرسال">
                {([['list', 'حملة جماعية', <Users size={15} key="i" />], ['single', 'رقم واحد', <UserRoundCheck size={15} key="i" />]] as const).map(([key, label, icon]) => (
                  <button type="button" key={key} role="radio" aria-checked={mode === key} onClick={() => setMode(key)}
                    className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-bold transition-colors cursor-pointer ${mode === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}>
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>

            {!selected || !analysis || !values ? (
              <div className="py-14 px-6 text-center">
                <MessageSquareText size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
                <p className="mt-3 text-sm font-bold text-labbaik-text-muted">اختر قالبًا لعرض المعاينة وتعبئة متغيراته</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <h2 className="font-black text-neutral-900 dark:text-white break-all" dir="ltr" style={{ textAlign: 'right' }}>{selected.name}</h2>
                  <p className="mt-0.5 text-xs text-labbaik-text-muted">{selected.language} · {CATEGORY_LABELS[String(selected.category).toUpperCase()] || selected.category}</p>
                  {!isApproved(selected) && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> هذا القالب غير معتمد من Meta ({selected.status})، ولا يمكن إرساله.
                    </p>
                  )}
                </div>

                <TemplatePreview template={selected} analysis={analysis} values={values} mediaUrl={mediaUrl} />

                <MessageComposer
                  template={selected}
                  analysis={analysis}
                  values={values}
                  onChange={setValues}
                  connectionId={connectionId}
                  bulk={mode === 'list'}
                  onMediaPreview={replaceMediaUrl}
                />

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
                  <div className="space-y-3">
                    <Field label="اسم الحملة (اختياري)" htmlFor="campaign-name">
                      <input id="campaign-name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} maxLength={120} placeholder={`${selected.name} · ${new Date().toISOString().slice(0, 10)}`} className={inputClass} />
                    </Field>
                    <AudienceStats summary={activeSummary} loading={!testMode && summaryLoading} ready={testMode ? Boolean(testSummary?.records) : ready} description={audienceText} />
                    <TimingAndSpeed
                      timing={timing}
                      onTiming={setTiming}
                      scheduleAt={scheduleAt}
                      onScheduleAt={setScheduleAt}
                      speed={speed}
                      onSpeed={setSpeed}
                      recipients={activeSummary?.recipients || 0}
                      error={scheduleAt ? scheduleError : ''}
                    />
                  </div>
                )}

                {missing.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">متبقٍ: {missing.join('، ')}</p>}

                <button type="button" onClick={requestSend} disabled={!canSend}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} className="-scale-x-100" />}
                  {mode === 'list'
                    ? `${timing === 'later' ? 'مراجعة وجدولة' : 'مراجعة وإرسال'} إلى ${(activeSummary?.recipients || 0).toLocaleString('en')} رقم`
                    : 'إرسال القالب'}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {confirming && selected && activeSummary && (
        <ConfirmSend
          templateName={selected.name}
          campaignName={campaignName.trim() || `${selected.name} · ${new Date().toISOString().slice(0, 10)}`}
          summary={audienceText}
          stats={activeSummary}
          scheduledAt={scheduledIso}
          speed={speed}
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

function TemplateCard({ template, selected, onClick }: { template: Template; selected: boolean; onClick: () => void }) {
  const approved = isApproved(template);
  const analysis = analyzeTemplate(template);
  const needs = [
    analysis.mediaType === 'image' && { icon: <ImageIcon size={11} />, label: 'صورة' },
    analysis.mediaType === 'video' && { icon: <Video size={11} />, label: 'فيديو' },
    analysis.mediaType === 'document' && { icon: <FileText size={11} />, label: 'PDF' },
    analysis.bodyVars + analysis.headerVars > 0 && { icon: null, label: `${analysis.bodyVars + analysis.headerVars} متغير` },
    analysis.dynamicButtons.length > 0 && { icon: null, label: 'رابط زر' },
  ].filter(Boolean) as { icon: ReactNode; label: string }[];
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`w-full text-right rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${selected ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-neutral-900 dark:text-white truncate" dir="ltr">{template.name}</span>
        <span className={`shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-bold ${approved ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}>
          {approved ? <CheckCircle2 size={11} /> : <Clock size={11} />}{approved ? 'معتمد' : template.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-labbaik-text-muted line-clamp-2">{analysis.bodyText}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-labbaik-text-muted">
        <span>{template.language} · {CATEGORY_LABELS[String(template.category).toUpperCase()] || template.category}</span>
        {needs.map((n) => <span key={n.label} className="inline-flex items-center gap-0.5 rounded bg-labbaik-page px-1.5 py-0.5 font-bold">{n.icon}{n.label}</span>)}
      </div>
    </button>
  );
}

function AudienceStats({ summary, loading, ready, description }: { summary: AudienceSummary | null; loading: boolean; ready: boolean; description: string }) {
  if (!ready) return <p className="rounded-lg border border-dashed border-labbaik-border px-3 py-3 text-xs text-labbaik-text-muted">أكمل تحديد الجمهور لحساب عدد المستلمين.</p>;
  return (
    <div className={`rounded-lg border border-labbaik-border p-3 space-y-2 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <p className="text-xs text-labbaik-text-muted leading-relaxed">{description}</p>
      {summary?.overLimit ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> الجمهور {summary.records.toLocaleString('en')} عميل، والحد {summary.limit.toLocaleString('en')} للحملة. ضيّقه بفرع أو فئة أو تاق.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <Stat label="سجلات" value={summary?.records} />
            <Stat label="رافضون" value={summary?.optedOut} />
            <Stat label="مكرر" value={summary?.duplicates} />
            <Stat label="سيستلمون" value={summary?.recipients} highlight />
          </div>
          {summary && summary.byBranch.length > 1 && (
            <ul className="space-y-1 pt-1">
              {summary.byBranch.map((b) => (
                <li key={b.storeId} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-neutral-800 dark:text-neutral-100">{b.storeName}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-labbaik-page overflow-hidden"><span className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${(b.recipients / (summary.recipients || 1)) * 100}%` }} /></span>
                  <span className="w-12 text-left tabular-nums text-labbaik-text-muted">{b.recipients.toLocaleString('en')}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value?: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-labbaik-page px-1 py-2">
      <div className={`text-base font-black tabular-nums ${highlight ? 'text-labbaik-blue dark:text-purple-300' : 'text-neutral-900 dark:text-white'}`}>{value === undefined ? '—' : value.toLocaleString('en')}</div>
      <div className="text-[11px] text-labbaik-text-muted">{label}</div>
    </div>
  );
}

function TimingAndSpeed({ timing, onTiming, scheduleAt, onScheduleAt, speed, onSpeed, recipients, error }: {
  timing: 'now' | 'later'; onTiming: (value: 'now' | 'later') => void;
  scheduleAt: string; onScheduleAt: (value: string) => void;
  speed: number; onSpeed: (value: number) => void;
  recipients: number; error: string;
}) {
  return (
    <div className="rounded-lg border border-labbaik-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-labbaik-text-muted">التوقيت</span>
        <div className="flex rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="radiogroup" aria-label="توقيت الإرسال">
          {([['now', 'أرسل الآن'], ['later', 'جدولة لاحقًا']] as const).map(([key, label]) => (
            <button type="button" key={key} role="radio" aria-checked={timing === key}
              onClick={() => { onTiming(key); if (key === 'later' && !scheduleAt) onScheduleAt(scheduleBound(3600_000)); }}
              className={`h-8 px-3 rounded-md text-xs font-bold transition-colors cursor-pointer ${timing === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {timing === 'later' && (
        <div className="space-y-1">
          <input type="datetime-local" dir="ltr" value={scheduleAt} onChange={(e) => onScheduleAt(e.target.value)} aria-label="وقت الجدولة"
            min={scheduleBound(0)} max={scheduleBound(MAX_SCHEDULE_DAYS * 86_400_000)}
            className={`${inputClass} text-left tabular-nums`} />
          {error && <p className="text-xs font-bold text-red-700 dark:text-red-300">{error}</p>}
        </div>
      )}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-labbaik-text-muted">سرعة الإرسال</span>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="سرعة الإرسال">
          {SPEEDS.map((value) => (
            <button type="button" key={value} role="radio" aria-checked={speed === value} onClick={() => onSpeed(value)}
              className={`h-9 rounded-lg border text-xs font-bold tabular-nums transition-colors cursor-pointer ${speed === value ? 'border-labbaik-blue bg-labbaik-blue/8 text-labbaik-blue dark:text-purple-200' : 'border-labbaik-border text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40'}`}>
              {value}/ث
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-labbaik-text-muted">
          رسائل في الثانية. الأبطأ يوزّع ردود العملاء على فريقك، والأسرع ينهي الحملة أسرع.
          {recipients > 0 && <> المدة المتوقعة: <b className="tabular-nums">{formatDuration(recipients / speed)}</b>.</>}
        </p>
      </div>
    </div>
  );
}

const DEFAULT_SPEED = 20;
/** Must match CAMPAIGN_SPEEDS on the server. */
const SPEEDS = [5, 20, 40, 80];
const MAX_SCHEDULE_DAYS = 30;

/** Now plus `offsetMs`, as the value of a datetime-local input (local time, minute precision). */
function scheduleBound(offsetMs: number) {
  const date = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Why a schedule time can't be used (the server applies the same limits), or '' when it's fine. */
function scheduleProblem(iso?: string) {
  if (!iso) return 'اختر وقت الجدولة.';
  const at = new Date(iso).getTime();
  if (at < Date.now() + 60_000) return 'وقت الجدولة يجب أن يكون في المستقبل.';
  if (at > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) return `يمكن الجدولة حتى ${MAX_SCHEDULE_DAYS} يومًا كحد أقصى.`;
  return '';
}

function formatDuration(seconds: number) {
  if (seconds < 60) return 'أقل من دقيقة';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ساعة و${minutes % 60} دقيقة` : `${hours} ساعة`;
}

const formatSchedule = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function ConfirmSend({ templateName, campaignName, summary, stats, scheduledAt, speed, onCancel, onConfirm }: { templateName: string; campaignName: string; summary: string; stats: AudienceSummary; scheduledAt?: string; speed: number; onCancel: () => void; onConfirm: () => void }) {
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
          <h2 id="confirm-send-title" className="text-lg font-black text-neutral-900 dark:text-white">تأكيد إرسال الحملة</h2>
          <button type="button" onClick={onCancel} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
          سيُرسل القالب <b dir="ltr">{templateName}</b> إلى <b className="tabular-nums">{stats.recipients.toLocaleString('en')}</b> رقم واتساب
          {stats.duplicates > 0 && <> (حُذف <span className="tabular-nums">{stats.duplicates.toLocaleString('en')}</span> مكرر)</>}
          {stats.optedOut > 0 && <> واستُبعد <span className="tabular-nums">{stats.optedOut.toLocaleString('en')}</span> رافض للتسويق</>}.
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="flex gap-2"><dt className="text-labbaik-text-muted shrink-0">الحملة:</dt><dd className="font-bold text-neutral-900 dark:text-white">{campaignName}</dd></div>
          <div className="flex gap-2"><dt className="text-labbaik-text-muted shrink-0">الجمهور:</dt><dd className="text-neutral-800 dark:text-neutral-100">{summary}</dd></div>
          <div className="flex gap-2"><dt className="text-labbaik-text-muted shrink-0">التوقيت:</dt><dd className="font-bold text-neutral-900 dark:text-white">{scheduledAt ? formatSchedule(scheduledAt) : 'الآن'}</dd></div>
          <div className="flex gap-2"><dt className="text-labbaik-text-muted shrink-0">السرعة:</dt><dd className="text-neutral-800 dark:text-neutral-100"><span className="tabular-nums">{speed}</span> رسالة/ث · نحو {formatDuration(stats.recipients / speed)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-labbaik-text-muted">
          {scheduledAt ? 'تبدأ الحملة تلقائيًا في الموعد، ويمكنك إلغاؤها من صفحتها قبل ذلك.' : 'يجري الإرسال في الخلفية، وستنتقل لصفحة الحملة لمتابعة الوصول والقراءة والردود.'}
        </p>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> تُحتسب الرسائل على حساب Meta. يمكنك إيقاف الحملة أثناء الإرسال.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
          <button type="button" onClick={onConfirm} autoFocus className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] cursor-pointer">
            {scheduledAt ? <><CalendarClock size={16} /> جدولة الإرسال</> : <><Send size={16} className="-scale-x-100" /> إرسال الآن</>}
          </button>
        </div>
      </div>
    </div>
  );
}
