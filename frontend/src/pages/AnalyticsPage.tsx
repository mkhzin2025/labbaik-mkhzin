import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowDown, ArrowUp, Clock, Frown, Info, Loader2, Meh, Smile, Table2 } from 'lucide-react';
import { FaFacebook, FaInstagram, FaMapMarkerAlt, FaWhatsapp } from 'react-icons/fa';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { toEnglishDigits } from '@/lib/utils';
import type { Branch } from '../components/customers/BranchSelector';

interface Analytics {
  period: { days: number; from: string; to: string };
  totals: { activeConversations: number; newConversations: number; incoming: number; autoReplies: number; teamReplies: number; unclassifiedReplies: number; waitingNow: number };
  previous: { activeConversations: number; incoming: number };
  responseTime: { medianSeconds: number | null; within5MinShare: number | null; samples: number };
  daily: { date: string; incoming: number; auto: number; team: number }[];
  hourly: number[][];
  platforms: { platform: string; conversations: number }[];
  sentiment: { positive: number; neutral: number; negative: number };
  manualTrackingSince: string | null;
}

const PERIODS = [7, 30, 90] as const;
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// Sequential blue ramp (validated reference palette), light → dark = few → many.
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const PLATFORMS: Record<string, { name: string; icon: ReactNode }> = {
  whatsapp: { name: 'واتساب', icon: <FaWhatsapp className="text-[#25d366]" /> },
  instagram: { name: 'إنستغرام', icon: <FaInstagram className="text-[#e1306c]" /> },
  facebook: { name: 'فيسبوك', icon: <FaFacebook className="text-[#1877f2]" /> },
  google_maps: { name: 'جوجل ماب', icon: <FaMapMarkerAlt className="text-[#ea4335]" /> },
};

