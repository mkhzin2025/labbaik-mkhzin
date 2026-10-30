import type { Response } from 'express';
import { PAGE_MARGIN, REPORT_COLORS as C, createTaelReport, formatNumber as format, formatPercent as percent } from '../../common/pdf/tael-report-kit';

type Stats = { total: number; accepted: number; delivered: number; read: number; replied: number; failed: number; skipped: number };
type Label = { name: string };

export type CampaignReportItem = {
  name: string;
  templateName: string;
  createdByName: string | null;
  createdAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  messagesPerSecond: number;
  audience?: { labels?: { branches?: Label[]; categories?: Label[]; tags?: Label[]; excludeCategories?: Label[]; excludeTags?: Label[] } } | null;
  stats: Stats;
  byBranch: { storeName: string | null; stats: Stats }[];
  buttons: { text: string; count: number }[];
  errors: { error: string; count: number }[];
};

export type CampaignsReport = {
  organizationName: string;
  /** yyyy-mm-dd, local to the viewer. */
  from: string;
  to: string;
  generatedAt: Date;
  /** Viewer's offset from UTC in minutes (east positive), for the dates printed in the report. */
  tzOffsetMinutes: number;
  campaigns: CampaignReportItem[];
};

/** Meta's delivery errors in plain Arabic; variants of the same error (trace ids, codes) fold into one reason. */
const ERROR_REASONS: { match: RegExp; label: string }[] = [
  { match: /healthy ecosystem|131049/i, label: 'حدّ Meta لعدد الرسائل التسويقية التي يستقبلها الشخص' },
  { match: /undeliverable|131026/i, label: 'تعذّر التسليم: الرقم غير مسجّل في واتساب أو غير متاح' },
  { match: /experiment|130472/i, label: 'الرقم ضمن تجربة Meta لتقليل الرسائل التسويقية' },
  { match: /stop receiving marketing|131050/i, label: 'العميل أوقف استقبال الرسائل التسويقية' },
  { match: /payment|unsettled|131042/i, label: 'مستحقات حساب واتساب غير مسدّدة' },
  { match: /re-engagement|24 hours|131047/i, label: 'انتهت نافذة الـ24 ساعة' },
  { match: /something went wrong|131000/i, label: 'خطأ عام من Meta' },
];
const reasonOf = (error: string) => ERROR_REASONS.find((r) => r.match.test(error))?.label || error.trim() || 'سبب غير محدد';
const groupErrors = (errors: { error: string; count: number }[]) => {
  const map = new Map<string, number>();
  for (const e of errors) map.set(reasonOf(e.error), (map.get(reasonOf(e.error)) || 0) + e.count);
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
};

const interaction = (s: Stats) => (s.read ? s.replied / s.read : 0);

/**
 * WhatsApp campaigns report in the Tael Bot report style: an overview of the chosen campaigns,
 * a comparison table, then one page per campaign (plus a branch page when it covered several branches).
 */
