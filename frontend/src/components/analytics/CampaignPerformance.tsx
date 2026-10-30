import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FileDown, Loader2, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { ActivityChart, CampaignStatusBadge, type ActivityPoint, type CampaignStats, type CampaignStatus } from '../whatsapp/campaignShared';
import { dateTime, num, pct } from '../whatsapp/campaignFormat';
import { CATEGORY_LABELS } from '../whatsapp/templateUtils';
import CampaignReportDialog from './CampaignReportDialog';

type TemplateRow = {
  key: string; templateId: string | null; templateName: string; templateLanguage: string; templateCategory: string | null;
  campaigns: number; lastSentAt: string; stats: CampaignStats;
};

type Report = {
  period: { days: number; from: string; to: string };
  totals: CampaignStats & { campaigns: number };
  templates: TemplateRow[];
  daily: { key: string; kind: 'sent' | 'read' | 'replied'; day: string; count: number }[];
  campaigns: { id: string; name: string; status: CampaignStatus; createdAt: string; key: string; templateName: string; stats: CampaignStats }[];
};

const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** WhatsApp campaign results per template: how many were reached, read, and answered. */
export default function CampaignPerformance({ days, storeId }: { days: number; storeId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [exporting, setExporting] = useState(false);

  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const { data } = await api.get<Report>('/integrations/meta/whatsapp/campaigns/report', { params: { days, storeId: storeId || undefined, tz: -new Date().getTimezoneOffset() } });
      if (id !== request.current) return;
      setReport(data);
      setFailed(false);
      setSelectedKey((current) => (data.templates.some((t) => t.key === current) ? current : data.templates[0]?.key || ''));
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [days, storeId]);

  useEffect(() => { void load(); }, [load]);

  const selected = report?.templates.find((t) => t.key === selectedKey);
  const series = useMemo<ActivityPoint[]>(() => {
    if (!report || !selectedKey) return [];
    const points: ActivityPoint[] = [];
    const byDay = new Map<string, ActivityPoint>();
    for (let i = report.period.days - 1; i >= 0; i -= 1) {
      const date = new Date(new Date(report.period.to).getTime() - i * 24 * 3600 * 1000);
      const key = localDay(date);
      const point = { key, label: `${date.getDate()}/${date.getMonth() + 1}`, sent: 0, read: 0, replied: 0 };
      byDay.set(key, point);
      points.push(point);
    }
    for (const row of report.daily) {
      if (row.key !== selectedKey) continue;
      const point = byDay.get(row.day);
      if (point) point[row.kind] += row.count;
    }
    return points;
  }, [report, selectedKey]);

  const header = (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-black text-neutral-900 dark:text-white">أداء حملات واتساب</h2>
        <p className="text-xs text-labbaik-text-muted">لكل قالب: كم وصل، وكم قُرئ، وكم تفاعل الجمهور معه، للحملات المرسلة في آخر {days} يوم.</p>
      </div>
      <button type="button" onClick={() => setExporting(true)}
        className="inline-flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue cursor-pointer">
        <FileDown size={15} /> تصدير PDF
      </button>
      {exporting && <CampaignReportDialog days={days} onClose={() => setExporting(false)} />}
    </div>
  );

  if (!report) {
    return (
      <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
        {header}
        <div className="py-12 grid place-items-center">{failed ? <p className="text-sm text-labbaik-text-muted">تعذر تحميل أداء الحملات.</p> : <Loader2 size={22} className="animate-spin text-labbaik-blue" />}</div>
      </section>
    );
  }

  const { totals } = report;
  return (
    <section className={`rounded-xl border border-labbaik-border bg-labbaik-surface p-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      {header}
      {!report.templates.length ? (
        <div className="py-10 text-center">
          <Megaphone size={28} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
          <p className="mt-2 text-sm text-labbaik-text-muted">لا توجد حملات في هذه الفترة.</p>
          <Link to="/dashboard/whatsapp-templates" className="mt-2 inline-block text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:underline">إنشاء حملة</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Kpi label="حملات" value={num(totals.campaigns)} />
            <Kpi label="رسائل قبلها واتساب" value={num(totals.accepted)} note={`من ${num(totals.total)} مستهدف`} />
            <Kpi label="نسبة الوصول" value={pct(totals.delivered, totals.accepted)} />
            <Kpi label="نسبة القراءة" value={pct(totals.read, totals.delivered)} />
            <Kpi label="نسبة التفاعل" value={pct(totals.replied, totals.read)} note={`من القارئين · ${num(totals.clicked)} ضغطة زر`} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-labbaik-text-muted">
                <tr className="border-b border-labbaik-border">
                  <th className="text-right font-bold py-2">القالب</th>
                  <th className="text-right font-bold">حملات</th>
                  <th className="text-right font-bold">مُرسلة</th>
                  <th className="text-right font-bold">وصلت</th>
                  <th className="text-right font-bold">قُرئت</th>
                  <th className="text-right font-bold" title="نسبة من قرأوا الرسالة ثم تفاعلوا">تفاعل <span className="font-medium">(من القارئين)</span></th>
                  <th className="text-right font-bold">ضغط زر</th>
                  <th className="text-right font-bold">فشل</th>
                  <th className="text-right font-bold">آخر حملة</th>
                </tr>
              </thead>
              <tbody>
                {report.templates.map((t) => {
                  const on = t.key === selectedKey;
                  return (
                    <tr key={t.key} onClick={() => setSelectedKey(t.key)}
                      className={`border-b border-labbaik-border last:border-b-0 cursor-pointer transition-colors ${on ? 'bg-labbaik-blue/8' : 'hover:bg-labbaik-page'}`}>
                      <td className="py-2.5">
                        <button type="button" onClick={() => setSelectedKey(t.key)} aria-pressed={on} className="text-right cursor-pointer">
                          <span dir="ltr" className={`block font-bold ${on ? 'text-labbaik-blue dark:text-purple-300' : 'text-neutral-900 dark:text-white'}`}>{t.templateName}</span>
                          <span className="block text-[11px] text-labbaik-text-muted">{t.templateLanguage} · {CATEGORY_LABELS[String(t.templateCategory).toUpperCase()] || t.templateCategory}</span>
                        </button>
                      </td>
                      <td className="tabular-nums">{num(t.campaigns)}</td>
                      <td className="tabular-nums font-bold text-neutral-900 dark:text-white">{num(t.stats.accepted)}</td>
                      <td className="tabular-nums">{pct(t.stats.delivered, t.stats.accepted)}</td>
                      <td className="tabular-nums">{pct(t.stats.read, t.stats.delivered)}</td>
                      <td className="tabular-nums">{pct(t.stats.replied, t.stats.read)} <span className="text-xs text-labbaik-text-muted">({num(t.stats.replied)})</span></td>
                      <td className="tabular-nums">{num(t.stats.clicked)}</td>
                      <td className="tabular-nums">{num(t.stats.failed)}</td>
                      <td className="text-xs text-labbaik-text-muted whitespace-nowrap">{dateTime(t.lastSentAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 pt-3 border-t border-labbaik-border">
              <div className="min-w-0">
                <p className="mb-2 text-sm font-black text-neutral-900 dark:text-white">حركة القالب <span dir="ltr">{selected.templateName}</span> يوميًا</p>
                <ActivityChart points={series} bucketLabel="اليوم" />
              </div>
              <div>
                <p className="mb-2 text-sm font-black text-neutral-900 dark:text-white">حملاته في الفترة</p>
                <ul className="max-h-72 overflow-y-auto custom-scrollbar divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
                  {report.campaigns.filter((c) => c.key === selectedKey).map((c) => (
                    <li key={c.id}>
                      <Link to={`/dashboard/whatsapp-campaigns/${c.id}`} className="group flex items-center gap-2 px-3 py-2 hover:bg-labbaik-page">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-neutral-900 dark:text-white truncate group-hover:text-labbaik-blue">{c.name}</span>
                          <span className="block text-[11px] text-labbaik-text-muted tabular-nums">
                            {dateTime(c.createdAt)} · {num(c.stats.total)} · قراءة {pct(c.stats.read, c.stats.delivered)} · تفاعل {pct(c.stats.replied, c.stats.read)}
                          </span>
                        </span>
                        <CampaignStatusBadge status={c.status} />
                        <ChevronLeft size={14} className="text-labbaik-text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-labbaik-page px-3 py-2.5">
      <p className="text-[11px] font-bold text-labbaik-text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900 dark:text-white">{value}</p>
      {note && <p className="text-[11px] text-labbaik-text-muted">{note}</p>}
    </div>
  );
}