const num = (value: number) => toEnglishDigits(value.toLocaleString('en-US'));
const pct = (value: number) => `${Math.round(value * 100)}%`;
const shortDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h} س ${m} د` : `${h} س`;
}

function delta(current: number, previous: number) {
  if (!previous) return null;
  return (current - previous) / previous;
}

export default function AnalyticsPage() {
  const { showToast } = useToast();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    api.get('/stores').then(({ data: rows }) => setBranches(rows || [])).catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get<Analytics>('/conversations/analytics', {
        params: { days, tz: -new Date().getTimezoneOffset(), storeId: storeId || undefined },
      });
      setData(result);
    } catch (error) {
      showToast((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذر تحميل التقارير.', 'error');
    } finally {
      setLoading(false);
    }
  }, [days, storeId, showToast]);

  useEffect(() => { void load(); }, [load]);

  const replies = data ? data.totals.autoReplies + data.totals.teamReplies + data.totals.unclassifiedReplies : 0;
  const chartData = useMemo(
    () => (data?.daily || []).map((d) => ({ ...d, label: shortDate(d.date), replies: d.auto + d.team })),
    [data],
  );

  return (
    <div className="max-w-6xl space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">التقارير</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">حجم المحادثات، وسرعة الرد، وأوقات الذروة، محسوبة من الرسائل الفعلية.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 1 && (
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label="الفرع"
              className="h-9 rounded-lg border border-labbaik-border bg-labbaik-surface px-3 text-sm font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg border border-labbaik-border bg-labbaik-surface p-0.5" role="radiogroup" aria-label="الفترة">
            {PERIODS.map((p) => (
              <button
                type="button"
                role="radio"
                aria-checked={days === p}
                key={p}
                onClick={() => setDays(p)}
                className={`h-8 px-3 rounded-md text-sm font-bold transition-colors cursor-pointer ${days === p ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
              >
                آخر {p} يوم
              </button>
            ))}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="rounded-xl border border-labbaik-border bg-labbaik-surface py-20 grid place-items-center"><Loader2 size={24} className="animate-spin text-labbaik-blue" /></div>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="محادثات نشطة" value={num(data.totals.activeConversations)} change={delta(data.totals.activeConversations, data.previous.activeConversations)} note={`${num(data.totals.newConversations)} جديدة`} />
            <StatTile label="رسائل العملاء" value={num(data.totals.incoming)} change={delta(data.totals.incoming, data.previous.incoming)} note={`${num(replies)} رد`} />
            <StatTile
              label="وسيط زمن الرد"
              value={formatDuration(data.responseTime.medianSeconds)}
              note={data.responseTime.within5MinShare !== null ? `${pct(data.responseTime.within5MinShare)} خلال 5 دقائق` : 'لا توجد ردود في الفترة'}
            />
            <StatTile
              label="بانتظار الرد الآن"
              value={num(data.totals.waitingNow)}
              tone={data.totals.waitingNow > 0 ? 'warn' : undefined}
              note={data.totals.waitingNow > 0 ? 'آخر رسالة فيها من العميل' : 'لا أحد ينتظر'}
              href={data.totals.waitingNow > 0 ? '/dashboard/conversations' : undefined}
            />
          </div>

          {/* Volume over time */}
          <Panel
            title="الرسائل يوميًا"
            subtitle="رسائل العملاء مقابل الردود عليها"
            aside={(
              <button type="button" onClick={() => setShowTable(!showTable)} aria-pressed={showTable} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer">
                <Table2 size={14} /> {showTable ? 'عرض كرسم' : 'عرض كجدول'}
              </button>
            )}
          >
            {data.totals.incoming + replies === 0 ? (
              <EmptyChart text={`لا توجد رسائل في آخر ${days} يوم.`} />
            ) : showTable ? (
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-labbaik-surface text-xs text-labbaik-text-muted">
                    <tr className="border-b border-labbaik-border"><th className="text-right font-bold py-2">اليوم</th><th className="text-right font-bold">رسائل العملاء</th><th className="text-right font-bold">الردود</th></tr>
                  </thead>
                  <tbody>
                    {chartData.slice().reverse().map((d) => (
                      <tr key={d.date} className="border-b border-labbaik-border last:border-b-0">
                        <td className="py-2 tabular-nums text-labbaik-text-muted">{d.date}</td>
                        <td className="tabular-nums text-neutral-900 dark:text-white">{num(d.incoming)}</td>
                        <td className="tabular-nums text-neutral-900 dark:text-white">{num(d.replies)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <Legend items={[{ label: 'رسائل العملاء', color: 'var(--viz-1)' }, { label: 'الردود', color: 'var(--viz-2)' }]} />
                <div className="viz h-72 mt-2" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                      <XAxis dataKey="label" reversed tick={{ fill: 'var(--viz-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--viz-grid)' }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis orientation="right" allowDecimals={false} width={36} tick={{ fill: 'var(--viz-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<DailyTooltip />} cursor={{ stroke: 'var(--viz-muted)', strokeWidth: 1 }} />
                      <Line type="monotone" dataKey="incoming" name="رسائل العملاء" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-labbaik-surface)' }} />
                      <Line type="monotone" dataKey="replies" name="الردود" stroke="var(--viz-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-labbaik-surface)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            {/* Busiest hours */}
            <Panel title="أوقات الذروة" subtitle="رسائل العملاء حسب اليوم والساعة (بتوقيتك المحلي)">
              {data.totals.incoming === 0 ? <EmptyChart text="لا توجد رسائل لعرض أوقات الذروة." /> : <Heatmap hourly={data.hourly} />}
            </Panel>

            <div className="space-y-4">
              {/* Who replied */}
              <Panel title="من يرد؟">
                {replies === 0 ? <p className="text-sm text-labbaik-text-muted">لا توجد ردود في الفترة.</p> : (
                  <>
                    <SplitBar
                      parts={[
                        { label: 'الرد الآلي', value: data.totals.autoReplies, color: 'var(--viz-2)' },
                        { label: 'الفريق', value: data.totals.teamReplies, color: 'var(--viz-1)' },
                        { label: 'غير مصنّفة', value: data.totals.unclassifiedReplies, color: 'var(--viz-neutral)' },
                      ]}
                    />
                    {data.totals.unclassifiedReplies > 0 && (
                      <p className="mt-3 flex items-start gap-1.5 text-xs text-labbaik-text-muted leading-relaxed">
                        <Info size={13} className="mt-0.5 shrink-0" />
                        الردود الأقدم من تحديث التتبع لا يُعرف إن كانت آلية أو من الفريق، فتظهر «غير مصنّفة».
                      </p>
                    )}
                  </>
                )}
              </Panel>

              {/* Customer mood */}
              <Panel title="انطباع العملاء" subtitle="حسب آخر رسالة في كل محادثة نشطة">
                {data.totals.activeConversations === 0 ? <p className="text-sm text-labbaik-text-muted">لا توجد محادثات نشطة.</p> : (
                  <ul className="space-y-2">
                    {([
                      { key: 'positive', label: 'راضٍ', icon: <Smile size={16} />, color: '#0ca30c', text: 'text-emerald-700 dark:text-emerald-400' },
                      { key: 'neutral', label: 'محايد', icon: <Meh size={16} />, color: 'var(--viz-neutral)', text: 'text-labbaik-text-muted' },
                      { key: 'negative', label: 'منزعج', icon: <Frown size={16} />, color: '#d03b3b', text: 'text-red-700 dark:text-red-400' },
                    ] as const).map((row) => {
                      const value = data.sentiment[row.key];
                      const share = value / data.totals.activeConversations;
                      return (
                        <li key={row.key} className="flex items-center gap-2 text-sm">
                          <span className={`flex items-center gap-1.5 w-20 shrink-0 font-bold ${row.text}`}>{row.icon}{row.label}</span>
                          <span className="flex-1 h-2 rounded-full bg-labbaik-page overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: row.color }} /></span>
                          <span className="w-16 shrink-0 text-left tabular-nums text-neutral-800 dark:text-neutral-100">{num(value)} <span className="text-labbaik-text-muted">· {pct(share)}</span></span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              {/* Channels */}
              <Panel title="القنوات" subtitle="المحادثات النشطة حسب القناة">
                {data.platforms.length === 0 ? <p className="text-sm text-labbaik-text-muted">لا توجد محادثات نشطة.</p> : (
                  <ul className="space-y-2">
                    {data.platforms.map((p) => {
                      const info = PLATFORMS[p.platform] || { name: p.platform, icon: null };
                      const share = p.conversations / data.totals.activeConversations;
                      return (
                        <li key={p.platform} className="flex items-center gap-2 text-sm">
                          <span className="flex items-center gap-1.5 w-24 shrink-0 font-bold text-neutral-800 dark:text-neutral-100">{info.icon}{info.name}</span>
                          <span className="flex-1 h-2 rounded-full bg-labbaik-page overflow-hidden"><span className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${share * 100}%` }} /></span>
                          <span className="w-16 shrink-0 text-left tabular-nums text-neutral-800 dark:text-neutral-100">{num(p.conversations)} <span className="text-labbaik-text-muted">· {pct(share)}</span></span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-black text-neutral-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-labbaik-text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, note, change, tone, href }: { label: string; value: string; note?: string; change?: number | null; tone?: 'warn'; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-bold text-labbaik-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-900 dark:text-white'}`}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-labbaik-text-muted">
        {change !== undefined && change !== null && (
          <span className="inline-flex items-center gap-0.5 font-bold text-neutral-700 dark:text-neutral-200" title="مقارنة بالفترة السابقة">
            {change >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{pct(Math.abs(change))}
          </span>
        )}
        {note && <span>{note}</span>}
      </div>
    </>
  );
  const cls = 'block rounded-xl border border-labbaik-border bg-labbaik-surface p-4';
  return href ? <a href={href} className={`${cls} hover:border-labbaik-blue/40 transition-colors`}>{body}</a> : <div className={cls}>{body}</div>;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-xs text-neutral-700 dark:text-neutral-200">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</li>
      ))}
    </ul>
  );
}

function DailyTooltip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; incoming: number; replies: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-labbaik-border bg-labbaik-surface px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgba(15,10,30,0.3)]">
      <p className="font-bold text-neutral-900 dark:text-white tabular-nums">{d.date}</p>
      <p className="mt-1 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200"><span className="h-0.5 w-3 rounded-full bg-[var(--viz-1)]" />رسائل العملاء <b className="tabular-nums">{num(d.incoming)}</b></p>
      <p className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200"><span className="h-0.5 w-3 rounded-full bg-[var(--viz-2)]" />الردود <b className="tabular-nums">{num(d.replies)}</b></p>
    </div>
  );
}

function Heatmap({ hourly }: { hourly: number[][] }) {
  const max = Math.max(1, ...hourly.flat());
  const step = (v: number) => (v === 0 ? null : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1) + 0.0001))]);
  // Find the single busiest slot to call out in words.
  let peak = { day: 0, hour: 0, value: 0 };
  hourly.forEach((row, day) => row.forEach((value, hour) => { if (value > peak.value) peak = { day, hour, value }; }));
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'ص' : 'م'}`;

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-800 dark:text-neutral-100">
        الذروة يوم <b>{WEEKDAYS[peak.day]}</b> الساعة <b className="tabular-nums">{hourLabel(peak.hour)}</b> ({num(peak.value)} رسالة).
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: '64px repeat(24, minmax(0, 1fr))' }} role="table" aria-label="رسائل العملاء حسب اليوم والساعة">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[11px] text-labbaik-text-muted tabular-nums">{h % 3 === 0 ? hourLabel(h) : ''}</span>
            ))}
            {hourly.map((row, day) => (
              <div key={day} className="contents" role="row">
                <span className="text-xs text-labbaik-text-muted self-center" role="rowheader">{WEEKDAYS[day]}</span>
                {row.map((value, hour) => (
                  <span
                    key={hour}
                    role="cell"
                    title={`${WEEKDAYS[day]} ${hourLabel(hour)}: ${value} رسالة`}
                    aria-label={`${WEEKDAYS[day]} ${hourLabel(hour)}: ${value} رسالة`}
                    className="h-6 rounded-[3px] bg-labbaik-page"
                    style={step(value) ? { backgroundColor: step(value)! } : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-labbaik-text-muted">
        <span>أقل</span>
        <span className="flex gap-[2px]">{RAMP.map((c) => <span key={c} className="h-3 w-5 rounded-[2px]" style={{ backgroundColor: c }} />)}</span>
        <span>أكثر</span>
      </div>
    </div>
  );
}

function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0) || 1;
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={visible.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join('، ')}>
        {visible.map((p) => <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />)}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-neutral-800 dark:text-neutral-100"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />{p.label}</span>
            <span className="tabular-nums text-neutral-900 dark:text-white font-bold">{num(p.value)} <span className="font-normal text-labbaik-text-muted">· {pct(p.value / total)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="py-12 text-center">
      <AlertCircle size={28} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
      <p className="mt-2 text-sm text-labbaik-text-muted">{text}</p>
      <p className="mt-1 text-xs text-labbaik-text-muted"><Clock size={11} className="inline" /> جرّب فترة أطول.</p>
    </div>
  );
}