export function writeCampaignsReportPdf(response: Response, report: CampaignsReport) {
  const { campaigns } = report;
  const pad = (n: number) => String(n).padStart(2, '0');
  // Inside Arabic text the bidi algorithm reverses "2026-10-22"; "/" keeps the digits in reading order.
  const day = (value: string) => value.replace(/-/g, '/');
  const stamp = (value: Date | string | null) => {
    if (!value) return '—';
    const d = new Date(new Date(value).getTime() + report.tzOffsetMinutes * 60_000);
    return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  const generated = stamp(report.generatedAt).slice(0, 10);
  const period = `${day(report.from)} – ${day(report.to)}`;
  const totals = campaigns.reduce<Stats>((acc, c) => {
    for (const key of Object.keys(acc) as (keyof Stats)[]) acc[key] += c.stats[key] || 0;
    return acc;
  }, { total: 0, accepted: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0 });

  const r = createTaelReport(response, `campaigns-report-${report.from}_${report.to}.pdf`);
  const { doc, height, right, contentWidth, text } = r;

  /** Delivery funnel: one bar per stage, sized against the targeted total, with the step-to-step rate. */
  const funnel = (x: number, y: number, boxWidth: number, rowHeight: number, s: Stats) => {
    const stages = [
      { label: 'المستهدفون', value: s.total, note: '', color: C.plum },
      { label: 'قبلها واتساب', value: s.accepted, note: `${percent(s.accepted, s.total)} من المستهدفين`, color: C.brand },
      { label: 'وصلت', value: s.delivered, note: `${percent(s.delivered, s.accepted)} من المقبولة`, color: C.lilac },
      { label: 'قُرئت', value: s.read, note: `${percent(s.read, s.delivered)} من الواصلة`, color: C.orange },
      { label: 'تفاعلوا', value: s.replied, note: `${percent(s.replied, s.read)} من القارئين`, color: C.teal },
    ];
    const labelWidth = 74;
    const valueWidth = Math.min(150, boxWidth * 0.36);
    const barX = x + valueWidth + 8;
    const barWidth = boxWidth - labelWidth - valueWidth - 16;
    const barHeight = Math.min(12, rowHeight - 10);
    stages.forEach((stage, index) => {
      const rowY = y + index * rowHeight;
      text(stage.label, x + boxWidth - labelWidth, rowY + 2, labelWidth, { size: 9, color: C.ink, bold: true });
      doc.roundedRect(barX, rowY + 3, barWidth, barHeight, 3).fill(C.soft);
      const filled = s.total ? (stage.value / s.total) * barWidth : 0;
      if (filled > 0) doc.roundedRect(barX + barWidth - filled, rowY + 3, Math.max(filled, 2), barHeight, 3).fill(stage.color);
      text(format(stage.value), x, rowY + 1, valueWidth, { size: 9.5, color: C.ink, bold: true, align: 'left' });
      if (stage.note) text(stage.note, x, rowY + 13, valueWidth, { size: 6.8, color: C.muted, align: 'left' });
    });
  };

  // ---------- Page 1: overview ----------
  r.page({ first: true, bandHeight: 124, title: 'تقرير حملات واتساب', titleY: 80, titleSize: 21, glyphSize: 44 });
  r.chip(PAGE_MARGIN, 26, 118, 'تاريخ التقرير', day(generated));
  r.chip(PAGE_MARGIN + 126, 26, 170, 'الفترة', period);
  r.chip(PAGE_MARGIN + 304, 26, 82, 'الحملات', format(campaigns.length));
  text([report.organizationName, 'أداء الحملات المختارة: الوصول والقراءة والتفاعل'].filter(Boolean).join(' | '), PAGE_MARGIN, 136, contentWidth, { size: 9.5, color: C.muted });

  r.cards([
    { label: 'نسبة التفاعل', value: percent(totals.replied, totals.read), note: `من العملاء الذين قرأوا الرسالة`, color: C.plum, hero: true },
    { label: 'تفاعلوا', value: format(totals.replied), note: `من ${format(totals.read)} قرأوا`, color: C.teal },
    { label: 'المستهدفون', value: format(totals.total), note: `في ${format(campaigns.length)} حملة`, color: C.plum },
    { label: 'وصلت', value: format(totals.delivered), note: `نسبة الوصول ${percent(totals.delivered, totals.accepted)}`, color: C.lilac },
    { label: 'قُرئت', value: format(totals.read), note: `نسبة القراءة ${percent(totals.read, totals.delivered)}`, color: C.orange },
    { label: 'لم تصل', value: format(totals.failed), note: `${percent(totals.failed, totals.total)} من المستهدفين`, color: C.red },
  ], 158, 84);

  const panelY = 260;
  const panelHeight = height - panelY - 46;
  // Interaction per campaign (right panel), best first.
  const rankWidth = 470;
  const rankX = right - rankWidth;
  let y = r.panel(rankX, panelY, rankWidth, panelHeight, 'التفاعل حسب الحملة', 'من القارئين');
  const ranked = [...campaigns].sort((a, b) => interaction(b.stats) - interaction(a.stats));
  const maxRows = Math.floor((panelHeight - 52) / 18);
  const shown = ranked.slice(0, maxRows);
  const rankRow = Math.min(26, (panelHeight - 52) / Math.max(1, shown.length));
  const peakRate = Math.max(0.01, ...shown.map((c) => interaction(c.stats)));
  shown.forEach((c, index) => {
    const rowY = y + index * rankRow;
    const nameWidth = 150;
    const valueWidth = 96;
    const barX = rankX + 16 + valueWidth + 6;
    const barWidth = rankWidth - 32 - nameWidth - valueWidth - 12;
    const barHeight = Math.min(11, rankRow - 7);
    text(c.name, rankX + rankWidth - 16 - nameWidth, rowY + 2, nameWidth, { size: 8, color: C.ink, bold: true });
    doc.roundedRect(barX, rowY + 3, barWidth, barHeight, 3).fill(C.soft);
    const filled = (interaction(c.stats) / peakRate) * barWidth;
    if (filled > 0) doc.roundedRect(barX + barWidth - filled, rowY + 3, Math.max(filled, 2), barHeight, 3).fill(C.teal);
    text(percent(c.stats.replied, c.stats.read), rankX + 16 + 52, rowY + 2, valueWidth - 52, { size: 8.5, color: C.ink, bold: true, align: 'left' });
    text(format(c.stats.replied), rankX + 16, rowY + 2.5, 48, { size: 7, color: C.teal, align: 'left' });
  });
  if (ranked.length > shown.length) text(`و ${format(ranked.length - shown.length)} حملة أخرى في جدول المقارنة`, rankX + 16, panelY + panelHeight - 18, rankWidth - 32, { size: 7, color: C.muted });

  // Funnel for all campaigns (left panel).
  const funnelX = PAGE_MARGIN;
  const funnelWidth = rankX - 14 - PAGE_MARGIN;
  y = r.panel(funnelX, panelY, funnelWidth, panelHeight, 'مراحل الوصول');
  funnel(funnelX + 16, y + 6, funnelWidth - 32, Math.min(46, (panelHeight - 60) / 5), totals);

  // ---------- Comparison table ----------
  const columns: { title: string; subtitle: string; value: (s: Stats) => string; strong?: boolean }[] = [
    { title: 'المستهدفون', subtitle: 'رقم', value: (s) => format(s.total) },
    { title: 'وصلت', subtitle: 'رسالة', value: (s) => format(s.delivered) },
    { title: 'الوصول', subtitle: 'من المقبولة', value: (s) => percent(s.delivered, s.accepted) },
    { title: 'قُرئت', subtitle: 'رسالة', value: (s) => format(s.read) },
    { title: 'القراءة', subtitle: 'من الواصلة', value: (s) => percent(s.read, s.delivered) },
    { title: 'تفاعلوا', subtitle: 'عميل', value: (s) => format(s.replied) },
    { title: 'التفاعل', subtitle: 'من القارئين', value: (s) => percent(s.replied, s.read), strong: true },
    { title: 'لم تصل', subtitle: 'رسالة', value: (s) => format(s.failed) },
  ];
  const nameColumn = 200;
  const columnWidth = (contentWidth - nameColumn) / columns.length;
  const columnX = (index: number) => right - nameColumn - (index + 1) * columnWidth;
  const headerHeight = 40;
  const bodyRow = 30;
  const footerSpace = 70;

  const startTablePage = (title: string) => {
    r.page({ bandHeight: 70, title, titleY: 24, titleSize: 15, glyphSize: 34 });
    r.chip(PAGE_MARGIN, 16, 170, 'الفترة', period);
    return 90;
  };
  const tableHeader = (top: number, first: string, cols: typeof columns) => {
    doc.roundedRect(PAGE_MARGIN, top, contentWidth, headerHeight, 9).fill(C.plum);
    text(first, right - nameColumn + 6, top + 14, nameColumn - 18, { size: 9, color: C.white, bold: true });
    cols.forEach((column, index) => {
      const x = columnX(index);
      if (column.strong) doc.save().fillOpacity(0.18).rect(x, top, columnWidth, headerHeight).fill(C.white).restore();
      text(column.title, x + 4, top + 8, columnWidth - 8, { size: 8.5, color: C.white, bold: true, align: 'center' });
      text(column.subtitle, x + 4, top + 23, columnWidth - 8, { size: 6.8, color: C.lavender, align: 'center' });
    });
    return top + headerHeight;
  };
  const tableRow = (top: number, index: number, name: string, sub: string, s: Stats, cols: typeof columns) => {
    doc.rect(PAGE_MARGIN, top, contentWidth, bodyRow).fill(index % 2 ? C.zebra : C.white);
    const strongIndex = cols.findIndex((column) => column.strong);
    if (strongIndex >= 0) doc.rect(columnX(strongIndex), top, columnWidth, bodyRow).fill(C.soft);
    text(name, right - nameColumn + 6, top + (sub ? 4 : 9), nameColumn - 18, { size: 9, color: C.ink, bold: true });
    if (sub) text(sub, right - nameColumn + 6, top + 17, nameColumn - 18, { size: 6.8, color: C.muted });
    cols.forEach((column, columnIndex) => {
      text(column.value(s), columnX(columnIndex) + 4, top + 9, columnWidth - 8, { size: 9, align: 'center', bold: column.strong, color: column.strong ? C.brand : C.ink });
    });
    doc.moveTo(PAGE_MARGIN, top + bodyRow).lineTo(right, top + bodyRow).lineWidth(0.4).stroke(C.line);
  };
  const totalRow = (top: number, s: Stats, cols: typeof columns) => {
    doc.rect(PAGE_MARGIN, top, contentWidth, 32).fill(C.plumDeep);
    text('الإجمالي', right - nameColumn + 6, top + 10, nameColumn - 18, { size: 9.5, color: C.white, bold: true });
    cols.forEach((column, index) => text(column.value(s), columnX(index) + 4, top + 10, columnWidth - 8, { size: 9.5, color: C.white, bold: true, align: 'center' }));
    return top + 32;
  };

  y = tableHeader(startTablePage('مقارنة الحملات'), 'الحملة', columns);
  campaigns.forEach((c, index) => {
    if (y + bodyRow > height - footerSpace) y = tableHeader(startTablePage('مقارنة الحملات'), 'الحملة', columns);
    tableRow(y, index, c.name, `${stamp(c.createdAt)} | ${c.audience?.labels?.branches?.map((b) => b.name).join('، ') || ''}`, c.stats, columns);
    y += bodyRow;
  });
  if (y + 32 > height - footerSpace) y = tableHeader(startTablePage('مقارنة الحملات'), 'الحملة', columns);
  y = totalRow(y, totals, columns);

  // Why messages did not arrive, all campaigns together.
  const reasons = groupErrors(campaigns.flatMap((c) => c.errors));
  const failedAll = totals.failed + totals.skipped;
  const reasonRow = 20;
  const reasonsHeight = 42 + reasons.length * reasonRow + 8;
  if (reasons.length) {
    if (y + 18 + reasonsHeight > height - 40) y = startTablePage('أسباب عدم الوصول') - 18;
    y += 18;
    const top = r.panel(PAGE_MARGIN, y, contentWidth, reasonsHeight, 'أسباب عدم الوصول', `${format(failedAll)} رسالة لم تصل`);
    const maxReason = Math.max(1, ...reasons.map((item) => item.count));
    reasons.forEach((item, index) => {
      const rowY = top + index * reasonRow;
      const labelWidth = 330;
      const barX = PAGE_MARGIN + 16 + 130;
      const barWidth = contentWidth - 32 - labelWidth - 140;
      text(item.reason, right - 16 - labelWidth, rowY + 2, labelWidth, { size: 8.5, color: C.ink });
      doc.roundedRect(barX, rowY + 4, barWidth, 9, 3).fill(C.soft);
      const filled = (item.count / maxReason) * barWidth;
      doc.roundedRect(barX + barWidth - filled, rowY + 4, Math.max(filled, 2), 9, 3).fill(C.red);
      text(format(item.count), PAGE_MARGIN + 16 + 60, rowY + 2, 66, { size: 8.5, color: C.ink, bold: true, align: 'left' });
      text(percent(item.count, failedAll), PAGE_MARGIN + 16, rowY + 2, 54, { size: 8, color: C.muted, align: 'left' });
    });
    y += reasonsHeight;
  }

  const notes = [
    'نسبة التفاعل = من تفاعلوا مع الرسالة (ضغطوا زرًا أو كتبوا) من بين من قرأوها.',
    'القراءة تعتمد على إيصالات القراءة لدى العملاء، فالعدد الفعلي قد يكون أعلى.',
    'أزرار الروابط (فتح موقع أو تطبيق) لا يُبلّغ عنها واتساب، فلا تدخل في التفاعل.',
  ];
  const notesHeight = 16 + notes.length * 13;
  if (y + 12 + notesHeight > height - 36) y = startTablePage('ملاحظات') - 12;
  y += 12;
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, notesHeight, 9).fill(C.soft);
  notes.forEach((note, index) => text(note, PAGE_MARGIN + 14, y + 8 + index * 13, contentWidth - 28, { size: 7.5, color: C.muted }));

  // ---------- One page per campaign ----------
  campaigns.forEach((c, index) => {
    const s = c.stats;
    r.page({ bandHeight: 100, title: c.name, titleY: 62, titleSize: 18, glyphSize: 36 });
    r.chip(PAGE_MARGIN, 20, 118, 'تاريخ الإرسال', stamp(c.startedAt || c.createdAt));
    r.chip(PAGE_MARGIN + 126, 20, 170, 'القالب', c.templateName);
    r.chip(PAGE_MARGIN + 304, 20, 92, 'الحملة', `${format(index + 1)} من ${format(campaigns.length)}`);

    r.cards([
      { label: 'نسبة التفاعل', value: percent(s.replied, s.read), note: `${format(s.replied)} تفاعلوا من القارئين`, color: C.plum, hero: true },
      { label: 'المستهدفون', value: format(s.total), note: `${format(s.accepted)} قبلها واتساب`, color: C.plum },
      { label: 'وصلت', value: format(s.delivered), note: `نسبة الوصول ${percent(s.delivered, s.accepted)}`, color: C.lilac },
      { label: 'قُرئت', value: format(s.read), note: `نسبة القراءة ${percent(s.read, s.delivered)}`, color: C.orange },
      { label: 'لم تصل', value: format(s.failed), note: `${percent(s.failed, s.total)} من المستهدفين`, color: C.red },
    ], 116, 72);

    const top = 204;
    const gap = 12;
    const half = (height - 44 - top - gap) / 2;
    const columnW = (contentWidth - 14) / 2;
    const rightX = right - columnW;
    const leftX = PAGE_MARGIN;

    // Funnel (top right).
    let inner = r.panel(rightX, top, columnW, half, 'مراحل الوصول');
    funnel(rightX + 16, inner, columnW - 32, (half - 50) / 5, s);

    // Campaign facts (top left).
    inner = r.panel(leftX, top, columnW, half, 'تفاصيل الحملة');
    const labels = c.audience?.labels || {};
    const included = [...(labels.categories || []), ...(labels.tags || [])].map((t) => t.name);
    const excluded = [...(labels.excludeCategories || []), ...(labels.excludeTags || [])].map((t) => t.name);
    const facts: [string, string][] = [
      ['الفروع', labels.branches?.map((b) => b.name).join('، ') || '—'],
      ['أنشأها', c.createdByName || '—'],
      ['بدأ الإرسال', stamp(c.startedAt || c.createdAt)],
      ['اكتمل الإرسال', stamp(c.completedAt)],
      ['الجمهور', included.length ? included.join('، ') : 'كل عملاء الفروع'],
      ['باستثناء', excluded.length ? excluded.join('، ') : '—'],
      ['سرعة الإرسال', `${format(c.messagesPerSecond)} رسالة/ث`],
      ['قبلها واتساب', `${format(s.accepted)} من ${format(s.total)}`],
    ];
    const factWidth = (columnW - 32 - 12) / 2;
    const factRow = (half - 50) / 4;
    facts.forEach(([label, value], factIndex) => {
      const x = leftX + 16 + (factIndex % 2 === 0 ? factWidth + 12 : 0);
      const factY = inner + Math.floor(factIndex / 2) * factRow;
      text(label, x, factY, factWidth, { size: 7, color: C.muted, bold: true });
      text(value, x, factY + 11, factWidth, { size: 9, color: C.ink, bold: true });
    });

    // Most used buttons (bottom right).
    const bottom = top + half + gap;
    inner = r.panel(rightX, bottom, columnW, half, 'الأزرار الأكثر استخدامًا', `${format(s.replied)} تفاعلوا`);
    const buttons = c.buttons.slice(0, 5);
    if (!buttons.length) text('لا توجد ضغطات أزرار مسجّلة.', rightX + 16, inner + 20, columnW - 32, { size: 9, color: C.muted, align: 'center' });
    const buttonRow = (half - 50) / 5;
    const maxButton = Math.max(1, ...buttons.map((b) => b.count));
    buttons.forEach((b, buttonIndex) => {
      const rowY = inner + buttonIndex * buttonRow;
      const labelWidth = 130;
      const barX = rightX + 16 + 96;
      const barWidth = columnW - 32 - labelWidth - 104;
      text(b.text || '—', right - 16 - labelWidth, rowY + 2, labelWidth, { size: 8.5, color: C.ink, bold: true });
      doc.roundedRect(barX, rowY + 4, barWidth, 9, 3).fill(C.soft);
      const filled = (b.count / maxButton) * barWidth;
      doc.roundedRect(barX + barWidth - filled, rowY + 4, Math.max(filled, 2), 9, 3).fill(C.brand);
      text(format(b.count), rightX + 16 + 40, rowY + 2, 52, { size: 8.5, color: C.ink, bold: true, align: 'left' });
      text(percent(b.count, s.replied), rightX + 16, rowY + 2, 36, { size: 7.5, color: C.muted, align: 'left' });
    });

    // Why messages did not arrive (bottom left).
    const failed = s.failed + s.skipped;
    inner = r.panel(leftX, bottom, columnW, half, 'أسباب عدم الوصول', `${format(failed)} رسالة`);
    const errors = groupErrors(c.errors).slice(0, 5);
    if (!errors.length) text('وصلت كل الرسائل المقبولة.', leftX + 16, inner + 20, columnW - 32, { size: 9, color: C.muted, align: 'center' });
    errors.forEach((e, errorIndex) => {
      const rowY = inner + errorIndex * buttonRow;
      text(e.reason, leftX + 16 + 100, rowY + 2, columnW - 132, { size: 8, color: C.ink });
      text(format(e.count), leftX + 16 + 40, rowY + 2, 56, { size: 8.5, color: C.ink, bold: true, align: 'left' });
      text(percent(e.count, failed), leftX + 16, rowY + 2, 36, { size: 7.5, color: C.muted, align: 'left' });
    });

    // A campaign over several branches gets a branch page.
    if (c.byBranch.length > 1) {
      y = tableHeader(startTablePage(`${c.name}: حسب الفرع`), 'الفرع', columns);
      [...c.byBranch].sort((a, b) => b.stats.total - a.stats.total).forEach((branch, branchIndex) => {
        if (y + bodyRow > height - footerSpace) y = tableHeader(startTablePage(`${c.name}: حسب الفرع`), 'الفرع', columns);
        tableRow(y, branchIndex, branch.storeName || '—', '', branch.stats, columns);
        y += bodyRow;
      });
      if (y + 32 > height - footerSpace) y = tableHeader(startTablePage(`${c.name}: حسب الفرع`), 'الفرع', columns);
      totalRow(y, s, columns);
    }
  });

  r.finish('تيل بوت | تقرير حملات واتساب');
}
