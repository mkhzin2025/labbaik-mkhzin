import type { Response } from 'express';
import { PAGE_MARGIN, REPORT_COLORS as C, createTaelReport, formatNumber as format, formatPercent as percent } from '../../common/pdf/tael-report-kit';

type Rating = 'positive' | 'neutral' | 'negative';

export type MemberActivityReport = {
  organizationName: string;
  member: { fullName: string; email: string; role: string };
  /** yyyy-mm-dd, local to the viewer, both included. */
  from: string;
  to: string;
  generatedAt: Date;
  /** Viewer's offset from UTC in minutes (east positive), for the dates printed in the report. */
  tzOffsetMinutes: number;
  storeNames: Record<string, string>;
  activity: {
    totals: { replies: number; conversations: number; closed: number; positive: number; neutral: number; negative: number; rated: number; satisfaction: number | null };
    responseTime: { medianSeconds: number | null; within5MinShare: number | null; samples: number };
    daily: { date: string; replies: number; closed: number; positive: number; neutral: number; negative: number }[];
    conversations: { customerName: string | null; customerPhone: string; storeId: string; status: string; replies: number; closed: number; rating: string | null; lastActivityAt: string | null }[];
    conversationsTotal: number;
  };
};

const ROLE_NAMES: Record<string, string> = { owner: 'المالك', admin: 'مدير', support: 'دعم العملاء', marketing: 'الحملات' };
const RATING_NAMES: Record<Rating, string> = { positive: 'راضٍ', neutral: 'عادي', negative: 'غير راضٍ' };
const STATUS_NAMES: Record<string, string> = { open: 'مفتوحة', pending: 'معلّقة', snoozed: 'مؤجلة', closed: 'مغلقة' };

/** "45 ث"، "12 د"، "2.5 س". */
const duration = (seconds: number | null) => {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  return `${(seconds / 3600).toFixed(1)} س`;
};

/**
 * One team member's activity report in the Tael Bot report style: KPIs and ratings, replies per day, then the
 * day-by-day table and the conversations they worked on.
 */
