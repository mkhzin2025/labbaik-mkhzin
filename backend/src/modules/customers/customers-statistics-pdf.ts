import { join } from 'node:path';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { drawPdfText } from '../../common/utils/pdf-text.util';

/** A category or tag shown as its own column in the branch statistics report. */
export type StatisticsSource = {
  key: string;
  type: 'category' | 'tag';
  id: string;
  name: string;
  color: string;
};

export type SourceStatisticsRow = {
  storeId: string;
  storeName: string;
  /** Customers registered in the branch before the baseline date. */
  baseline: number;
  /** Customers of the branch linked to each source, keyed by StatisticsSource.key. */
  sources: Record<string, number>;
  /** Actual customers in the branch (each counted once). */
  unique: number;
};

export type SourceStatisticsReport = {
  organizationName: string;
  baselineDate: string;
  generatedDate: string;
  sources: StatisticsSource[];
  rows: SourceStatisticsRow[];
};

const COLORS = {
  page: '#FBF9FD',
  ink: '#241B2E',
  plum: '#38204A',
  plumDeep: '#24142F',
  brand: '#643B89',
  lilac: '#B48CD6',
  lavender: '#DCCCE8',
  muted: '#776E80',
  line: '#E7E0EE',
  soft: '#F4EEF9',
  zebra: '#F9F6FC',
  teal: '#14806F',
  white: '#FFFFFF',
};

// Tael Bot glyph (frontend/src/assets/logos/tael-bot-glyph-white.svg), drawn as vectors so it stays sharp in print.
const GLYPH_VIEWBOX = { x: 236.8, y: 347.55, size: 1602 };
const GLYPH_PATH = 'M741.99 622.3l710.58 0c201.36,0 366.1,164.91 366.1,366.47l0 327.68c0,114.99 -64.35,215.66 -158.78,267.73l-552.03 319.03c-3.88,2.24 -8.32,2.24 -12.2,0 -3.88,-2.24 -6.1,-6.09 -6.1,-10.58l0 -251.32c0,-4.49 2.22,-8.34 6.1,-10.58l425.01 -245.62c47.38,-31.87 78.72,-86 78.72,-147.12l0 -228.45c0,-97.42 -79.63,-177.12 -176.95,-177.12l-683.11 0c-6.71,0 -12.2,5.5 -12.2,12.22l0 393.36c0,97.42 79.63,177.13 176.95,177.13l173.27 0c6.72,0 12.2,5.49 12.2,12.22l0 182.3c0,6.73 -5.48,12.22 -12.2,12.22l-201.14 0c-201.36,0 -366.1,-164.91 -366.1,-366.47l0 -851.59c0,-6.73 5.48,-12.22 12.2,-12.22l195.25 0c6.72,0 12.2,5.49 12.2,12.22l0 206.31c0,6.73 5.48,12.22 12.2,12.22z';
const GLYPH_DOTS = [[1217.53, 1015.14], [892, 1015.14], [256.95, 618.74]];

const PAGE_MARGIN = 36;
const BASELINE_COLOR = COLORS.plum;

const format = (value: number) => value.toLocaleString('en');
const percent = (value: number, total: number) => (total ? `${Math.round((value / total) * 100)}%` : '0%');
// Inside Arabic text the bidi algorithm reverses "2026-10-22"; "/" keeps the digits in reading order.
const displayDate = (value: string) => value.replace(/-/g, '/');

function drawGlyph(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / GLYPH_VIEWBOX.size).translate(-GLYPH_VIEWBOX.x, -GLYPH_VIEWBOX.y);
  doc.path(GLYPH_PATH).fill(color, 'even-odd');
  for (const [dotX, dotY] of GLYPH_DOTS) doc.roundedRect(dotX, dotY, 217.02, 217.24, 12.2).fill(color);
  doc.restore();
}

