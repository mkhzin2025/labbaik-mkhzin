import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, Clock, Loader2, MinusCircle, Table2 } from 'lucide-react';
import { num, pct } from './campaignFormat';
import type { HeaderMedia } from './templateUtils';

export type CampaignStats = {
  total: number;
  pending: number;
  accepted: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  failed: number;
  skipped: number;
};

type Label = { id: string; name: string; color: string };

export type CampaignAudience = {
  mode: 'all' | 'segment' | 'manual';
  storeIds: string[];
  tagMatch?: 'any' | 'all';
  manualCount?: number;
  excludedCount?: number;
  test?: boolean;
  labels: { branches: { id: string; name: string }[]; categories: Label[]; tags: Label[]; excludeCategories: Label[]; excludeTags: Label[] };
};

export type CampaignStatus = 'scheduled' | 'queued' | 'sending' | 'completed' | 'cancelled' | 'failed';

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  connectionId: string;
  templateId: string | null;
  templateName: string;
  templateLanguage: string;
  templateCategory: string | null;
  createdByName: string | null;
  storeIds: string[];
  audience: CampaignAudience;
  sourceRecords: number;
  duplicatesRemoved: number;
  optedOutSkipped: number;
  totalRecipients: number;
  lastError: string | null;
  scheduledAt: string | null;
  messagesPerSecond: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stats: CampaignStats;
};

export type CampaignDetails = Campaign & {
  previewText: string | null;
  parameters: { body: string[]; header: string[]; buttons: { index: number; text: string }[]; otpCode?: string | null; nameFallback?: string | null; headerMedia?: HeaderMedia | null };
  byBranch: { storeId: string; storeName: string | null; stats: CampaignStats }[];
  buttons: { text: string; count: number }[];
  errors: { error: string; count: number }[];
  /** Numbers Meta rejected over unpaid WhatsApp billing; can be re-sent once the account is paid up. */
  paymentFailed: number;
  timeline: { kind: 'sent' | 'read' | 'replied'; bucket: string; count: number }[];
};

