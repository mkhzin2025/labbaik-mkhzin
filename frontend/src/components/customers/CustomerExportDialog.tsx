import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, CalendarDays, Check, Columns3, ContactRound, Download, FileSpreadsheet, FileText, LayoutList, Loader2, Tag, X } from 'lucide-react';
import api from '../../api/client';
import type { Branch } from './BranchSelector';

type ExportFormat = 'xlsx' | 'pdf';
type ExportType = 'customers' | 'statistics';
type BranchMode = 'all' | 'single' | 'multiple';
type ExportTag = { id: string; name: string; color: string; storeId?: string | null };
type StatisticsSource = { key: string; type: 'category' | 'tag'; name: string; color: string; customers: number };

interface Props {
  branches: Branch[];
  initialStoreId?: string;
  onClose: () => void;
}

const PDF_LIMIT = 5000;
const SOURCE_LIMIT = 6;
const SOURCES_STORAGE_KEY = 'customers.statisticsSources';
const BASELINE_STORAGE_KEY = 'customers.statisticsBaselineDate';
const DETAILS_STORAGE_KEY = 'customers.statisticsBranchDetails';

const readSetting = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const saveSetting = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } };

const todayInRiyadh = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());

function readSavedSources(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SOURCES_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : [];
  } catch { return []; }
}