export function writeMemberActivityPdf(response: Response, report: MemberActivityReport) {
  const { activity, member } = report;
  const t = activity.totals;
  const pad = (n: number) => String(n).padStart(2, '0');
  // Inside Arabic text the bidi algorithm reverses "2026-10-22"; "/" keeps the digits in reading order.
  const day = (value: string) => value.replace(/-/g, '/');
  const stamp = (value: Date | string | null) => {
    if (!value) return '—';
    const d = new Date(new Date(value).getTime() + report.tzOffsetMinutes * 60_000);
    return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  const period = report.from === report.to ? day(report.from) : `${day(report.from)} – ${day(report.to)}`;
  // Header values must be ASCII; the page names the member, the browser names the file.
  const r = createTaelReport(response, `team-activity-${report.from}_${report.to}.pdf`);
  const { doc, height, right, contentWidth, text } = r;

  // ---------- Page 1: overview ----------
  r.page({ first: true, bandHeight: 124, title: `تقرير أداء: ${member.fullName}`, titleY: 80, titleSize: 21, glyphSize: 44 });
  r.chip(PAGE_MARGIN, 26, 118, 'تاريخ التقرير', stamp(report.generatedAt).slice(0, 10));
  r.chip(PAGE_MARGIN + 126, 26, 170, 'الفترة', period);
  r.chip(PAGE_MARGIN + 304, 26, 100, 'الدور', ROLE_NAMES[member.role] || member.role);
  text([report.organizationName, member.email, 'الردود والمحادثات المغلقة وتقييمات العملاء'].filter(Boolean).join(' | '), PAGE_MARGIN, 136, contentWidth, { size: 9.5, color: C.muted });

  r.cards([
    { label: 'رضا العملاء', value: t.satisfaction === null ? '—' : percent(t.positive, t.rated), note: `${format(t.rated)} تقييم`, color: C.plum, hero: true },
    { label: 'الردود', value: format(t.replies), note: 'رسالة كتبها للعملاء', color: C.brand },
    { label: 'المحادثات', value: format(t.conversations), note: 'رد فيها', color: C.lilac },
    { label: 'أغلقها', value: format(t.closed), note: 'إغلاق محادثة', color: C.teal },
    { label: 'زمن الرد', value: duration(activity.responseTime.medianSeconds), note: activity.responseTime.samples ? `الوسيط · ${percent(Math.round((activity.responseTime.within5MinShare || 0) * activity.responseTime.samples), activity.responseTime.samples)} خلال 5 دقائق` : 'لا توجد ردود بعد رسالة عميل', color: C.orange },
  ], 158, 84);

  const panelY = 260;
  const panelHeight = height - panelY - 46;

  // Ratings (right panel).
  const ratingWidth = 330;
  const ratingX = right - ratingWidth;
  let y = r.panel(ratingX, panelY, ratingWidth, panelHeight, 'تقييمات العملاء', t.rated ? `${format(t.rated)} تقييم` : undefined);
  const ratingColors: Record<Rating, string> = { positive: C.teal, neutral: C.lilac, negative: C.red };
  if (!t.rated) text('لا توجد تقييمات في هذه الفترة.', ratingX + 16, y + 30, ratingWidth - 32, { size: 9, color: C.muted, align: 'center' });
  else (['positive', 'neutral', 'negative'] as Rating[]).forEach((key, index) => {
    const rowY = y + 8 + index * 46;
    const barX = ratingX + 16 + 70;
    const barWidth = ratingWidth - 32 - 70 - 70;
    text(RATING_NAMES[key], ratingX + ratingWidth - 16 - 64, rowY, 64, { size: 10, color: C.ink, bold: true });
    doc.roundedRect(barX, rowY + 2, barWidth, 12, 3).fill(C.soft);
    const filled = (t[key] / t.rated) * barWidth;
    if (filled > 0) doc.roundedRect(barX + barWidth - filled, rowY + 2, Math.max(filled, 2), 12, 3).fill(ratingColors[key]);
    text(format(t[key]), ratingX + 16 + 30, rowY, 36, { size: 10, color: C.ink, bold: true, align: 'left' });
    text(percent(t[key], t.rated), ratingX + 16, rowY + 1, 28, { size: 8, color: C.muted, align: 'left' });
  });
  text('يُنسب التقييم لمن أغلق المحادثة، فرسالة التقييم تُرسل عند الإغلاق.', ratingX + 16, panelY + panelHeight - 22, ratingWidth - 32, { size: 7, color: C.muted });

  // Replies per day (left panel).
  const chartX = PAGE_MARGIN;
  const chartWidth = ratingX - 14 - PAGE_MARGIN;
  y = r.panel(chartX, panelY, chartWidth, panelHeight, 'الردود والإغلاق يوميًا');
  const days = activity.daily;
  const plotTop = y + 6;
  const plotBottom = panelY + panelHeight - 30;
  const plotLeft = chartX + 16;
  const plotWidth = chartWidth - 32;
  const peak = Math.max(1, ...days.map((d) => Math.max(d.replies, d.closed)));
  const slot = plotWidth / Math.max(1, days.length);
  const bar = Math.max(1, Math.min(14, slot * 0.36));
  doc.moveTo(plotLeft, plotBottom).lineTo(plotLeft + plotWidth, plotBottom).lineWidth(0.5).stroke(C.line);
  // Right to left, like the rest of the report: the first day sits on the right.
  days.forEach((d, index) => {
    const center = plotLeft + plotWidth - slot * (index + 0.5);
    const replies = ((plotBottom - plotTop) * d.replies) / peak;
    const closed = ((plotBottom - plotTop) * d.closed) / peak;
    if (replies > 0) doc.rect(center, plotBottom - replies, bar, replies).fill(C.brand);
    if (closed > 0) doc.rect(center - bar, plotBottom - closed, bar, closed).fill(C.teal);
    const labelEvery = Math.ceil(days.length / 12);
    if (index % labelEvery === 0) text(day(d.date.slice(5)), center - 20, plotBottom + 5, 40, { size: 6.5, color: C.muted, align: 'center' });
  });
  if (!t.replies && !t.closed) text('لا يوجد نشاط في هذه الفترة.', plotLeft, (plotTop + plotBottom) / 2 - 6, plotWidth, { size: 9, color: C.muted, align: 'center' });
  doc.rect(chartX + 16, panelY + 18, 8, 8).fill(C.brand);
  text('ردود', chartX + 28, panelY + 17, 40, { size: 7.5, color: C.muted });
  doc.rect(chartX + 62, panelY + 18, 8, 8).fill(C.teal);
  text('إغلاق', chartX + 74, panelY + 17, 40, { size: 7.5, color: C.muted });

  // ---------- Tables ----------
  const headerHeight = 34;
  const bodyRow = 26;
  const footerSpace = 60;
  type Column<T> = { title: string; width: number; value: (row: T) => string; strong?: boolean };

  const startPage = (title: string) => {
    r.page({ bandHeight: 70, title, titleY: 24, titleSize: 15, glyphSize: 34 });
    r.chip(PAGE_MARGIN, 16, 170, 'الفترة', period);
    return 90;
  };
  /** Columns laid out right to left; widths are shares of the content width. */
  const table = <T,>(title: string, columns: Column<T>[], rows: T[], totals?: T) => {
    const share = columns.reduce((sum, c) => sum + c.width, 0);
    const xs: { x: number; w: number }[] = [];
    let cursor = right;
    for (const c of columns) {
      const w = (c.width / share) * contentWidth;
      cursor -= w;
      xs.push({ x: cursor, w });
    }
    const header = (top: number) => {
      doc.roundedRect(PAGE_MARGIN, top, contentWidth, headerHeight, 9).fill(C.plum);
      columns.forEach((c, i) => text(c.title, xs[i].x + 6, top + 12, xs[i].w - 12, { size: 8.5, color: C.white, bold: true, align: i === 0 ? 'right' : 'center' }));
      return top + headerHeight;
    };
    let top = header(startPage(title));
    rows.forEach((row, index) => {
      if (top + bodyRow > height - footerSpace) top = header(startPage(title));
      doc.rect(PAGE_MARGIN, top, contentWidth, bodyRow).fill(index % 2 ? C.zebra : C.white);
      columns.forEach((c, i) => text(c.value(row), xs[i].x + 6, top + 8, xs[i].w - 12, { size: 8.5, color: c.strong ? C.brand : C.ink, bold: i === 0 || c.strong, align: i === 0 ? 'right' : 'center' }));
      doc.moveTo(PAGE_MARGIN, top + bodyRow).lineTo(right, top + bodyRow).lineWidth(0.4).stroke(C.line);
      top += bodyRow;
    });
    if (totals) {
      if (top + 30 > height - footerSpace) top = header(startPage(title));
      doc.rect(PAGE_MARGIN, top, contentWidth, 30).fill(C.plumDeep);
      columns.forEach((c, i) => text(c.value(totals), xs[i].x + 6, top + 9, xs[i].w - 12, { size: 9, color: C.white, bold: true, align: i === 0 ? 'right' : 'center' }));
      top += 30;
    }
    return top;
  };

  type DayRow = MemberActivityReport['activity']['daily'][number] & { label?: string };
  // Long ranges list only the days with activity.
  const dayRows: DayRow[] = days.length > 62 ? days.filter((d) => d.replies || d.closed || d.positive || d.neutral || d.negative) : days;
  const dayRated = (d: DayRow) => d.positive + d.neutral + d.negative;
  let end = table<DayRow>('النشاط اليومي', [
    { title: 'اليوم', width: 1.4, value: (d) => d.label || day(d.date) },
    { title: 'الردود', width: 1, value: (d) => format(d.replies) },
    { title: 'أغلقها', width: 1, value: (d) => format(d.closed) },
    { title: 'راضٍ', width: 1, value: (d) => format(d.positive) },
    { title: 'عادي', width: 1, value: (d) => format(d.neutral) },
    { title: 'غير راضٍ', width: 1, value: (d) => format(d.negative) },
    { title: 'الرضا', width: 1, value: (d) => percent(d.positive, dayRated(d)), strong: true },
  ], dayRows, { label: 'الإجمالي', date: '', replies: t.replies, closed: t.closed, positive: t.positive, neutral: t.neutral, negative: t.negative });

  type ConversationRow = MemberActivityReport['activity']['conversations'][number];
  if (activity.conversations.length) {
    const title = activity.conversationsTotal > activity.conversations.length
      ? `المحادثات (أحدث ${format(activity.conversations.length)} من ${format(activity.conversationsTotal)})`
      : `المحادثات (${format(activity.conversations.length)})`;
    const multiBranch = Object.keys(report.storeNames).length > 1;
    end = table<ConversationRow>(title, [
      { title: 'العميل', width: 2.2, value: (c) => c.customerName || c.customerPhone },
      { title: 'الرقم', width: 1.5, value: (c) => c.customerPhone },
      ...(multiBranch ? [{ title: 'الفرع', width: 1.3, value: (c: ConversationRow) => report.storeNames[c.storeId] || '—' }] : []),
      { title: 'ردوده', width: 0.8, value: (c) => format(c.replies) },
      { title: 'أغلقها', width: 0.8, value: (c) => (c.closed ? format(c.closed) : '—') },
      { title: 'التقييم', width: 1, value: (c) => (c.rating ? RATING_NAMES[c.rating as Rating] || c.rating : '—'), strong: true },
      { title: 'الحالة الآن', width: 1, value: (c) => STATUS_NAMES[c.status] || c.status },
      { title: 'آخر نشاط له', width: 1.5, value: (c) => stamp(c.lastActivityAt) },
    ], activity.conversations);
  }

  // Notes, under the last table.
  const notes = [
    'الردود = الرسائل التي كتبها العضو بنفسه، لا تشمل ردود البوت والتدفقات.',
    'زمن الرد = من أول رسالة للعميل لم يُرد عليها حتى رد العضو (الوسيط، ضمن 24 ساعة).',
    'يبدأ احتساب النشاط من تاريخ تفعيل تتبّع الفريق؛ الرسائل الأقدم لا تحمل اسم من كتبها.',
  ];
  const notesHeight = 16 + notes.length * 13;
  if (end + 12 + notesHeight > height - 36) end = startPage('ملاحظات') - 12;
  end += 12;
  doc.roundedRect(PAGE_MARGIN, end, contentWidth, notesHeight, 9).fill(C.soft);
  notes.forEach((note, index) => text(note, PAGE_MARGIN + 14, end + 8 + index * 13, contentWidth - 28, { size: 7.5, color: C.muted }));

  r.finish('تيل بوت | تقرير أداء عضو الفريق');
}
