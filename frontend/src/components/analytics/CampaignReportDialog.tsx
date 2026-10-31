import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Loader2, X } from 'lucide-react';
import api from '../../api/client';
import type { Campaign } from '../whatsapp/campaignShared';
import { dateTime, engagement, num, pct } from '../whatsapp/campaignFormat';

/** Campaigns this small are tests (a few numbers, branch managers): listed, but not ticked by default. */
const TEST_SIZE = 50;

const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** Local midnight of a yyyy-mm-dd day, as an ISO instant; `next` gives the following midnight (exclusive end). */
const dayStart = (day: string, next = false) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + (next ? 1 : 0)).toISOString();
};

/** Picks a date range and campaigns, then downloads their PDF report. */
export default function CampaignReportDialog({ days, onClose }: { days: number; onClose: () => void }) {
  const today = localDay(new Date());
  const [from, setFrom] = useState(() => localDay(new Date(Date.now() - (days - 1) * 86_400_000)));
  const [to, setTo] = useState(today);
  // Results belong to the range they were loaded for; a changed range shows the spinner until its own arrive.
  const [loadedRange, setLoadedRange] = useState<{ range: string; items: Campaign[] | null }>({ range: '', items: null });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const request = useRef(0);
  const range = `${from}|${to}`;
  const current = loadedRange.range === range;
  const campaigns = current ? loadedRange.items : null;
  const failed = current && loadedRange.items === null;

  useEffect(() => {
    if (!from || !to || from > to) return;
    const id = ++request.current;
    const key = `${from}|${to}`;
    (async () => {
      const items: Campaign[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data } = await api.get<{ items: Campaign[]; total: number }>('/integrations/meta/whatsapp/campaigns', {
          params: { page, limit: 50, from: dayStart(from), to: dayStart(to, true) },
        });
        items.push(...data.items);
        if (items.length >= data.total || !data.items.length) break;
      }
      return items.filter((c) => c.status !== 'scheduled');
    })()
      .then((items) => {
        if (id !== request.current) return;
        setLoadedRange({ range: key, items });
        setPicked(new Set(items.filter((c) => c.stats.total >= TEST_SIZE).map((c) => c.id)));
      })
      .catch(() => { if (id === request.current) setLoadedRange({ range: key, items: null }); });
  }, [from, to]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allPicked = !!campaigns?.length && campaigns.every((c) => picked.has(c.id));
  const toggle = (id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pickedTotal = useMemo(() => (campaigns || []).filter((c) => picked.has(c.id)).reduce((sum, c) => sum + c.stats.total, 0), [campaigns, picked]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    const ids = (campaigns || []).filter((c) => picked.has(c.id)).map((c) => c.id);
    setBusy(true);
    setError('');
    try {
      const response = await api.get('/integrations/meta/whatsapp/campaigns/report/pdf', {
        params: { ids: ids.join(','), from, to, tz: -new Date().getTimezoneOffset() },
        responseType: 'blob',
      });
      const disposition = String(response.headers['content-disposition'] || '');
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `campaigns-report-${from}_${to}.pdf`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (requestError) {
      const data = (requestError as { response?: { data?: Blob } }).response?.data;
      let message = 'تعذر إنشاء التقرير. حاول مرة أخرى.';
      if (data instanceof Blob) {
        try { message = (JSON.parse(await data.text()) as { message?: string }).message || message; } catch { /* not JSON */ }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const invalidRange = !from || !to || from > to;

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" dir="rtl" className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id="report-dialog-title" className="text-lg font-black text-neutral-900 dark:text-white">تصدير تقرير الحملات (PDF)</h2>
            <p className="text-xs text-labbaik-text-muted">ملخص ومقارنة للحملات المختارة، ثم صفحة تفصيلية لكل حملة.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="h-8 w-8 grid place-items-center rounded-lg text-labbaik-text-muted hover:bg-labbaik-page cursor-pointer"><X size={18} /></button>
        </div>

        <div className="px-5 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-labbaik-text-muted">
            من تاريخ
            <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full h-10 px-3 rounded-lg border border-labbaik-border bg-labbaik-page text-sm text-neutral-900 dark:text-white" />
          </label>
          <label className="text-xs font-bold text-labbaik-text-muted">
            إلى تاريخ
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full h-10 px-3 rounded-lg border border-labbaik-border bg-labbaik-page text-sm text-neutral-900 dark:text-white" />
          </label>
        </div>

        <div className="mt-4 mx-5 flex-1 min-h-0 flex flex-col rounded-xl border border-labbaik-border overflow-hidden">
          <label className="flex items-center gap-2.5 px-3 py-2.5 border-b border-labbaik-border bg-labbaik-page text-sm font-bold text-neutral-900 dark:text-white cursor-pointer">
            <input type="checkbox" checked={allPicked} disabled={!campaigns?.length}
              onChange={() => setPicked(allPicked ? new Set() : new Set((campaigns || []).map((c) => c.id)))} className="h-4 w-4 accent-labbaik-blue" />
            تحديد الكل
            <span className="mr-auto text-xs font-medium text-labbaik-text-muted tabular-nums">{campaigns ? `${num(picked.size)} من ${num(campaigns.length)} حملة` : ''}</span>
          </label>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {invalidRange ? (
              <p className="py-10 text-center text-sm text-labbaik-text-muted">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p>
            ) : failed ? (
              <p className="py-10 text-center text-sm text-labbaik-text-muted">تعذر تحميل الحملات.</p>
            ) : !campaigns ? (
              <div className="py-10 grid place-items-center"><Loader2 size={20} className="animate-spin text-labbaik-blue" /></div>
            ) : !campaigns.length ? (
              <p className="py-10 text-center text-sm text-labbaik-text-muted">لا توجد حملات في هذه الفترة.</p>
            ) : (
              <ul className="divide-y divide-labbaik-border">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-labbaik-page cursor-pointer">
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 shrink-0 accent-labbaik-blue" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-neutral-900 dark:text-white truncate">
                          {c.name}
                          {c.stats.total < TEST_SIZE && <span className="mr-1.5 text-[11px] font-medium text-labbaik-text-muted">(تجريبية)</span>}
                        </span>
                        <span className="block text-[11px] text-labbaik-text-muted tabular-nums">
                          {dateTime(c.createdAt)} · {num(c.stats.total)} مستلم · قراءة {pct(c.stats.read, c.stats.delivered)} · تفاعل {engagement(c.stats)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-5">
          {error
            ? <p role="alert" className="text-xs font-bold text-red-700 dark:text-red-300">{error}</p>
            : <p className="text-xs text-labbaik-text-muted tabular-nums">{picked.size ? `${num(pickedTotal)} مستلم في الحملات المختارة` : 'اختر حملة واحدة على الأقل.'}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:bg-labbaik-page cursor-pointer">إلغاء</button>
            <button type="button" onClick={() => void download()} disabled={!picked.size || invalidRange || busy}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-labbaik-blue text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} {busy ? 'جارٍ إنشاء الملف…' : 'تنزيل التقرير'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