export default function CustomerExportDialog({ branches, initialStoreId, onClose }: Props) {
  const initialMode: BranchMode = initialStoreId ? 'single' : 'all';
  const [branchMode, setBranchMode] = useState<BranchMode>(initialMode);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(initialStoreId ? [initialStoreId] : branches.map((branch) => branch.id));
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [exportType, setExportType] = useState<ExportType>('customers');
  const [tags, setTags] = useState<ExportTag[]>([]);
  const [tagId, setTagId] = useState('');
  const [sources, setSources] = useState<StatisticsSource[]>([]);
  const [sourcesStatus, setSourcesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sourcesAttempt, setSourcesAttempt] = useState(0);
  const [selectedSources, setSelectedSources] = useState<string[]>(readSavedSources);
  // The baseline is usually the day of a bulk import, so the last chosen date is kept rather than "today".
  const [baselineDate, setBaselineDate] = useState(() => readSetting(BASELINE_STORAGE_KEY) || todayInRiyadh());
  const [branchDetails, setBranchDetails] = useState(() => readSetting(DETAILS_STORAGE_KEY) === 'true');
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const effectiveStoreIds = useMemo(() => {
    if (branchMode === 'all') return branches.map((branch) => branch.id);
    return selectedStoreIds;
  }, [branchMode, branches, selectedStoreIds]);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!effectiveStoreIds.length) { setTags([]); setTagId(''); return; }
    setOptionsBusy(true);
    void api.get('/customers/export/options', { params: { storeIds: effectiveStoreIds.join(',') } })
      .then(({ data }) => {
        setTags(data || []);
        setTagId((current) => (data || []).some((tag: ExportTag) => tag.id === current) ? current : '');
      })
      .catch(() => { setTags([]); setTagId(''); })
      .finally(() => setOptionsBusy(false));
  }, [effectiveStoreIds.join(',')]);

  const sourceReport = exportType === 'statistics' && format === 'pdf';

  useEffect(() => {
    if (!sourceReport || !effectiveStoreIds.length) { setSources([]); setSourcesStatus('ready'); return; }
    setSourcesStatus('loading');
    void api.get<StatisticsSource[]>('/customers/export/statistics-sources', { params: { storeIds: effectiveStoreIds.join(',') } })
      .then(({ data }) => { setSources(data || []); setSourcesStatus('ready'); })
      .catch(() => { setSources([]); setSourcesStatus('error'); });
  }, [sourceReport, effectiveStoreIds.join(','), sourcesAttempt]);

  // Keep the saved order, dropping columns that no longer exist for these branches.
  const activeSources = useMemo(
    () => selectedSources.filter((key) => sources.some((source) => source.key === key)),
    [selectedSources, sources],
  );

  const toggleSource = (key: string) => {
    setSelectedSources((current) => {
      const next = current.includes(key) ? current.filter((value) => value !== key) : current.length >= SOURCE_LIMIT ? current : [...current, key];
      try { localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
      return next;
    });
    setDownloaded(false);
  };

  const setMode = (mode: BranchMode) => {
    setBranchMode(mode);
    setError('');
    if (mode === 'all') setSelectedStoreIds(branches.map((branch) => branch.id));
    else if (mode === 'single') setSelectedStoreIds([initialStoreId || branches[0]?.id].filter(Boolean));
    else if (!selectedStoreIds.length) setSelectedStoreIds(initialStoreId ? [initialStoreId] : []);
  };

  const toggleBranch = (id: string) => {
    setSelectedStoreIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setError('');
  };

  const exportCustomers = async () => {
    if (!effectiveStoreIds.length) { setError('حدد فرعاً واحداً على الأقل للتصدير.'); return; }
    setBusy(true);
    setDownloaded(false);
    setError('');
    try {
      const response = await api.get('/customers/export', {
        params: sourceReport
          ? { format, exportType, storeIds: effectiveStoreIds.join(','), sources: activeSources.join(',') || undefined, baselineDate, branchDetails: branchDetails || undefined }
          : { format, exportType, storeIds: effectiveStoreIds.join(','), tagId: tagId || undefined },
        responseType: 'blob',
      });
      const disposition = String(response.headers['content-disposition'] || '');
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${exportType === 'statistics' ? 'customer-statistics' : 'customers'}.${format}`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (requestError) {
      const data = (requestError as { response?: { data?: Blob | { message?: string } } }).response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
          setError(Array.isArray(parsed.message) ? parsed.message.join('، ') : parsed.message || 'تعذر إنشاء ملف التصدير.');
        } catch { setError('تعذر إنشاء ملف التصدير. حاول مرة أخرى.'); }
      } else setError((data as { message?: string })?.message || 'تعذر إنشاء ملف التصدير. حاول مرة أخرى.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="customer-export-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-labbaik-border bg-labbaik-surface px-5 py-4 sm:px-6">
          <div>
            <h2 ref={titleRef} tabIndex={-1} id="customer-export-title" className="text-xl font-black text-neutral-900 outline-none dark:text-white">تصدير العملاء</h2>
            <p className="mt-1 text-sm text-labbaik-text-muted">حدد العملاء وصيغة الملف الذي تريد تنزيله.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted transition-colors hover:bg-labbaik-page hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:hover:text-white"><X size={19} /></button>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-black text-neutral-900 dark:text-white">نوع التصدير</legend>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="نوع التصدير">
              <button type="button" role="radio" aria-checked={exportType === 'customers'} disabled={busy} onClick={() => { setExportType('customers'); setError(''); setDownloaded(false); }} className={`flex items-start gap-3 rounded-xl border p-4 text-right transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 ${exportType === 'customers' ? 'border-labbaik-blue bg-labbaik-blue/10' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}>
                <ContactRound size={23} className="mt-0.5 shrink-0 text-labbaik-blue" />
                <span><b className="block text-sm text-neutral-900 dark:text-white">تصدير أرقام العملاء</b><span className="mt-1 block text-xs leading-5 text-labbaik-text-muted">الأسماء والأرقام وبيانات التواصل والتصنيفات.</span></span>
              </button>
              <button type="button" role="radio" aria-checked={exportType === 'statistics'} disabled={busy} onClick={() => { setExportType('statistics'); setError(''); setDownloaded(false); }} className={`flex items-start gap-3 rounded-xl border p-4 text-right transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 ${exportType === 'statistics' ? 'border-labbaik-blue bg-labbaik-blue/10' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}>
                <BarChart3 size={23} className="mt-0.5 shrink-0 text-labbaik-blue" />
                <span><b className="block text-sm text-neutral-900 dark:text-white">تصدير الإحصائيات</b><span className="mt-1 block text-xs leading-5 text-labbaik-text-muted">ملخص الأعداد والتصنيفات لكل فرع محدد.</span></span>
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Building2 size={17} className="text-labbaik-blue" /> نطاق الفروع</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="نطاق الفروع">
              {([['all', 'كل الفروع'], ['single', 'فرع واحد'], ['multiple', 'عدة فروع']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={branchMode === value} disabled={busy} onClick={() => setMode(value)} className={`h-10 rounded-lg border px-2 text-sm font-black transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 ${branchMode === value ? 'border-labbaik-blue bg-labbaik-blue/10 text-labbaik-blue' : 'border-labbaik-border text-labbaik-text-muted hover:border-labbaik-blue/40'}`}>{label}</button>
              ))}
            </div>

            {branchMode === 'single' && (
              <select value={selectedStoreIds[0] || ''} onChange={(event) => setSelectedStoreIds([event.target.value])} disabled={busy} aria-label="اختر الفرع" className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 dark:text-white">
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            )}

            {branchMode === 'multiple' && (
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-xl bg-labbaik-page p-3 sm:grid-cols-2" aria-label="حدد الفروع">
                {branches.map((branch) => {
                  const checked = selectedStoreIds.includes(branch.id);
                  return <label key={branch.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm font-bold text-neutral-800 hover:bg-labbaik-surface dark:text-neutral-100"><input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleBranch(branch.id)} className="size-4 accent-labbaik-blue" /><span className="flex-1">{branch.name}</span>{checked && <Check size={15} className="text-labbaik-blue" />}</label>;
                })}
              </div>
            )}
            <p className="text-xs text-labbaik-text-muted"><span className="tabular-nums font-black text-neutral-700 dark:text-neutral-200">{effectiveStoreIds.length.toLocaleString('en')}</span> فرع محدد</p>
          </fieldset>

          {sourceReport && (
            <>
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Columns3 size={17} className="text-labbaik-blue" /> أعمدة التقرير <span className="font-medium text-labbaik-text-muted">(فئات وتاقات، حتى {SOURCE_LIMIT})</span></legend>
                <p className="text-xs leading-5 text-labbaik-text-muted">تظهر الأعمدة بترتيب اختيارك بعد عمود «المخزّنة سابقاً»، ثم الإجمالي والإجمالي بدون تكرار.</p>
                {sourcesStatus === 'loading' ? (
                  <p className="flex items-center gap-2 rounded-xl bg-labbaik-page px-4 py-3 text-xs font-bold text-labbaik-text-muted"><Loader2 size={15} className="animate-spin text-labbaik-blue" /> جاري تحميل الفئات والتاقات وأعدادها...</p>
                ) : sourcesStatus === 'error' ? (
                  <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700 dark:bg-red-950/20 dark:text-red-300">
                    تعذر تحميل الفئات والتاقات.
                    <button type="button" onClick={() => setSourcesAttempt((value) => value + 1)} className="rounded-md border border-red-300 px-3 py-1 font-black hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/40">إعادة المحاولة</button>
                  </p>
                ) : sources.length ? (
                  <div className="flex flex-wrap gap-2" aria-label="أعمدة التقرير">
                    {sources.map((source) => {
                      const order = activeSources.indexOf(source.key);
                      const selected = order >= 0;
                      return (
                        <button key={source.key} type="button" aria-pressed={selected} disabled={busy || (!selected && activeSources.length >= SOURCE_LIMIT)} onClick={() => toggleSource(source.key)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 ${selected ? 'border-labbaik-blue bg-labbaik-blue/10 text-neutral-900 dark:text-white' : 'border-labbaik-border text-labbaik-text-muted hover:border-labbaik-blue/40'}`}>
                          {selected
                            ? <span className="grid size-5 place-items-center rounded-full bg-labbaik-blue text-[11px] font-black text-white tabular-nums">{order + 1}</span>
                            : <span className="size-2.5 rounded-full" style={{ backgroundColor: source.color }} />}
                          <span>{source.name}</span>
                          <span className="text-[11px] font-medium text-labbaik-text-muted">{source.type === 'tag' ? 'تاق' : 'فئة'} · <span className="tabular-nums">{source.customers.toLocaleString('en')}</span></span>
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="rounded-xl bg-labbaik-page px-4 py-3 text-xs font-bold text-labbaik-text-muted">لا توجد فئات أو تاقات لهذه الفروع.</p>}
              </fieldset>

              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><CalendarDays size={17} className="text-labbaik-blue" /> الأعداد المخزّنة سابقاً = المسجّلون قبل</span>
                <input type="date" value={baselineDate} max={todayInRiyadh()} onChange={(event) => { const value = event.target.value || todayInRiyadh(); setBaselineDate(value); saveSetting(BASELINE_STORAGE_KEY, value); setDownloaded(false); }} disabled={busy} className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 dark:text-white" />
                <span className="block text-xs leading-5 text-labbaik-text-muted">اختر يوم الاستيراد أو بداية الفترة: من سُجّل قبله «مخزّن سابقاً»، ومن سُجّل فيه أو بعده «جديد».</span>
              </label>

              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-labbaik-border p-4 transition-colors hover:border-labbaik-blue/40">
                <span>
                  <b className="flex items-center gap-2 text-sm text-neutral-900 dark:text-white"><LayoutList size={17} className="text-labbaik-blue" /> تفاصيل الفروع</b>
                  <span className="mt-1 block text-xs leading-5 text-labbaik-text-muted">صفحة لكل فرع: قبل وبعد، نسبة النمو، وكم من كل فئة وتاق عملاء جدد وكم مخزّنون سابقاً.</span>
                </span>
                <span className="relative mt-0.5 shrink-0">
                  <input type="checkbox" role="switch" checked={branchDetails} disabled={busy} onChange={(event) => { setBranchDetails(event.target.checked); saveSetting(DETAILS_STORAGE_KEY, String(event.target.checked)); setDownloaded(false); }} className="peer sr-only" />
                  <span className="block h-6 w-11 rounded-full bg-neutral-300 transition-colors peer-checked:bg-labbaik-blue peer-focus-visible:ring-2 peer-focus-visible:ring-labbaik-blue/30 dark:bg-neutral-700" />
                  <span className="absolute right-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
                </span>
              </label>
            </>
          )}

          {!sourceReport && <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Tag size={17} className="text-labbaik-blue" /> فلترة حسب التاق <span className="font-medium text-labbaik-text-muted">(اختياري)</span></span>
            <div className="relative">
              <select value={tagId} onChange={(event) => setTagId(event.target.value)} disabled={busy || optionsBusy || !effectiveStoreIds.length} className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 disabled:opacity-50 dark:text-white">
                <option value="">كل التاقات</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}{tag.storeId ? ` — ${branches.find((branch) => branch.id === tag.storeId)?.name || 'فرع'}` : ''}</option>)}
              </select>
              {optionsBusy && <Loader2 size={16} className="absolute left-3 top-3.5 animate-spin text-labbaik-blue" />}
            </div>
          </label>}

          <fieldset className="space-y-3">
            <legend className="text-sm font-black text-neutral-900 dark:text-white">صيغة التصدير</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" role="radio" aria-checked={format === 'xlsx'} disabled={busy} onClick={() => { setFormat('xlsx'); setError(''); }} className={`flex items-start gap-3 rounded-xl border p-4 text-right transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 ${format === 'xlsx' ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/20' : 'border-labbaik-border hover:border-emerald-500/50'}`}>
                <FileSpreadsheet size={23} className="mt-0.5 shrink-0 text-emerald-600" /><span><b className="block text-sm text-neutral-900 dark:text-white">Excel (.xlsx)</b><span className="mt-1 block text-xs leading-5 text-labbaik-text-muted">مناسب للأعداد الكبيرة والفرز والتحليل.</span></span>
              </button>
              <button type="button" role="radio" aria-checked={format === 'pdf'} disabled={busy} onClick={() => { setFormat('pdf'); setError(''); }} className={`flex items-start gap-3 rounded-xl border p-4 text-right transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 ${format === 'pdf' ? 'border-red-400 bg-red-50/70 dark:bg-red-950/20' : 'border-labbaik-border hover:border-red-400/50'}`}>
                <FileText size={23} className="mt-0.5 shrink-0 text-red-500" /><span><b className="block text-sm text-neutral-900 dark:text-white">PDF</b><span className="mt-1 block text-xs leading-5 text-labbaik-text-muted">{exportType === 'customers' ? `تقرير جاهز للطباعة حتى ${PDF_LIMIT.toLocaleString('en')} عميل.` : 'ملخص إحصائي منسق وجاهز للطباعة.'}</span></span>
              </button>
            </div>
          </fieldset>

          {format === 'pdf' && exportType === 'customers' && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">إذا تجاوزت النتيجة {PDF_LIMIT.toLocaleString('en')} عميل، اختر Excel أو ضيّق الفروع والتاق.</p>}
          {downloaded && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"><Check size={17} /> تم إنشاء الملف وبدء تنزيله.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-labbaik-border bg-labbaik-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-lg border border-labbaik-border px-5 text-sm font-black text-neutral-700 transition-colors hover:bg-labbaik-page focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:text-neutral-200">إغلاق</button>
          <button type="button" onClick={() => void exportCustomers()} disabled={busy || optionsBusy || !effectiveStoreIds.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-5 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">{busy ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}{busy ? 'جاري تجهيز الملف...' : `تصدير ${exportType === 'customers' ? 'الأرقام' : 'الإحصائيات'} بصيغة ${format === 'xlsx' ? 'Excel' : 'PDF'}`}</button>
        </footer>
      </section>
    </div>
  );
}