/** Ring segment between two angles (radians, clockwise from 12 o'clock). */
function drawRingSegment(doc: PDFKit.PDFDocument, cx: number, cy: number, outer: number, inner: number, from: number, to: number, color: string) {
  if (to - from >= Math.PI * 2 - 1e-6) {
    doc.circle(cx, cy, outer).circle(cx, cy, inner).fill(color, 'even-odd');
    return;
  }
  const point = (radius: number, angle: number) => `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
  const large = to - from > Math.PI ? 1 : 0;
  doc.path(`M ${point(outer, from)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, to)} L ${point(inner, to)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, from)} Z`)
    .lineWidth(1.5)
    .fillAndStroke(color, COLORS.white);
}

/**
 * Branch statistics by source: the baseline stored before a date, one column per selected category/tag,
 * their sum ("all numbers") and the real de-duplicated customer count of each branch.
 */
export function writeSourceStatisticsPdf(response: Response, report: SourceStatisticsReport) {
  const { sources, rows } = report;
  const baselineDate = displayDate(report.baselineDate);
  const generatedDate = displayDate(report.generatedDate);
  const sourceTotal = (key: string) => rows.reduce((sum, row) => sum + (row.sources[key] || 0), 0);
  const rowSum = (row: SourceStatisticsRow) => row.baseline + sources.reduce((sum, source) => sum + (row.sources[source.key] || 0), 0);
  const totals = {
    baseline: rows.reduce((sum, row) => sum + row.baseline, 0),
    unique: rows.reduce((sum, row) => sum + row.unique, 0),
    all: rows.reduce((sum, row) => sum + rowSum(row), 0),
  };
  const added = Math.max(0, totals.unique - totals.baseline);

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="customer-statistics-${report.generatedDate}.pdf"`);
  response.setHeader('X-Export-Count', String(totals.unique));
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true });
  doc.pipe(response);
  doc.registerFont('ArabicRegular', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Regular.otf'));
  doc.registerFont('ArabicBold', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Bold.otf'));

  const width = doc.page.width;
  const height = doc.page.height;
  const contentWidth = width - PAGE_MARGIN * 2;
  const right = width - PAGE_MARGIN;
  // Long labels shrink to fit (down to 6pt) instead of being cut: the Arabic fonts have no ellipsis glyph.
  const text = (value: string, x: number, y: number, boxWidth: number, options: { size: number; color: string; bold?: boolean; align?: 'left' | 'right' | 'center' }) => {
    doc.font(options.bold ? 'ArabicBold' : 'ArabicRegular').fillColor(options.color);
    let size = options.size;
    while (size > 6 && doc.fontSize(size).widthOfString(value, { features: [] }) > boxWidth) size -= 0.5;
    const shrink = options.size - size;
    drawPdfText(doc.fontSize(size), value, x, y + shrink * 0.4, { width: boxWidth, align: options.align, ellipsis: true });
  };

  const paintPage = () => doc.rect(0, 0, width, height).fill(COLORS.page);

  const drawBrand = (y: number, glyphSize: number) => {
    drawGlyph(doc, right - glyphSize, y, glyphSize, COLORS.white);
    text('تيل بوت', right - glyphSize - 160, y + glyphSize * 0.08, 148, { size: glyphSize * 0.4, color: COLORS.white, bold: true });
    text('Tael Bot', right - glyphSize - 160, y + glyphSize * 0.58, 148, { size: glyphSize * 0.2, color: COLORS.lavender });
  };

  const drawChip = (x: number, y: number, chipWidth: number, label: string, value: string) => {
    doc.save().fillOpacity(0.12).roundedRect(x, y, chipWidth, 38, 9).fill(COLORS.white).restore();
    text(label, x + 10, y + 7, chipWidth - 20, { size: 7, color: COLORS.lavender });
    text(value, x + 10, y + 19, chipWidth - 20, { size: 10, color: COLORS.white, bold: true });
  };

  const drawBand = (bandHeight: number) => {
    const gradient = doc.linearGradient(0, 0, width, bandHeight);
    gradient.stop(0, COLORS.brand).stop(1, COLORS.plumDeep);
    doc.rect(0, 0, width, bandHeight).fill(gradient);
    doc.save().fillOpacity(0.07);
    doc.circle(70, bandHeight + 10, 95).fill(COLORS.white);
    doc.circle(210, -30, 70).fill(COLORS.white);
    doc.restore();
  };

  // ---------- Page 1: overview ----------
  paintPage();
  drawBand(124);
  drawBrand(24, 44);
  text('تقرير مصادر أرقام العملاء', right - 460, 80, 460, { size: 21, color: COLORS.white, bold: true });
  drawChip(PAGE_MARGIN, 26, 118, 'تاريخ التقرير', generatedDate);
  drawChip(PAGE_MARGIN + 126, 26, 118, 'أساس المقارنة: قبل', baselineDate);
  drawChip(PAGE_MARGIN + 252, 26, 82, 'الفروع', format(rows.length));
  text(
    [report.organizationName, 'توزيع الأرقام حسب الفروع ومصادر الإضافة'].filter(Boolean).join(' | '),
    PAGE_MARGIN, 136, contentWidth, { size: 9.5, color: COLORS.muted },
  );

  // KPI cards, right to left.
  const cards = [
    { label: 'العملاء بدون تكرار', value: format(totals.unique), note: `في ${format(rows.length)} فرع`, color: COLORS.plum, hero: true },
    { label: 'المخزّنة سابقاً', value: format(totals.baseline), note: `قبل ${baselineDate}`, color: BASELINE_COLOR },
    { label: 'صافي الإضافة', value: `+${format(added)}`, note: `نمو ${percent(added, totals.baseline)}`, color: COLORS.teal },
    ...sources.map((source) => ({
      label: source.name,
      value: format(sourceTotal(source.key)),
      note: `${source.type === 'tag' ? 'تاق' : 'فئة'}، ${percent(sourceTotal(source.key), totals.unique)} من العملاء`,
      color: source.color,
    })),
  ];
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * (cards.length - 1)) / cards.length;
  const cardY = 158;
  const cardHeight = 84;
  cards.forEach((card, index) => {
    const x = right - cardWidth - index * (cardWidth + cardGap);
    if (card.hero) {
      const gradient = doc.linearGradient(x, cardY, x + cardWidth, cardY + cardHeight);
      gradient.stop(0, COLORS.brand).stop(1, COLORS.plum);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 11).fill(gradient);
    } else {
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 11).lineWidth(0.8).fillAndStroke(COLORS.white, COLORS.line);
      doc.roundedRect(x + cardWidth - 5, cardY + 16, 3, cardHeight - 32, 1.5).fill(card.color);
    }
    const ink = card.hero ? COLORS.white : COLORS.ink;
    text(card.label, x + 10, cardY + 13, cardWidth - 22, { size: 7.5, color: card.hero ? COLORS.lavender : COLORS.muted, bold: true });
    text(card.value, x + 10, cardY + 31, cardWidth - 22, { size: cardWidth < 110 ? 15 : 18, color: ink, bold: true });
    text(card.note, x + 10, cardY + 62, cardWidth - 22, { size: 6.8, color: card.hero ? COLORS.lavender : COLORS.muted });
  });

  // Growth per branch (right panel).
  const panelY = 260;
  const panelHeight = height - panelY - 46;
  const growthWidth = 470;
  const growthX = right - growthWidth;
  doc.roundedRect(growthX, panelY, growthWidth, panelHeight, 12).lineWidth(0.8).fillAndStroke(COLORS.white, COLORS.line);
  text('النمو حسب الفرع', growthX + 16, panelY + 14, growthWidth - 32, { size: 12, color: COLORS.plum, bold: true });
  const legend = [{ label: 'المخزّنة سابقاً', color: BASELINE_COLOR }, { label: 'المضافة', color: COLORS.lilac }];
  legend.forEach((item, index) => {
    const lx = growthX + 16 + index * 90;
    doc.roundedRect(lx + 72, panelY + 19, 9, 9, 2).fill(item.color);
    text(item.label, lx, panelY + 18, 68, { size: 7.5, color: COLORS.muted });
  });
  // Largest branch first, on the chart and in the table.
  const ranked = [...rows].sort((a, b) => b.unique - a.unique || a.storeName.localeCompare(b.storeName, 'ar'));
  const listTop = panelY + 44;
  const rowHeight = Math.min(22, (panelHeight - 56) / Math.max(1, ranked.length));
  const nameWidth = 96;
  const valueWidth = 96;
  const barWidth = growthWidth - 32 - nameWidth - valueWidth - 12;
  const maxUnique = Math.max(1, ...ranked.map((row) => row.unique));
  ranked.forEach((row, index) => {
    const y = listTop + index * rowHeight;
    const barX = growthX + 16 + valueWidth + 6;
    const barHeight = Math.min(11, rowHeight - 7);
    const barY = y + (rowHeight - barHeight) / 2 - 2;
    text(row.storeName, growthX + growthWidth - 16 - nameWidth, y + 3, nameWidth, { size: 8, color: COLORS.ink, bold: true });
    doc.roundedRect(barX, barY, barWidth, barHeight, 3).fill(COLORS.soft);
    const baseWidth = (Math.min(row.baseline, row.unique) / maxUnique) * barWidth;
    const addedWidth = (Math.max(0, row.unique - row.baseline) / maxUnique) * barWidth;
    // Bars grow from the right (RTL): baseline first, then the added part.
    if (baseWidth > 0) doc.roundedRect(barX + barWidth - baseWidth, barY, Math.max(baseWidth, 2), barHeight, 3).fill(BASELINE_COLOR);
    if (addedWidth > 0) doc.roundedRect(barX + barWidth - baseWidth - addedWidth, barY, Math.max(addedWidth, 2), barHeight, 3).fill(COLORS.lilac);
    const growth = Math.max(0, row.unique - row.baseline);
    text(format(row.unique), growthX + 16 + 44, y + 3, valueWidth - 44, { size: 8, color: COLORS.ink, bold: true, align: 'left' });
    text(growth ? `+${format(growth)}` : '—', growthX + 16, y + 3.5, 42, { size: 7, color: COLORS.teal, align: 'left' });
  });

  // Composition of all numbers (left panel).
  const mixX = PAGE_MARGIN;
  const mixWidth = growthX - 14 - PAGE_MARGIN;
  doc.roundedRect(mixX, panelY, mixWidth, panelHeight, 12).lineWidth(0.8).fillAndStroke(COLORS.white, COLORS.line);
  text('مكوّنات إجمالي الأرقام', mixX + 16, panelY + 14, mixWidth - 32, { size: 12, color: COLORS.plum, bold: true });
  const segments = [
    { label: 'المخزّنة سابقاً', value: totals.baseline, color: BASELINE_COLOR },
    ...sources.map((source) => ({ label: source.name, value: sourceTotal(source.key), color: source.color })),
  ].filter((segment) => segment.value > 0);
  const cx = mixX + mixWidth / 2;
  const cy = panelY + 112;
  const outer = 66;
  const inner = 44;
  if (totals.all > 0) {
    let angle = 0;
    for (const segment of segments) {
      const sweep = (segment.value / totals.all) * Math.PI * 2;
      drawRingSegment(doc, cx, cy, outer, inner, angle, angle + sweep, segment.color);
      angle += sweep;
    }
  } else {
    doc.circle(cx, cy, outer).circle(cx, cy, inner).fill(COLORS.soft, 'even-odd');
  }
  text(format(totals.all), cx - inner, cy - 11, inner * 2, { size: 12, color: COLORS.ink, bold: true, align: 'center' });
  text('كل الأرقام', cx - inner, cy + 5, inner * 2, { size: 7, color: COLORS.muted, align: 'center' });
  const legendTop = cy + outer + 16;
  const legendRow = Math.min(17, (panelY + panelHeight - 12 - legendTop) / Math.max(1, segments.length));
  segments.forEach((segment, index) => {
    const y = legendTop + index * legendRow;
    doc.roundedRect(mixX + mixWidth - 26, y + 2, 9, 9, 2).fill(segment.color);
    text(segment.label, mixX + 104, y, mixWidth - 136, { size: 8, color: COLORS.ink });
    text(format(segment.value), mixX + 14, y, 52, { size: 7.5, color: COLORS.ink, bold: true, align: 'left' });
    text(percent(segment.value, totals.all), mixX + 68, y, 30, { size: 7.5, color: COLORS.muted, align: 'left' });
  });

  // ---------- Page 2+: branch table ----------
  const numericColumns = [
    { key: 'baseline', title: 'المخزّنة سابقاً', subtitle: `قبل ${baselineDate}`, color: BASELINE_COLOR },
    ...sources.map((source) => ({ key: source.key, title: source.name, subtitle: source.type === 'tag' ? 'تاق' : 'فئة', color: source.color })),
    { key: 'all', title: 'الإجمالي', subtitle: 'كل الأرقام', color: '' },
    { key: 'unique', title: 'الإجمالي', subtitle: 'بدون تكرار', color: '' },
  ];
  const branchWidth = 150;
  const columnWidth = (contentWidth - branchWidth) / numericColumns.length;
  const tableX = PAGE_MARGIN;
  const headerHeight = 40;
  const bodyRowHeight = 26;
  const uniqueX = tableX;
  const valueOf = (row: SourceStatisticsRow, key: string) =>
    key === 'baseline' ? row.baseline : key === 'unique' ? row.unique : key === 'all' ? rowSum(row) : row.sources[key] || 0;
  // Columns run right to left: branch name, then the numeric columns; "unique" ends up on the far left.
  const columnX = (index: number) => right - branchWidth - (index + 1) * columnWidth;

  const startTablePage = () => {
    doc.addPage();
    paintPage();
    drawBand(70);
    drawBrand(17, 34);
    text('تفاصيل الفروع حسب مصادر الأرقام', right - 560, 24, 340, { size: 15, color: COLORS.white, bold: true });
    drawChip(PAGE_MARGIN, 16, 118, 'تاريخ التقرير', generatedDate);
    let y = 90;
    doc.roundedRect(tableX, y, contentWidth, headerHeight, 9).fill(COLORS.plum);
    text('الفرع', right - branchWidth + 6, y + 14, branchWidth - 18, { size: 9, color: COLORS.white, bold: true });
    numericColumns.forEach((column, index) => {
      const x = columnX(index);
      if (column.key === 'unique') doc.save().fillOpacity(0.18).rect(x, y, columnWidth, headerHeight).fill(COLORS.white).restore();
      const titleWidth = columnWidth - 12 - (column.color ? 12 : 0);
      text(column.title, x + 6, y + 8, titleWidth, { size: 8.5, color: COLORS.white, bold: true, align: 'center' });
      if (column.color) doc.circle(x + columnWidth - 11, y + 13, 3.5).fill(column.color);
      text(column.subtitle, x + 6, y + 23, columnWidth - 12, { size: 6.8, color: COLORS.lavender, align: 'center' });
    });
    y += headerHeight;
    return y;
  };

  const drawBodyRow = (y: number, row: SourceStatisticsRow, index: number) => {
    doc.rect(tableX, y, contentWidth, bodyRowHeight).fill(index % 2 ? COLORS.zebra : COLORS.white);
    doc.rect(uniqueX, y, columnWidth, bodyRowHeight).fill(COLORS.soft);
    text(row.storeName, right - branchWidth + 6, y + 8, branchWidth - 18, { size: 9, color: COLORS.ink, bold: true });
    numericColumns.forEach((column, columnIndex) => {
      const value = valueOf(row, column.key);
      const strong = column.key === 'unique' || column.key === 'all';
      text(value ? format(value) : '—', columnX(columnIndex) + 4, y + 8, columnWidth - 8, {
        size: 9, align: 'center', bold: strong,
        color: column.key === 'unique' ? COLORS.brand : value ? COLORS.ink : COLORS.lavender,
      });
    });
    doc.moveTo(tableX, y + bodyRowHeight).lineTo(right, y + bodyRowHeight).lineWidth(0.4).stroke(COLORS.line);
  };

  let y = startTablePage();
  const footerSpace = 70;
  ranked.forEach((row, index) => {
    if (y + bodyRowHeight > height - footerSpace) y = startTablePage();
    drawBodyRow(y, row, index);
    y += bodyRowHeight;
  });
  if (y + 32 > height - footerSpace) y = startTablePage();
  doc.rect(tableX, y, contentWidth, 32).fill(COLORS.plumDeep);
  text('الإجمالي', right - branchWidth + 6, y + 10, branchWidth - 18, { size: 9.5, color: COLORS.white, bold: true });
  const grand: Record<string, number> = { baseline: totals.baseline, all: totals.all, unique: totals.unique };
  for (const source of sources) grand[source.key] = sourceTotal(source.key);
  numericColumns.forEach((column, index) => {
    text(format(grand[column.key] || 0), columnX(index) + 4, y + 10, columnWidth - 8, { size: 9.5, color: COLORS.white, bold: true, align: 'center' });
  });
  y += 32;

  const notes = [
    `المخزّنة سابقاً: عملاء الفرع المسجلون قبل ${baselineDate}.`,
    'أعمدة الفئات والتاقات: عملاء الفرع المرتبطون بكل منها، وقد يظهر العميل نفسه في أكثر من عمود.',
    'الإجمالي (كل الأرقام) = المخزّنة سابقاً + مجموع الأعمدة، أما «بدون تكرار» فهو العدد الفعلي لعملاء الفرع.',
  ];
  const notesHeight = 18 + notes.length * 15;
  if (y + 14 + notesHeight > height - 40) y = startTablePage();
  y += 14;
  doc.roundedRect(tableX, y, contentWidth, notesHeight, 9).fill(COLORS.soft);
  notes.forEach((note, index) => text(note, tableX + 14, y + 10 + index * 15, contentWidth - 28, { size: 8, color: COLORS.muted }));

  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    doc.moveTo(PAGE_MARGIN, height - 30).lineTo(right, height - 30).lineWidth(0.5).stroke(COLORS.line);
    text(`${index + 1} / ${pages.count}`, PAGE_MARGIN, height - 22, contentWidth, { size: 7.5, color: COLORS.muted, align: 'center' });
    text('taelbot.com', PAGE_MARGIN, height - 22, 120, { size: 7.5, color: COLORS.muted, align: 'left' });
    text('تيل بوت | تقرير داخلي', right - 200, height - 22, 200, { size: 7.5, color: COLORS.muted });
  }
  doc.end();
}
