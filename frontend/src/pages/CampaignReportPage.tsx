import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { FileDown, Loader2 } from 'lucide-react';
import api from '../api/client';
import type { CampaignDetails, CampaignStats, CampaignStatus } from '../components/whatsapp/campaignShared';
import { dateTime, num, pct } from '../components/whatsapp/campaignFormat';

/**
 * Printable WhatsApp campaigns report: a summary of every chosen campaign, then one page per campaign.
 * Saved as PDF through the browser's print dialog, which keeps Arabic text sharp, shaped and selectable.
 */

const BRAND = '#643B89';
const SERIES = [
  { key: 'sent', label: 'أُرسلت', color: '#2a78d6' },
  { key: 'read', label: 'قُرئت', color: '#eb6834' },
  { key: 'replied', label: 'تفاعلوا', color: '#1baf7a' },
] as const;
const STATUS_LABEL: Record<CampaignStatus, string> = {
  scheduled: 'مجدولة', queued: 'بانتظار الإرسال', sending: 'جارٍ الإرسال', completed: 'اكتملت', cancelled: 'أُلغيت', failed: 'توقفت',
};
const EMPTY: CampaignStats = { total: 0, pending: 0, accepted: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, skipped: 0 };

/** Meta's delivery errors in plain Arabic; variants of the same error (trace ids, codes) fold into one reason. */
const ERROR_REASONS: { match: RegExp; label: string }[] = [
  { match: /healthy ecosystem|131049/i, label: 'حدّ Meta لعدد الرسائل التسويقية التي يستقبلها الشخص' },
  { match: /undeliverable|131026/i, label: 'تعذّر التسليم (الرقم غير مسجّل في واتساب أو غير متاح)' },
  { match: /experiment|130472/i, label: 'الرقم ضمن تجربة Meta لتقليل الرسائل التسويقية' },
  { match: /stop receiving marketing|131050/i, label: 'العميل أوقف استقبال الرسائل التسويقية' },
  { match: /payment|unsettled|131042/i, label: 'مستحقات حساب واتساب غير مسدّدة' },
  { match: /re-engagement|24 hours|131047/i, label: 'انتهت نافذة الـ24 ساعة' },
  { match: /something went wrong|131000/i, label: 'خطأ عام من Meta' },
];
const reasonOf = (error: string) => ERROR_REASONS.find((r) => r.match.test(error))?.label || (error.trim() || 'سبب غير محدد');

const groupErrors = (errors: { error: string; count: number }[]) => {
  const map = new Map<string, number>();
  for (const e of errors) map.set(reasonOf(e.error), (map.get(reasonOf(e.error)) || 0) + e.count);
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
};

const sumStats = (list: CampaignStats[]) => list.reduce<CampaignStats>((acc, s) => {
  for (const key of Object.keys(acc) as (keyof CampaignStats)[]) acc[key] += s[key] || 0;
  return acc;
}, { ...EMPTY });

const longDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
};
const branchesOf = (c: CampaignDetails) => c.audience?.labels?.branches?.map((b) => b.name).join('، ') || '—';

