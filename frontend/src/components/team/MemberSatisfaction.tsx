import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Smile } from 'lucide-react';
import { RATING_LABELS, type MemberActivity, type Rating } from '../../lib/team';

/** Same colors as the home page satisfaction chart. */
const COLORS: Record<Rating, string> = { positive: '#22c55e', neutral: '#94a3b8', negative: '#ef4444' };
const ORDER: Rating[] = ['positive', 'neutral', 'negative'];

const tooltipStyle = {
  backgroundColor: 'var(--color-labbaik-surface)',
  borderRadius: '0.75rem',
  border: '1px solid var(--color-labbaik-border)',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-neutral-0)',
};

/**
 * The member's customer satisfaction for the period: a donut (as on the home page) with the satisfied share in the
 * middle and a row per rating, plus the ratings day by day when the period spans several days.
 */
export default function MemberSatisfaction({ activity }: { activity: MemberActivity }) {
  const t = activity.totals;
  const share = (n: number) => (t.rated ? Math.round((n / t.rated) * 100) : 0);
  const slices = ORDER.map((key) => ({ key, name: RATING_LABELS[key].label, value: t[key] })).filter((s) => s.value > 0);
  const days = activity.daily.map((d) => ({ date: d.date.slice(5).split('-').reverse().join('/'), positive: d.positive, neutral: d.neutral, negative: d.negative }));
  const showTrend = days.length > 1 && t.rated > 0;

  return (
    <section className="rounded-xl border border-labbaik-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white">
        <Smile size={17} className="text-success-500" /> رضا العملاء
      </h3>
      {!t.rated ? (
        <p className="py-6 text-center text-sm text-labbaik-text-muted">لا توجد تقييمات له في هذه الفترة.</p>
      ) : (
        <div className={`grid gap-5 ${showTrend ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]' : ''}`}>
          <div className="flex items-center gap-4">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={slices.length > 1 ? 5 : 0} stroke="none" isAnimationActive={false}>
                    {slices.map((s) => <Cell key={s.key} fill={COLORS[s.key]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{share(t.positive)}%</span>
                <span className="text-[11px] font-bold text-labbaik-text-muted">راضون</span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2.5">
              {ORDER.map((key) => (
                <li key={key}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-200">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[key] }} />
                      {RATING_LABELS[key].emoji} {RATING_LABELS[key].label}
                    </span>
                    <span className="tabular-nums font-black text-neutral-900 dark:text-white">{t[key].toLocaleString('en')} <span className="text-xs font-bold text-labbaik-text-muted">· {share(t[key])}%</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-labbaik-page">
                    <div className="h-full rounded-full" style={{ width: `${share(t[key])}%`, backgroundColor: COLORS[key] }} />
                  </div>
                </li>
              ))}
              <li className="pt-0.5 text-xs text-labbaik-text-muted tabular-nums">{t.rated.toLocaleString('en')} تقييم من العملاء بعد إغلاق محادثاتهم</li>
            </ul>
          </div>

          {showTrend && (
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold text-labbaik-text-muted">التقييمات يومًا بيوم</p>
              <div className="h-40" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="date" reversed stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(100,59,137,0.05)' }} />
                    {ORDER.map((key, i) => (
                      <Bar key={key} dataKey={key} name={RATING_LABELS[key].label} stackId="ratings" fill={COLORS[key]} radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
