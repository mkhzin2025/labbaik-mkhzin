import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, FileDown, Loader2, MessageSquareReply, MessagesSquare, CheckCircle2, Smile, X } from 'lucide-react';
import api from '../../api/client';
import MemberSatisfaction from './MemberSatisfaction';
import { downloadPdf, formatDuration, localDay, RATING_LABELS, type MemberActivity } from '../../lib/team';

const STATUS_LABELS: Record<string, string> = { open: 'مفتوحة', pending: 'معلّقة', snoozed: 'مؤجلة', closed: 'مغلقة' };

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: 'today', label: 'اليوم', range: () => [localDay(new Date()), localDay(new Date())] },
  { id: 'yesterday', label: 'أمس', range: () => { const d = new Date(Date.now() - 86_400_000); return [localDay(d), localDay(d)]; } },
  { id: '7', label: 'آخر 7 أيام', range: () => [localDay(new Date(Date.now() - 6 * 86_400_000)), localDay(new Date())] },
  { id: '30', label: 'آخر 30 يومًا', range: () => [localDay(new Date(Date.now() - 29 * 86_400_000)), localDay(new Date())] },
];

const num = (value: number) => value.toLocaleString('en');
const pct = (value: number, total: number) => (total ? `${Math.round((value / total) * 100)}%` : '—');
const day = (value: string) => value.split('-').reverse().join('/');
const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/** A team member's work over a chosen period: replies, closes, customers' ratings, response time; exports to PDF. */
export default function MemberActivityDialog({ member, branches, onClose }: {
  member: { userId: string; fullName: string; email: string };
  branches: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [preset, setPreset] = useState('today');
  const [from, setFrom] = useState(() => localDay(new Date()));
  const [to, setTo] = useState(() => localDay(new Date()));
  const [data, setData] = useState<{ key: string; value: MemberActivity | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const key = `${from}|${to}`;
  const invalid = !from || !to || from > to;
  const activity = data?.key === key ? data.value : undefined;

  useEffect(() => {
    if (invalid) return;
    const id = ++request.current;
    api.get<MemberActivity>(`/conversations/team/${member.userId}/activity`, { params: { from, to, tz: -new Date().getTimezoneOffset() } })
      .then(({ data: value }) => { if (id === request.current) setData({ key: `${from}|${to}`, value }); })
      .catch(() => { if (id === request.current) setData({ key: `${from}|${to}`, value: null }); });
  }, [member.userId, from, to, invalid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (id: string) => {
    const option = PRESETS.find((p) => p.id === id);
    if (!option) return;
    const [start, end] = option.range();
    setPreset(id);
    setFrom(start);
    setTo(end);
  };

  const exportPdf = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadPdf(`/conversations/team/${member.userId}/activity/pdf`, { from, to, tz: -new Date().getTimezoneOffset() }, `تقرير-${member.fullName || 'عضو'}-${from}_${to}.pdf`);
    } catch (message) {
      setError(String(message));
    } finally {
      setExporting(false);
    }
  };

  const t = activity?.totals;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || '—';
  const activeDays = activity?.daily.filter((d) => d.replies || d.closed || d.positive || d.neutral || d.negative) || [];

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="member-activity-title" dir="rtl" className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h2 id="member-activity-title" className="truncate text-lg font-black text-neutral-900 dark:text-white">نشاط {member.fullName || member.email}</h2>
            <p className="text-xs text-labbaik-text-muted">الردود والمحادثات التي أغلقها وتقييمات العملاء له.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-labbaik-text-muted hover:bg-labbaik-page cursor-pointer"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-end gap-2 px-5">
          <div role="radiogroup" aria-label="الفترة" className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => pick(p.id)}
                className={`h-9 rounded-lg border px-3 text-xs font-bold transition-colors cursor-pointer ${preset === p.id ? 'border-labbaik-blue bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200' : 'border-labbaik-border text-labbaik-text-muted hover:border-labbaik-blue/30'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="text-xs font-bold text-labbaik-text-muted">
            من
            <input type="date" value={from} max={to || localDay(new Date())} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className="mt-1 block h-9 rounded-lg border border-labbaik-border bg-labbaik-page px-2 text-sm text-neutral-900 dark:text-white" />
          </label>
          <label className="text-xs font-bold text-labbaik-text-muted">
            إلى
            <input type="date" value={to} min={from} max={localDay(new Date())} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className="mt-1 block h-9 rounded-lg border border-labbaik-border bg-labbaik-page px-2 text-sm text-neutral-900 dark:text-white" />
          </label>
          <button type="button" onClick={() => void exportPdf()} disabled={invalid || exporting || !activity}
            className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-labbaik-blue px-3.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} {exporting ? 'جارٍ إنشاء الملف…' : 'تصدير PDF'}
          </button>
        </div>
        {error && <p role="alert" className="px-5 pt-2 text-xs font-bold text-red-700 dark:text-red-300">{error}</p>}

        <div className="mt-4 flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar">
          {invalid ? (
            <p className="py-12 text-center text-sm text-labbaik-text-muted">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p>
          ) : activity === undefined ? (
            <div className="grid place-items-center py-12"><Loader2 size={22} className="animate-spin text-labbaik-blue" /></div>
          ) : activity === null || !t ? (
            <p className="py-12 text-center text-sm text-labbaik-text-muted">تعذر تحميل النشاط.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'الردود', value: num(t.replies), note: 'رسالة كتبها', icon: <MessageSquareReply size={16} /> },
                  { label: 'المحادثات', value: num(t.conversations), note: 'رد فيها', icon: <MessagesSquare size={16} /> },
                  { label: 'أغلقها', value: num(t.closed), note: 'إغلاق محادثة', icon: <CheckCircle2 size={16} /> },
                  { label: 'رضا العملاء', value: t.rated ? pct(t.positive, t.rated) : '—', note: t.rated ? `${num(t.rated)} تقييم` : 'لا تقييمات', icon: <Smile size={16} /> },
                  { label: 'زمن الرد', value: formatDuration(activity.responseTime.medianSeconds), note: activity.responseTime.samples ? `${pct(Math.round((activity.responseTime.within5MinShare || 0) * activity.responseTime.samples), activity.responseTime.samples)} خلال 5 دقائق` : 'الوسيط', icon: <Clock size={16} /> },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-labbaik-border bg-labbaik-page/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-labbaik-text-muted">{card.icon}{card.label}</p>
                    <p className="mt-1.5 text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{card.value}</p>
                    <p className="text-[11px] text-labbaik-text-muted">{card.note}</p>
                  </div>
                ))}
              </div>

              <MemberSatisfaction activity={activity} />

              {activity.daily.length > 1 && (
                <section>
                  <h3 className="mb-2 text-sm font-black text-neutral-900 dark:text-white">يومًا بيوم</h3>
                  {activeDays.length ? (
                    <div className="overflow-x-auto rounded-xl border border-labbaik-border">
                      <table className="w-full text-sm">
                        <thead className="bg-labbaik-page text-xs text-labbaik-text-muted">
                          <tr>{['اليوم', 'الردود', 'أغلقها', 'راضٍ', 'عادي', 'غير راضٍ'].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-labbaik-border tabular-nums">
                          {activeDays.map((d) => (
                            <tr key={d.date}>
                              <td className="px-3 py-2 font-bold text-neutral-900 dark:text-white">{day(d.date)}</td>
                              <td className="px-3 py-2">{num(d.replies)}</td>
                              <td className="px-3 py-2">{num(d.closed)}</td>
                              <td className="px-3 py-2">{num(d.positive)}</td>
                              <td className="px-3 py-2">{num(d.neutral)}</td>
                              <td className="px-3 py-2">{num(d.negative)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-labbaik-text-muted">لا يوجد نشاط في هذه الفترة.</p>}
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-black text-neutral-900 dark:text-white">
                  المحادثات {activity.conversationsTotal > 0 && <span className="text-xs font-bold text-labbaik-text-muted tabular-nums">({num(activity.conversationsTotal)})</span>}
                </h3>
                {activity.conversations.length ? (
                  <div className="overflow-x-auto rounded-xl border border-labbaik-border">
                    <table className="w-full text-sm">
                      <thead className="bg-labbaik-page text-xs text-labbaik-text-muted">
                        <tr>
                          {['العميل', ...(branches.length > 1 ? ['الفرع'] : []), 'ردوده', 'أغلقها', 'التقييم', 'الحالة الآن', 'آخر نشاط له'].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-labbaik-border">
                        {activity.conversations.slice(0, 200).map((c) => (
                          <tr key={c.id}>
                            <td className="px-3 py-2">
                              <span className="block font-bold text-neutral-900 dark:text-white">{c.customerName || <span dir="ltr" className="tabular-nums">{c.customerPhone}</span>}</span>
                              {c.customerName && <span dir="ltr" className="block text-[11px] tabular-nums text-labbaik-text-muted">{c.customerPhone}</span>}
                            </td>
                            {branches.length > 1 && <td className="px-3 py-2 text-labbaik-text-muted">{branchName(c.storeId)}</td>}
                            <td className="px-3 py-2 tabular-nums">{num(c.replies)}</td>
                            <td className="px-3 py-2 tabular-nums">{c.closed ? num(c.closed) : '—'}</td>
                            <td className="px-3 py-2">{c.rating ? <span className={`inline-flex h-6 items-center rounded px-1.5 text-[11px] font-bold ${RATING_LABELS[c.rating].cls}`}>{RATING_LABELS[c.rating].emoji} {RATING_LABELS[c.rating].label}</span> : '—'}</td>
                            <td className="px-3 py-2 text-labbaik-text-muted">{STATUS_LABELS[c.status] || c.status}</td>
                            <td className="px-3 py-2 tabular-nums text-labbaik-text-muted" dir="ltr">{dateTime(c.lastActivityAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-labbaik-text-muted">لم يرد على أي محادثة ولم يغلق أيًّا في هذه الفترة.</p>}
                {activity.conversations.length > 200 && <p className="mt-2 text-xs text-labbaik-text-muted">تظهر أحدث 200 محادثة هنا، والقائمة الكاملة في ملف PDF.</p>}
              </section>

              <p className="rounded-lg bg-labbaik-page px-3 py-2 text-xs leading-relaxed text-labbaik-text-muted">
                يُحتسب النشاط منذ تفعيل تتبّع الفريق: الرسائل الأقدم لا تحمل اسم من كتبها. يُنسب التقييم لمن أغلق المحادثة لأن رسالة التقييم تُرسل عند الإغلاق.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