export default function CampaignReportPage() {
  const [params] = useSearchParams();
  const ids = useMemo(() => (params.get('ids') || '').split(',').filter(Boolean), [params]);
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const [campaigns, setCampaigns] = useState<CampaignDetails[] | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const printed = useRef(false);

  // The report is always light, whatever theme the dashboard uses; the saved theme is left untouched.
  useEffect(() => {
    const root = document.documentElement;
    const timer = setTimeout(() => { root.classList.remove('dark'); root.dataset.theme = 'light'; }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.title = `تقرير حملات واتساب ${from} - ${to}`;
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    const queue = [...ids];
    const results: CampaignDetails[] = [];
    let failed = 0;
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const { data } = await api.get<CampaignDetails>(`/integrations/meta/whatsapp/campaigns/${id}`);
          results.push(data);
        } catch {
          failed += 1;
        }
        if (!cancelled) setLoaded((n) => n + 1);
      }
    };
    Promise.all(Array.from({ length: 4 }, worker)).then(() => {
      if (cancelled) return;
      setFailedCount(failed);
      setCampaigns(results.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    });
    return () => { cancelled = true; };
  }, [ids]);

  // Open the save-as-PDF dialog once, after the fonts and charts have rendered.
  useEffect(() => {
    if (!campaigns?.length || printed.current) return;
    printed.current = true;
    let timer: ReturnType<typeof setTimeout>;
    void document.fonts.ready.then(() => { timer = setTimeout(() => window.print(), 700); });
    return () => clearTimeout(timer);
  }, [campaigns]);

  if (!ids.length) return <Centered>لم تُحدَّد أي حملة. ارجع لصفحة التحليلات واختر الحملات.</Centered>;
  if (!campaigns) {
    return (
      <Centered>
        <Loader2 size={26} className="animate-spin" style={{ color: BRAND }} />
        <p className="mt-3">جارٍ تجهيز التقرير… <span className="tabular-nums">{num(loaded)} / {num(ids.length)}</span></p>
      </Centered>
    );
  }
  if (!campaigns.length) return <Centered>تعذر تحميل الحملات المختارة.</Centered>;

  const totals = sumStats(campaigns.map((c) => c.stats));
  const generatedAt = dateTime(new Date().toISOString());

  return (
    <div dir="rtl" className="report-root min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0 text-[#1c1527]">
      <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex w-[210mm] items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow">
        <p className="text-sm text-neutral-600">
          {failedCount ? <span className="font-bold text-red-700">تعذر تحميل {num(failedCount)} حملة. </span> : null}
          في نافذة الطباعة اختر <b>«حفظ كملف PDF»</b> كوجهة.
        </p>
        <button type="button" onClick={() => window.print()} className="inline-flex shrink-0 items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-bold text-white cursor-pointer" style={{ backgroundColor: BRAND }}>
          <FileDown size={16} /> حفظ PDF
        </button>
      </div>

      <Sheet>
        <ReportHeader title="تقرير حملات واتساب" subtitle={`ملخص ${num(campaigns.length)} حملة · من ${longDate(from)} إلى ${longDate(to)}`} meta={`أُنشئ في ${generatedAt}`} />
        <Summary campaigns={campaigns} totals={totals} />
      </Sheet>

      {campaigns.map((c, index) => (
        <Sheet key={c.id}>
          <ReportHeader title={c.name} subtitle={`الحملة ${num(index + 1)} من ${num(campaigns.length)} · ${STATUS_LABEL[c.status] || c.status}`} meta={`تقرير حملات واتساب · ${longDate(from)} – ${longDate(to)}`} />
          <CampaignDetail campaign={c} />
        </Sheet>
      ))}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div dir="rtl" className="min-h-screen grid place-items-center bg-neutral-100 p-6 text-center text-sm font-bold text-neutral-600"><div className="grid place-items-center">{children}</div></div>;
}

