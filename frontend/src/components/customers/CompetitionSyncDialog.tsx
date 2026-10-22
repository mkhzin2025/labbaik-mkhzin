import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, Trophy, X } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';

type SyncStats = {
  fromPage: number;
  toPage: number;
  pagesDone: number;
  participants: number;
  created: number;
  renamed: number;
  linkedDirect: number;
  linkedOnline: number;
  switched: number;
  cancelled: number;
  invalidPhone: number;
  unknownBranches: Record<string, number>;
};

type SyncState = {
  configured: boolean;
  running: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastPage: number;
  totalPages: number;
  totalParticipants: number;
  stats: SyncStats | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastCompletedAt: string | null;
};

interface Props {
  onClose: () => void;
  /** Called once when a sync that was running finishes, so the page can reload its customers. */
  onSynced: () => void;
}

const STATUS_LABEL: Record<SyncState['status'], { label: string; className: string }> = {
  idle: { label: 'لم تبدأ بعد', className: 'bg-labbaik-page text-labbaik-text-muted' },
  running: { label: 'جارية الآن', className: 'bg-labbaik-blue/10 text-labbaik-blue' },
  completed: { label: 'مكتملة', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  failed: { label: 'توقفت', className: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
};

const formatDate = (value: string | null) => (value ? format(new Date(value), 'yyyy/MM/dd HH:mm') : '—');

export default function CompetitionSyncDialog({ onClose, onSynced }: Props) {
  const [state, setState] = useState<SyncState | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const [error, setError] = useState('');
  // Polling failures are transient (the sync keeps running on the server), so they clear on the next good read.
  const [loadError, setLoadError] = useState('');
  const wasRunning = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<SyncState>('/customers/sync/competition');
      setState(data);
      setLoadError('');
      if (wasRunning.current && !data.running) onSynced();
      wasRunning.current = data.running;
    } catch {
      setLoadError('تعذر تحديث حالة المزامنة، ستُعاد المحاولة تلقائياً. المزامنة نفسها مستمرة على الخادم.');
    }
  }, [onSynced]);

  useEffect(() => { titleRef.current?.focus(); void load(); }, [load]);

  useEffect(() => {
    if (!state?.running) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [state?.running, load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async (full: boolean) => {
    setStarting(true);
    setError('');
    setConfirmFull(false);
    try {
      const { data } = await api.post<SyncState>('/customers/sync/competition', { full });
      setState(data);
      wasRunning.current = data.running;
    } catch (requestError) {
      const response = (requestError as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
      const message = response?.data?.message;
      setError(response?.status === 403 ? 'المزامنة متاحة لمالك المؤسسة أو المشرف فقط.' : (Array.isArray(message) ? message.join('، ') : message) || 'تعذر بدء المزامنة.');
    } finally { setStarting(false); }
  };

  const stats = state?.stats;
  const pagesInRun = stats ? Math.max(1, stats.toPage - stats.fromPage + 1) : 1;
  const progress = stats ? Math.min(100, Math.round((stats.pagesDone / pagesInRun) * 100)) : 0;
  const unknownBranches = Object.entries(stats?.unknownBranches || {}).sort((a, b) => b[1] - a[1]);
  const status = STATUS_LABEL[state?.status || 'idle'];
  const busy = starting || !!state?.running;

  const metrics = stats ? [
    { label: 'عملاء جدد أُضيفوا لفروعهم', value: stats.created, tone: 'text-labbaik-blue' },
    { label: 'أسماء عُبّئت لعملاء بلا اسم', value: stats.renamed, tone: 'text-neutral-900 dark:text-white' },
    { label: 'رُبطوا بفئة «المسابقة»', value: stats.linkedDirect, tone: 'text-violet-700 dark:text-violet-300' },
    { label: 'رُبطوا بفئة «المسابقة - online»', value: stats.linkedOnline, tone: 'text-cyan-700 dark:text-cyan-300' },
    { label: 'نُقلوا بين الفئتين', value: stats.switched, tone: 'text-neutral-900 dark:text-white' },
    { label: 'مشاركات ملغاة (تم تجاهلها)', value: stats.cancelled, tone: 'text-labbaik-text-muted' },
  ] : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="competition-sync-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-labbaik-border bg-labbaik-surface px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-labbaik-blue/10 text-labbaik-blue"><Trophy size={20} /></span>
            <div>
              <h2 ref={titleRef} tabIndex={-1} id="competition-sync-title" className="text-xl font-black text-neutral-900 outline-none dark:text-white">مزامنة المسابقة</h2>
              <p className="mt-1 text-sm text-labbaik-text-muted">يجلب المشاركين من موقع المسابقة ويضيف كل مشارك إلى فرعه.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted transition-colors hover:bg-labbaik-page hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 dark:hover:text-white"><X size={19} /></button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-labbaik-border p-3">
              <p className="text-xs font-bold text-labbaik-text-muted">سجّل مباشرة في الفرع</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><ArrowLeft size={15} className="text-labbaik-text-muted" /><span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">المسابقة</span></p>
            </div>
            <div className="rounded-xl border border-labbaik-border p-3">
              <p className="text-xs font-bold text-labbaik-text-muted">عبر مشارك آخر أو رابط سوشال/مشهور</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><ArrowLeft size={15} className="text-labbaik-text-muted" /><span className="rounded-md bg-cyan-100 px-2 py-0.5 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200" dir="ltr">المسابقة - online</span></p>
            </div>
          </div>
          <p className="text-xs leading-5 text-labbaik-text-muted">لا يُغيَّر اسم عميل له اسم حقيقي، ولا يُحذف أي عميل. كل مشارك يكون في إحدى الفئتين فقط، والمشاركات الملغاة لا تُضاف.</p>

          {state && !state.configured && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"><AlertTriangle size={17} className="mt-1 shrink-0" />المزامنة غير مفعلة على الخادم: أضف COMPETITION_API_KEY في إعدادات البيئة.</p>
          )}

          {!state ? (
            <div className="grid h-32 place-items-center"><Loader2 size={22} className="animate-spin text-labbaik-blue" /></div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-labbaik-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${status.className}`}>
                  {state.running ? <Loader2 size={13} className="animate-spin" /> : state.status === 'completed' ? <Check size={13} /> : null}
                  {status.label}
                </span>
                <span className="text-xs text-labbaik-text-muted">آخر مزامنة مكتملة: <b className="tabular-nums text-neutral-700 dark:text-neutral-200" dir="ltr">{formatDate(state.lastCompletedAt)}</b></span>
              </div>

              {stats && (
                <div className="space-y-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-labbaik-page" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-labbaik-blue transition-[width] duration-500" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="flex flex-wrap justify-between gap-2 text-xs text-labbaik-text-muted">
                    <span>صفحة <b className="tabular-nums text-neutral-800 dark:text-neutral-100">{(stats.fromPage + Math.max(0, stats.pagesDone - 1)).toLocaleString('en')}</b> من <b className="tabular-nums text-neutral-800 dark:text-neutral-100">{stats.toPage.toLocaleString('en')}</b></span>
                    <span>مشاركون عولجوا: <b className="tabular-nums text-neutral-800 dark:text-neutral-100">{stats.participants.toLocaleString('en')}</b> من <b className="tabular-nums text-neutral-800 dark:text-neutral-100">{state.totalParticipants.toLocaleString('en')}</b></span>
                  </p>
                </div>
              )}

              {stats && (
                <dl className="grid gap-2 sm:grid-cols-3">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-xl bg-labbaik-page px-3 py-2.5">
                      <dt className="text-[11px] font-bold leading-4 text-labbaik-text-muted">{metric.label}</dt>
                      <dd className={`mt-1 text-lg font-black tabular-nums ${metric.tone}`}>{metric.value.toLocaleString('en')}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {unknownBranches.length > 0 && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                  <p className="font-black">فروع في المسابقة غير موجودة في النظام (لم يُضف مشاركوها):</p>
                  <p className="mt-1">{unknownBranches.map(([name, count]) => `${name} (${count.toLocaleString('en')})`).join('، ')}</p>
                </div>
              )}

              {state.lastError && !state.running && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 dark:bg-red-950/20 dark:text-red-300">{state.lastError}</p>
              )}
            </div>
          )}

          {confirmFull && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="font-black">المزامنة الكاملة تعيد قراءة كل الصفحات ({state?.totalPages.toLocaleString('en') || '—'} صفحة) وقد تأخذ وقتاً أطول.</p>
              <p>هي آمنة: لا تكرر العملاء ولا تغيّر الأسماء الحقيقية. استخدمها إذا تغيّرت طريقة تسجيل بعض المشاركين.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void start(true)} className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-black text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40">ابدأ المزامنة الكاملة</button>
                <button type="button" onClick={() => setConfirmFull(false)} className="h-9 rounded-lg border border-amber-300 px-4 text-sm font-bold hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/40">تراجع</button>
              </div>
            </div>
          )}
          {loadError && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">{loadError}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-labbaik-border bg-labbaik-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-labbaik-border px-5 text-sm font-black text-neutral-700 transition-colors hover:bg-labbaik-page focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 dark:text-neutral-200">إغلاق</button>
          <button type="button" onClick={() => setConfirmFull(true)} disabled={busy || !state?.configured} className="h-10 rounded-lg border border-labbaik-blue/25 px-5 text-sm font-black text-labbaik-blue transition-colors hover:border-labbaik-blue hover:bg-labbaik-blue/5 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">مزامنة كاملة</button>
          <button type="button" onClick={() => void start(false)} disabled={busy || !state?.configured} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-5 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            {state?.running ? 'جارية المزامنة...' : state?.lastPage ? 'مزامنة الجديد' : 'ابدأ المزامنة'}
          </button>
        </footer>
      </section>
    </div>
  );
}