const STATUS: Record<CampaignStatus, { label: string; icon: ReactNode; cls: string }> = {
  scheduled: { label: 'مجدولة', icon: <CalendarClock size={12} />, cls: 'bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300' },
  queued: { label: 'بانتظار الإرسال', icon: <Clock size={12} />, cls: 'bg-labbaik-page text-labbaik-text-muted' },
  sending: { label: 'جارٍ الإرسال', icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' },
  completed: { label: 'اكتملت', icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
  cancelled: { label: 'أُلغيت', icon: <Ban size={12} />, cls: 'bg-labbaik-page text-labbaik-text-muted' },
  failed: { label: 'توقفت', icon: <AlertTriangle size={12} />, cls: 'bg-red-500/15 text-red-800 dark:text-red-300' },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const info = STATUS[status] || STATUS.queued;
  return <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold whitespace-nowrap ${info.cls}`}>{info.icon}{info.label}</span>;
}

/** Furthest stage a recipient reached, for the recipients table. */
export function RecipientStatusBadge({ row }: { row: { status: string; repliedAt?: string | null; readAt?: string | null; deliveredAt?: string | null; replyType?: string | null } }) {
  let label = 'بانتظار الإرسال';
  let cls = 'bg-labbaik-page text-labbaik-text-muted';
  let icon: ReactNode = <Clock size={12} />;
  if (row.status === 'failed') { label = 'فشل'; cls = 'bg-red-500/15 text-red-800 dark:text-red-300'; icon = <AlertTriangle size={12} />; }
  else if (row.status === 'skipped') { label = 'لم يُرسل'; icon = <MinusCircle size={12} />; }
  else if (row.repliedAt) { label = row.replyType === 'button' ? 'ضغط زرًا' : 'ردّ'; cls = 'bg-violet-500/15 text-violet-800 dark:text-violet-200'; icon = <CheckCircle2 size={12} />; }
  else if (row.readAt) { label = 'قُرئت'; cls = 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'; icon = <CheckCircle2 size={12} />; }
  else if (row.deliveredAt) { label = 'وصلت'; cls = 'bg-sky-500/15 text-sky-800 dark:text-sky-200'; icon = <CheckCircle2 size={12} />; }
  else if (row.status === 'sent') { label = 'أُرسلت'; cls = 'bg-labbaik-page text-neutral-700 dark:text-neutral-200'; icon = <CheckCircle2 size={12} />; }
  else if (row.status === 'sending') { label = 'جارٍ الإرسال'; icon = <Loader2 size={12} className="animate-spin" />; }
  return <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold whitespace-nowrap ${cls}`}>{icon}{label}</span>;
}

/**
 * The delivery funnel as one-hue bars: each stage relative to the targeted total, with the
 * step-to-step rate that matters (delivered of accepted, read of delivered, replied of delivered).
 */
export function Funnel({ stats }: { stats: CampaignStats }) {
  const stages = [
    { label: 'المستهدفون', value: stats.total, note: '' },
    { label: 'قبلها واتساب', value: stats.accepted, note: pct(stats.accepted, stats.total) },
    { label: 'وصلت', value: stats.delivered, note: `${pct(stats.delivered, stats.accepted)} من المقبولة` },
    { label: 'قُرئت', value: stats.read, note: `${pct(stats.read, stats.delivered)} من الواصلة` },
    { label: 'تفاعلوا بالرد', value: stats.replied, note: `${pct(stats.replied, stats.delivered)} من الواصلة` },
  ];
  return (
    <ul className="space-y-2" aria-label="مراحل وصول الحملة">
      {stages.map((stage) => (
        <li key={stage.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-2 text-sm">
          <span className="font-bold text-neutral-800 dark:text-neutral-100">{stage.label}</span>
          <span className="h-3 rounded-full bg-labbaik-page overflow-hidden">
            <span className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${stats.total ? (stage.value / stats.total) * 100 : 0}%` }} />
          </span>
          <span className="text-left tabular-nums whitespace-nowrap"><b className="text-neutral-900 dark:text-white">{num(stage.value)}</b>{stage.note && <span className="text-xs text-labbaik-text-muted"> · {stage.note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function AudienceChips({ audience, compact = false }: { audience: CampaignAudience; compact?: boolean }) {
  const { labels } = audience;
  const chip = (item: Label, kind: 'category' | 'tag', exclude = false) => (
    <span key={`${kind}-${item.id}-${exclude}`} className={`inline-flex items-center gap-1 h-6 px-2 border text-[11px] font-bold ${kind === 'category' ? 'rounded-md' : 'rounded-full'} ${exclude ? 'border-red-500/40 text-red-800 dark:text-red-200 line-through' : 'border-labbaik-border text-neutral-800 dark:text-neutral-100'}`}>
      <span className={`h-2 w-2 ${kind === 'category' ? 'rounded-sm' : 'rounded-full'}`} style={{ backgroundColor: item.color }} />
      {kind === 'tag' && '#'}{item.name}
    </span>
  );
  const branches = labels.branches.map((b) => b.name);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] font-bold text-labbaik-text-muted">{compact && branches.length > 2 ? `${branches.length} فروع` : branches.join('، ')}</span>
      {audience.mode === 'all' && <span className="text-[11px] text-labbaik-text-muted">· كل العملاء</span>}
      {audience.mode === 'manual' && <span className="text-[11px] text-labbaik-text-muted">· {audience.test ? 'أرقام تجربة' : 'اختيار يدوي'} ({num(audience.manualCount || 0)})</span>}
      {labels.categories.map((c) => chip(c, 'category'))}
      {labels.tags.length > 1 && <span className="text-[11px] text-labbaik-text-muted">{audience.tagMatch === 'all' ? 'كلها:' : 'أيٌّ من:'}</span>}
      {labels.tags.map((t) => chip(t, 'tag'))}
      {labels.excludeCategories.map((c) => chip(c, 'category', true))}
      {labels.excludeTags.map((t) => chip(t, 'tag', true))}
    </div>
  );
}

export type ActivityPoint = { key: string; label: string; sent: number; read: number; replied: number };

const SERIES = [
  { key: 'sent', label: 'أُرسلت', color: 'var(--viz-1)' },
  { key: 'read', label: 'قُرئت', color: 'var(--viz-2)' },
  { key: 'replied', label: 'ردّوا', color: 'var(--viz-3)' },
] as const;

/** Sent / read / replied over time, with a crosshair tooltip and a table view. */
export function ActivityChart({ points, bucketLabel }: { points: ActivityPoint[]; bucketLabel: string }) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-4 text-xs text-neutral-700 dark:text-neutral-200">
          {SERIES.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />{s.label}</li>)}
        </ul>
        <button type="button" onClick={() => setTable(!table)} aria-pressed={table} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer">
          <Table2 size={14} /> {table ? 'عرض كرسم' : 'عرض كجدول'}
        </button>
      </div>
      {table ? (
        <div className="mt-2 max-h-72 overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-labbaik-surface text-xs text-labbaik-text-muted">
              <tr className="border-b border-labbaik-border"><th className="text-right font-bold py-2">{bucketLabel}</th>{SERIES.map((s) => <th key={s.key} className="text-right font-bold">{s.label}</th>)}</tr>
            </thead>
            <tbody>
              {points.filter((p) => p.sent || p.read || p.replied).map((p) => (
                <tr key={p.key} className="border-b border-labbaik-border last:border-b-0">
                  <td className="py-2 tabular-nums text-labbaik-text-muted">{p.label}</td>
                  {SERIES.map((s) => <td key={s.key} className="tabular-nums text-neutral-900 dark:text-white">{num(p[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz h-64 mt-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="label" reversed tick={{ fill: 'var(--viz-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--viz-grid)' }} interval="preserveStartEnd" minTickGap={28} />
              <YAxis orientation="right" allowDecimals={false} width={40} tick={{ fill: 'var(--viz-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ActivityTooltip />} cursor={{ stroke: 'var(--viz-muted)', strokeWidth: 1 }} />
              {SERIES.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-labbaik-surface)' }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ActivityTooltip({ active, payload }: { active?: boolean; payload?: { payload: ActivityPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-labbaik-border bg-labbaik-surface px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgba(15,10,30,0.3)]">
      <p className="font-bold text-neutral-900 dark:text-white tabular-nums">{p.label}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />{s.label} <b className="tabular-nums">{num(p[s.key])}</b>
        </p>
      ))}
    </div>
  );
}