/** One A4 page on screen; in print each sheet starts on a new page and may run over several. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <section className="sheet mx-auto mb-6 w-[210mm] min-h-[297mm] bg-white px-[12mm] py-[12mm] shadow-lg print:m-0 print:min-h-0 print:w-auto print:p-0 print:shadow-none">
      {children}
    </section>
  );
}

function ReportHeader({ title, subtitle, meta }: { title: string; subtitle: string; meta: string }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 border-b-2 pb-4" style={{ borderColor: BRAND }}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide" style={{ color: BRAND }}>{meta}</p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-[#1c1527]">{title}</h1>
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      </div>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: BRAND }} aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>
      </div>
    </header>
  );
}

function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-2.5 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-black text-[#1c1527]">{children}</h2>
      {note && <p className="text-[11px] text-neutral-500">{note}</p>}
    </div>
  );
}

function Kpis({ items }: { items: { label: string; value: string; note?: string; strong?: boolean }[] }) {
  return (
    <div className="grid grid-cols-4 gap-2 break-inside-avoid">
      {items.map((k) => (
        <div key={k.label} className="rounded-lg border px-3 py-2.5" style={{ borderColor: k.strong ? BRAND : '#e7e1ef', backgroundColor: k.strong ? '#f4eefa' : '#faf8fc' }}>
          <p className="text-[11px] font-bold text-neutral-500">{k.label}</p>
          <p className="mt-0.5 text-xl font-black tabular-nums" style={{ color: k.strong ? BRAND : '#1c1527' }}>{k.value}</p>
          {k.note && <p className="text-[10px] text-neutral-500 tabular-nums">{k.note}</p>}
        </div>
      ))}
    </div>
  );
}

function FunnelBars({ stats }: { stats: CampaignStats }) {
  const stages = [
    { label: 'المستهدفون', value: stats.total, note: '' },
    { label: 'قبلها واتساب', value: stats.accepted, note: `${pct(stats.accepted, stats.total)} من المستهدفين` },
    { label: 'وصلت', value: stats.delivered, note: `${pct(stats.delivered, stats.accepted)} من المقبولة` },
    { label: 'قُرئت', value: stats.read, note: `${pct(stats.read, stats.delivered)} من الواصلة` },
    { label: 'تفاعلوا', value: stats.replied, note: `${pct(stats.replied, stats.read)} من القارئين` },
    { label: 'ضغطوا زرًا', value: stats.clicked, note: `${pct(stats.clicked, stats.read)} من القارئين` },
  ];
  return (
    <ul className="space-y-2 break-inside-avoid">
      {stages.map((s) => (
        <li key={s.label} className="grid grid-cols-[84px_1fr_190px] items-center gap-3 text-[13px]">
          <span className="font-bold text-[#1c1527]">{s.label}</span>
          <span className="h-3.5 overflow-hidden rounded-full bg-[#eee9f4]">
            <span className="block h-full rounded-full" style={{ width: `${stats.total ? Math.max((s.value / stats.total) * 100, s.value ? 0.6 : 0) : 0}%`, backgroundColor: BRAND }} />
          </span>
          <span className="tabular-nums"><b>{num(s.value)}</b>{s.note && <span className="text-[11px] text-neutral-500"> · {s.note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows, numericFrom = 1 }: { head: string[]; rows: ReactNode[][]; numericFrom?: number }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr style={{ backgroundColor: '#f4eefa' }}>
          {head.map((h, i) => <th key={h} className={`px-2 py-2 text-right font-bold text-[11px] ${i === 0 ? 'rounded-tr-md' : ''} ${i === head.length - 1 ? 'rounded-tl-md' : ''}`} style={{ color: BRAND }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="break-inside-avoid border-b border-[#eee9f4]">
            {row.map((cell, i) => <td key={i} className={`px-2 py-1.5 align-top ${i >= numericFrom ? 'tabular-nums' : ''}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ campaigns, totals }: { campaigns: CampaignDetails[]; totals: CampaignStats }) {
  const errors = groupErrors(campaigns.flatMap((c) => c.errors));
  const rated = campaigns.filter((c) => c.stats.read >= 100);
  const best = (score: (c: CampaignDetails) => number) => [...rated].sort((a, b) => score(b) - score(a))[0];
  const topInteraction = best((c) => c.stats.replied / c.stats.read);
  const topRead = best((c) => c.stats.read / (c.stats.delivered || 1));
  const topReach = [...campaigns].sort((a, b) => b.stats.delivered - a.stats.delivered)[0];
  const maxRate = Math.max(...campaigns.map((c) => (c.stats.read ? c.stats.replied / c.stats.read : 0)), 0.01);

  return (
    <>
      <Kpis items={[
        { label: 'الحملات', value: num(campaigns.length) },
        { label: 'المستهدفون', value: num(totals.total) },
        { label: 'قبلها واتساب', value: num(totals.accepted), note: `${pct(totals.accepted, totals.total)} من المستهدفين` },
        { label: 'وصلت', value: num(totals.delivered), note: `نسبة الوصول ${pct(totals.delivered, totals.accepted)}` },
        { label: 'قُرئت', value: num(totals.read), note: `نسبة القراءة ${pct(totals.read, totals.delivered)}` },
        { label: 'تفاعلوا', value: num(totals.replied), note: `نسبة التفاعل ${pct(totals.replied, totals.read)} من القارئين`, strong: true },
        { label: 'ضغطوا زرًا', value: num(totals.clicked), note: `${pct(totals.clicked, totals.read)} من القارئين`, strong: true },
        { label: 'لم تصل (فشل)', value: num(totals.failed), note: `${pct(totals.failed, totals.total)} من المستهدفين` },
      ]} />

      <SectionTitle note="كل مرحلة منسوبة لعدد المستهدفين">مراحل الوصول لكل الحملات</SectionTitle>
      <FunnelBars stats={totals} />

      {rated.length > 1 && (
        <>
          <SectionTitle>أبرز النتائج</SectionTitle>
          <div className="grid grid-cols-3 gap-2 break-inside-avoid">
            <Highlight label="الأعلى تفاعلًا" name={topInteraction.name} value={`${pct(topInteraction.stats.replied, topInteraction.stats.read)} من القارئين`} />
            <Highlight label="الأعلى قراءة" name={topRead.name} value={`${pct(topRead.stats.read, topRead.stats.delivered)} من الواصلة`} />
            <Highlight label="الأوسع وصولًا" name={topReach.name} value={`${num(topReach.stats.delivered)} وصلتهم`} />
          </div>
        </>
      )}

      <SectionTitle note="نسبة التفاعل محسوبة من القارئين">مقارنة الحملات</SectionTitle>
      <Table
        head={['الحملة', 'التاريخ', 'المستهدفون', 'الوصول', 'القراءة', 'تفاعلوا', 'التفاعل', 'ضغط زر', 'فشل']}
        numericFrom={2}
        rows={campaigns.map((c) => [
          <span key="n"><b className="block">{c.name}</b><span className="text-[10px] text-neutral-500">{branchesOf(c)}</span></span>,
          <span key="d" className="whitespace-nowrap text-[11px] text-neutral-600">{dateTime(c.createdAt)}</span>,
          num(c.stats.total),
          pct(c.stats.delivered, c.stats.accepted),
          pct(c.stats.read, c.stats.delivered),
          num(c.stats.replied),
          <b key="i" style={{ color: BRAND }}>{pct(c.stats.replied, c.stats.read)}</b>,
          num(c.stats.clicked),
          num(c.stats.failed),
        ]).concat([[
          <b key="t">الإجمالي</b>, '', <b key="a">{num(totals.total)}</b>, <b key="b">{pct(totals.delivered, totals.accepted)}</b>, <b key="c">{pct(totals.read, totals.delivered)}</b>,
          <b key="e">{num(totals.replied)}</b>, <b key="f" style={{ color: BRAND }}>{pct(totals.replied, totals.read)}</b>, <b key="g">{num(totals.clicked)}</b>, <b key="h">{num(totals.failed)}</b>,
        ]])}
      />

      <div className="break-inside-avoid">
        <SectionTitle note="نسبة من قرأوا الرسالة ثم تفاعلوا">التفاعل حسب الحملة</SectionTitle>
        <ul className="space-y-1.5">
          {[...campaigns].sort((a, b) => (b.stats.read ? b.stats.replied / b.stats.read : 0) - (a.stats.read ? a.stats.replied / a.stats.read : 0)).map((c) => {
            const rate = c.stats.read ? c.stats.replied / c.stats.read : 0;
            return (
              <li key={c.id} className="grid grid-cols-[170px_1fr_44px] items-center gap-3 text-[12px]">
                <span className="truncate font-bold">{c.name}</span>
                <span className="h-3 overflow-hidden rounded-full bg-[#eee9f4]"><span className="block h-full rounded-full" style={{ width: `${(rate / maxRate) * 100}%`, backgroundColor: '#1baf7a' }} /></span>
                <span className="text-left font-bold tabular-nums">{pct(c.stats.replied, c.stats.read)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {errors.length > 0 && (
        <div className="break-inside-avoid">
          <SectionTitle note={`${num(totals.failed)} رسالة لم تصل`}>أسباب عدم الوصول</SectionTitle>
          <Table head={['السبب', 'العدد', 'النسبة من الفاشلة']} rows={errors.map((e) => [e.reason, num(e.count), pct(e.count, totals.failed + totals.skipped)])} />
        </div>
      )}
    </>
  );
}

function Highlight({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e7e1ef] px-3 py-2.5">
      <p className="text-[11px] font-bold" style={{ color: BRAND }}>{label}</p>
      <p className="mt-0.5 truncate text-sm font-black">{name}</p>
      <p className="text-[11px] text-neutral-600 tabular-nums">{value}</p>
    </div>
  );
}

function CampaignDetail({ campaign: c }: { campaign: CampaignDetails }) {
  const s = c.stats;
  const errors = groupErrors(c.errors);
  const audience = c.audience?.labels;
  const tags = [...(audience?.categories || []), ...(audience?.tags || [])].map((t) => t.name);
  const excluded = [...(audience?.excludeCategories || []), ...(audience?.excludeTags || [])].map((t) => t.name);
  const message = (c.previewText || '').replace(/\*/g, '').replace(/\n*\[زر:[\s\S]*$/, '').trim();
  const buttons = (c.previewText || '').match(/\[زر: [^\]]+\]/g)?.map((b) => b.slice(5, -1).split(' -> ')[0]) || [];

  return (
    <>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-lg bg-[#faf8fc] px-4 py-3 text-[12px] break-inside-avoid">
        <Fact label="القالب"><span dir="ltr">{c.templateName}</span></Fact>
        <Fact label="الفروع">{branchesOf(c)}</Fact>
        <Fact label="أنشأها">{c.createdByName || '—'}</Fact>
        <Fact label="بدأ الإرسال">{dateTime(c.startedAt || c.createdAt)}</Fact>
        <Fact label="اكتمل الإرسال">{dateTime(c.completedAt)}</Fact>
        <Fact label="سرعة الإرسال"><span className="tabular-nums">{num(c.messagesPerSecond)}</span> رسالة/ث</Fact>
        {(tags.length > 0 || excluded.length > 0) && (
          <Fact label="الجمهور" wide>
            {tags.length ? tags.map((t) => `#${t}`).join('، ') : 'كل عملاء الفروع'}
            {excluded.length > 0 && <span className="text-neutral-500"> · باستثناء: {excluded.map((t) => `#${t}`).join('، ')}</span>}
          </Fact>
        )}
      </dl>

      <div className="mt-4">
        <Kpis items={[
          { label: 'المستهدفون', value: num(s.total) },
          { label: 'وصلت', value: num(s.delivered), note: `نسبة الوصول ${pct(s.delivered, s.accepted)}` },
          { label: 'قُرئت', value: num(s.read), note: `نسبة القراءة ${pct(s.read, s.delivered)}` },
          { label: 'نسبة التفاعل', value: pct(s.replied, s.read), note: `${num(s.replied)} تفاعلوا · من القارئين`, strong: true },
        ]} />
      </div>

      <SectionTitle>مراحل الوصول</SectionTitle>
      <FunnelBars stats={s} />

      <ActivitySection campaign={c} />

      {c.byBranch.length > 1 && (
        <div className="break-inside-avoid">
          <SectionTitle>حسب الفرع</SectionTitle>
          <Table
            head={['الفرع', 'المستهدفون', 'الوصول', 'القراءة', 'تفاعلوا', 'التفاعل', 'فشل']}
            rows={c.byBranch.map((b) => [b.storeName || '—', num(b.stats.total), pct(b.stats.delivered, b.stats.accepted), pct(b.stats.read, b.stats.delivered), num(b.stats.replied), pct(b.stats.replied, b.stats.read), num(b.stats.failed)])}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 break-inside-avoid">
        <div>
          <SectionTitle note={`${num(s.clicked)} ضغطة`}>الأزرار الأكثر ضغطًا</SectionTitle>
          {c.buttons.length ? (
            <Table head={['الزر', 'الضغطات', 'النسبة']} rows={c.buttons.map((b) => [b.text || '—', num(b.count), pct(b.count, s.clicked)])} />
          ) : <p className="text-[12px] text-neutral-500">لا توجد ضغطات أزرار مسجّلة.</p>}
        </div>
        <div>
          <SectionTitle note={`${num(s.failed + s.skipped)} رسالة`}>أسباب عدم الوصول</SectionTitle>
          {errors.length ? (
            <Table head={['السبب', 'العدد']} rows={errors.map((e) => [e.reason, num(e.count)])} />
          ) : <p className="text-[12px] text-neutral-500">وصلت كل الرسائل المقبولة.</p>}
        </div>
      </div>

      {message && (
        <div className="break-inside-avoid">
          <SectionTitle>نص الرسالة</SectionTitle>
          <div className="rounded-lg border border-[#e7e1ef] bg-[#faf8fc] px-4 py-3 text-[12px] leading-6 whitespace-pre-wrap">
            {message}
            {buttons.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {buttons.map((b) => <span key={b} className="rounded-md border bg-white px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: '#e7e1ef', color: BRAND }}>{b}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-[10px] text-neutral-400">
        القراءة تعتمد على إيصالات القراءة لدى العملاء، فالعدد الفعلي قد يكون أعلى. ضغطات أزرار الروابط لا يُبلّغ عنها واتساب فلا تظهر هنا.
      </p>
    </>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-3' : ''}>
      <dt className="text-[10px] font-bold text-neutral-500">{label}</dt>
      <dd className="font-bold text-[#1c1527]">{children}</dd>
    </div>
  );
}

/** Hourly sent / read / interacted over the first week; fixed size and no animation so it prints complete. */
function ActivitySection({ campaign }: { campaign: CampaignDetails }) {
  const points = useMemo(() => {
    if (!campaign.timeline.length) return [];
    const byHour = new Map<string, { label: string; sent: number; read: number; replied: number }>();
    const first = Math.min(...campaign.timeline.map((p) => new Date(p.bucket).getTime()));
    const last = Math.max(...campaign.timeline.map((p) => new Date(p.bucket).getTime()));
    for (let t = first; t <= last; t += 3600 * 1000) {
      const d = new Date(t);
      byHour.set(d.toISOString(), { label: `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`, sent: 0, read: 0, replied: 0 });
    }
    for (const p of campaign.timeline) {
      const row = byHour.get(new Date(p.bucket).toISOString());
      if (row) row[p.kind] += p.count;
    }
    return [...byHour.values()];
  }, [campaign.timeline]);

  if (points.length < 2) return null;
  return (
    <div className="break-inside-avoid">
      <SectionTitle note="بالساعة، لأول 7 أيام">حركة الحملة</SectionTitle>
      <ul className="mb-1 flex gap-4 text-[11px]">
        {SERIES.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />{s.label}</li>)}
      </ul>
      <div dir="ltr">
        <LineChart width={700} height={200} data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#eee9f4" />
          <XAxis dataKey="label" reversed tick={{ fill: '#6b6578', fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e7e1ef' }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis orientation="right" allowDecimals={false} width={48} tick={{ fill: '#6b6578', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => num(v)} />
          {SERIES.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />)}
        </LineChart>
      </div>
    </div>
  );
}
