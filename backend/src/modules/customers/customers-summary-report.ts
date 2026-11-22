import { join } from 'node:path';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { drawPdfText } from '../../common/utils/pdf-text.util';
import { COLORS, PAGE_MARGIN, displayDate, drawGlyph } from './customers-statistics-pdf';

/**
 * Compact "competition with cashiers" report: one row per branch, every customer counted once, by priority:
 *   1. new        — carries the current point-of-sale tag (e.g. "نقاط البيع 11-2026")
 *   2. old        — carries an older point-of-sale tag, or was not brought by the competition or the app
 *                   (stored before that source started, or never linked to it)
 *   3. comp35     — came from the competition (added after it started) with an age tag above 35
 *   4. app        — came from the app (added after it started)
 *   competition newcomers aged 35 or under (or without an age) are left out.
 */

export const POS_TAG_PREFIX = 'نقاط البيع';
export const APP_CATEGORY = 'التطبيق';
export const SUMMARY_AGE_LIMIT = 35;
export const SUMMARY_NOTE = `استبعدنا جميع الفئات تحت ${SUMMARY_AGE_LIMIT} سنه`;

export type SummaryRow = { storeName: string; old: number; fresh: number; comp35: number; app: number };
export type SummaryReport = { date: string; newTagName: string; rows: SummaryRow[] };

/** "عمر 36 إلى 45" and "عمر أكثر من 45" are above 35; "عمر 26 إلى 35" and "عمر أقل من 18" are not. */
export function isAgeTagAbove(name: string, limit = SUMMARY_AGE_LIMIT) {
  const text = name.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const numbers = (text.match(/\d+/g) || []).map(Number);
  if (!numbers.length || /أقل|اقل|تحت/.test(text)) return false;
  if (/أكثر|اكثر|فوق/.test(text)) return numbers[0] >= limit;
  return Math.min(...numbers) > limit;
}

/** The month a point-of-sale tag stands for ("نقاط البيع 11-2026" → 202611), to find the newest one. */
export function posTagMonth(name: string) {
  const match = name.match(/(\d{1,2})\s*[-/]\s*(\d{4})|(\d{4})\s*[-/]\s*(\d{1,2})/);
  if (!match) return 0;
  const [month, year] = match[1] ? [Number(match[1]), Number(match[2])] : [Number(match[4]), Number(match[3])];
  return month >= 1 && month <= 12 ? year * 100 + month : 0;
}

export async function writeSummaryReportExcel(response: Response, report: SummaryReport) {
  const [year, month, day] = report.date.split('-');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tael Bot';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('التقرير', { views: [{ rightToLeft: true, showGridLines: false }] });
  sheet.columns = [
    { width: 14 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 34 },
  ];

  sheet.mergeCells('A2:H2');
  const title = sheet.getCell('A2');
  title.value = `ارقام المسابقة مع الكاشيرات تاريخ ${Number(day)} / ${Number(month)} / ${year}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 26;

  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
  };
  const headers = ['الفروع', 'ارقام الكاشيرات القديمة', 'الأرقام الجديدة', 'الإجمالي', `ارقام المسابقة فوق ${SUMMARY_AGE_LIMIT}`, 'التطبيق', 'الإجمالي', 'ملاحظة'];
  const header = sheet.getRow(4);
  headers.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8DD3F0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 24;

  const values = (row: Omit<SummaryRow, 'storeName'>) => {
    const cashiers = row.old + row.fresh;
    return [row.old, row.fresh, cashiers, row.comp35, row.app, cashiers + row.comp35 + row.app];
  };
  report.rows.forEach((row, index) => {
    const line = sheet.getRow(5 + index);
    [row.storeName, ...values(row), SUMMARY_NOTE].forEach((value, column) => {
      const cell = line.getCell(column + 1);
      cell.value = value;
      cell.font = { size: 12, bold: column === 0 };
      cell.alignment = { horizontal: column === 7 ? 'right' : 'center', vertical: 'middle' };
      cell.border = border;
      if (typeof value === 'number') cell.numFmt = '#,##0';
    });
    line.height = 20;
  });

  const sum = (key: keyof Omit<SummaryRow, 'storeName'>) => report.rows.reduce((total, row) => total + row[key], 0);
  const totals = sheet.getRow(5 + report.rows.length);
  ['الإجمالي', ...values({ old: sum('old'), fresh: sum('fresh'), comp35: sum('comp35'), app: sum('app') }), ''].forEach((value, column) => {
    const cell = totals.getCell(column + 1);
    cell.value = value;
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border;
    if (typeof value === 'number') cell.numFmt = '#,##0';
  });
  totals.height = 22;

  const legend = sheet.getRow(7 + report.rows.length);
  sheet.mergeCells(legend.number, 1, legend.number, 8);
  legend.getCell(1).value = `الأرقام الجديدة: ${report.newTagName}. ارقام الكاشيرات القديمة: نقاط البيع السابقة وكل الداتا القديمة (حتى من شارك منهم في المسابقة لاحقاً). كل عميل محسوب مرة واحدة.`;
  legend.getCell(1).font = { size: 10, color: { argb: 'FF6B6B6B' } };
  legend.getCell(1).alignment = { horizontal: 'right' };

  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', `attachment; filename="competition-cashiers-${report.date}.xlsx"`);
  await workbook.xlsx.write(response);
  response.end();
}

/** The same table as the Excel file, on a single Tael Bot–branded landscape page. */
export function writeSummaryReportPdf(response: Response, report: SummaryReport) {
  const date = displayDate(report.date);
  // "11-2026" flips to "2026-11" inside Arabic text; "/" keeps the month first.
  const tagName = report.newTagName.replace(/(\d+)-(\d+)/g, '$1/$2');
  const sum = (key: keyof Omit<SummaryRow, 'storeName'>) => report.rows.reduce((total, row) => total + row[key], 0);
  const totals = { old: sum('old'), fresh: sum('fresh'), comp35: sum('comp35'), app: sum('app') };
  const cashiers = totals.old + totals.fresh;
  const grand = cashiers + totals.comp35 + totals.app;

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="competition-cashiers-${report.date}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.pipe(response);
  doc.registerFont('ArabicRegular', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Regular.otf'));
  doc.registerFont('ArabicBold', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Bold.otf'));

  const width = doc.page.width;
  const height = doc.page.height;
  const right = width - PAGE_MARGIN;
  const contentWidth = width - PAGE_MARGIN * 2;
  const n = (value: number) => value.toLocaleString('en');
  const text = (value: string, x: number, y: number, boxWidth: number, options: { size: number; color: string; bold?: boolean; align?: 'left' | 'right' | 'center' }) => {
    doc.font(options.bold ? 'ArabicBold' : 'ArabicRegular').fillColor(options.color);
    let size = options.size;
    while (size > 6 && doc.fontSize(size).widthOfString(value, { features: [] }) > boxWidth) size -= 0.5;
    drawPdfText(doc.fontSize(size), value, x, y + (options.size - size) * 0.4, { width: boxWidth, align: options.align, ellipsis: true });
  };
  const chip = (x: number, y: number, chipWidth: number, label: string, value: string) => {
    doc.save().fillOpacity(0.12).roundedRect(x, y, chipWidth, 38, 9).fill(COLORS.white).restore();
    text(label, x + 10, y + 7, chipWidth - 20, { size: 7, color: COLORS.lavender });
    text(value, x + 10, y + 19, chipWidth - 20, { size: 10, color: COLORS.white, bold: true });
  };
  const band = (bandHeight: number, title: string, titleSize: number) => {
    doc.rect(0, 0, width, height).fill(COLORS.page);
    const gradient = doc.linearGradient(0, 0, width, bandHeight);
    gradient.stop(0, COLORS.brand).stop(1, COLORS.plumDeep);
    doc.rect(0, 0, width, bandHeight).fill(gradient);
    doc.save().fillOpacity(0.07);
    doc.circle(70, bandHeight + 10, 95).fill(COLORS.white);
    doc.circle(210, -30, 70).fill(COLORS.white);
    doc.restore();
    const glyph = bandHeight > 90 ? 40 : 32;
    drawGlyph(doc, right - glyph, 20, glyph, COLORS.white);
    text('تيل بوت', right - glyph - 150, 20 + glyph * 0.08, 140, { size: glyph * 0.4, color: COLORS.white, bold: true });
    text('Tael Bot', right - glyph - 150, 20 + glyph * 0.58, 140, { size: glyph * 0.2, color: COLORS.lavender });
    text(title, right - 520, bandHeight > 90 ? 72 : 26, bandHeight > 90 ? 520 : 300, { size: titleSize, color: COLORS.white, bold: true });
    chip(PAGE_MARGIN, 20, 104, 'تاريخ التقرير', date);
    chip(PAGE_MARGIN + 112, 20, 150, 'الأرقام الجديدة', tagName);
    if (bandHeight > 90) chip(PAGE_MARGIN + 270, 20, 70, 'الفروع', n(report.rows.length));
  };

  // ---------- Header and summary cards ----------
  band(112, 'ارقام المسابقة مع الكاشيرات', 20);
  const cards = [
    { label: 'الإجمالي', value: grand, note: 'كل عميل مرة واحدة', color: COLORS.plum, hero: true },
    { label: 'ارقام الكاشيرات القديمة', value: totals.old, note: 'نقاط البيع السابقة والداتا القديمة', color: COLORS.plum },
    { label: 'الأرقام الجديدة', value: totals.fresh, note: tagName, color: COLORS.teal },
    { label: 'إجمالي الكاشيرات', value: cashiers, note: 'القديمة + الجديدة', color: COLORS.brand },
    { label: `المسابقة فوق ${SUMMARY_AGE_LIMIT}`, value: totals.comp35, note: 'المسابقة والمسابقة أونلاين', color: '#D97706' },
    { label: 'التطبيق', value: totals.app, note: 'عملاء التطبيق', color: '#2563EB' },
  ];
  const gap = 10;
  const cardWidth = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const cardY = 126;
  const cardHeight = 66;
  cards.forEach((card, index) => {
    const x = right - cardWidth - index * (cardWidth + gap);
    if (card.hero) {
      const gradient = doc.linearGradient(x, cardY, x + cardWidth, cardY + cardHeight);
      gradient.stop(0, COLORS.brand).stop(1, COLORS.plum);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 11).fill(gradient);
    } else {
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 11).lineWidth(0.8).fillAndStroke(COLORS.white, COLORS.line);
      doc.roundedRect(x + cardWidth - 5, cardY + 14, 3, cardHeight - 28, 1.5).fill(card.color);
    }
    text(card.label, x + 10, cardY + 10, cardWidth - 22, { size: 7.5, color: card.hero ? COLORS.lavender : COLORS.muted, bold: true });
    text(n(card.value), x + 10, cardY + 25, cardWidth - 22, { size: 17, color: card.hero ? COLORS.white : COLORS.ink, bold: true });
    text(card.note, x + 10, cardY + 48, cardWidth - 22, { size: 6.5, color: card.hero ? COLORS.lavender : COLORS.muted });
  });

  // ---------- Branch table ----------
  const columns: { title: string; value: (row: Omit<SummaryRow, 'storeName'>) => number; strong?: boolean }[] = [
    { title: 'ارقام الكاشيرات القديمة', value: (row) => row.old },
    { title: 'الأرقام الجديدة', value: (row) => row.fresh },
    { title: 'الإجمالي', value: (row) => row.old + row.fresh, strong: true },
    { title: `ارقام المسابقة فوق ${SUMMARY_AGE_LIMIT}`, value: (row) => row.comp35 },
    { title: 'التطبيق', value: (row) => row.app },
    { title: 'الإجمالي', value: (row) => row.old + row.fresh + row.comp35 + row.app, strong: true },
  ];
  const branchWidth = 150;
  const columnWidth = (contentWidth - branchWidth) / columns.length;
  const columnX = (index: number) => right - branchWidth - (index + 1) * columnWidth;
  const headerHeight = 30;
  const totalHeight = 28;
  const noteHeight = 30;
  const bottom = 24;

  const tableHeader = (y: number) => {
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, headerHeight, 8).fill(COLORS.plum);
    text('الفروع', right - branchWidth + 8, y + 10, branchWidth - 20, { size: 9.5, color: COLORS.white, bold: true });
    columns.forEach((column, index) => {
      if (column.strong) doc.save().fillOpacity(0.16).rect(columnX(index), y, columnWidth, headerHeight).fill(COLORS.white).restore();
      text(column.title, columnX(index) + 4, y + 10, columnWidth - 8, { size: 8.5, color: COLORS.white, bold: true, align: 'center' });
    });
    return y + headerHeight;
  };

  let y = tableHeader(cardY + cardHeight + 16);
  // Always one page: the rows share whatever height is left, and the text shrinks with them.
  const room = height - bottom - noteHeight - totalHeight - 12 - y;
  const rowHeight = Math.min(26, room / Math.max(1, report.rows.length));
  const rowSize = Math.max(5, Math.min(9.5, rowHeight * 0.45));
  report.rows.forEach((row, index) => {
    doc.rect(PAGE_MARGIN, y, contentWidth, rowHeight).fill(index % 2 ? COLORS.zebra : COLORS.white);
    columns.forEach((column, columnIndex) => {
      if (column.strong) doc.rect(columnX(columnIndex), y, columnWidth, rowHeight).fill(COLORS.soft);
    });
    const textY = y + (rowHeight - rowSize * 1.05) / 2;
    text(row.storeName, right - branchWidth + 8, textY, branchWidth - 20, { size: rowSize, color: COLORS.ink, bold: true });
    columns.forEach((column, columnIndex) => {
      const value = column.value(row);
      text(n(value), columnX(columnIndex) + 4, textY, columnWidth - 8, {
        size: rowSize, align: 'center', bold: column.strong, color: column.strong ? COLORS.brand : value ? COLORS.ink : COLORS.lavender,
      });
    });
    doc.moveTo(PAGE_MARGIN, y + rowHeight).lineTo(right, y + rowHeight).lineWidth(0.4).stroke(COLORS.line);
    y += rowHeight;
  });

  doc.rect(PAGE_MARGIN, y, contentWidth, totalHeight).fill('#F5B700');
  text('الإجمالي', right - branchWidth + 8, y + 9, branchWidth - 20, { size: 10, color: COLORS.plumDeep, bold: true });
  columns.forEach((column, index) => {
    text(n(column.value(totals)), columnX(index) + 4, y + 9, columnWidth - 8, { size: 10, color: COLORS.plumDeep, bold: true, align: 'center' });
  });
  y += totalHeight + 12;

  doc.roundedRect(PAGE_MARGIN, y, contentWidth, noteHeight, 8).fill(COLORS.soft);
  text(
    `ملاحظة: ${SUMMARY_NOTE}. كل عميل محسوب مرة واحدة. الأرقام الجديدة = ${tagName}، والكاشيرات القديمة = نقاط البيع السابقة وكل الداتا القديمة حتى من شارك منهم في المسابقة لاحقاً.`,
    PAGE_MARGIN + 14, y + 10, contentWidth - 28, { size: 8.5, color: COLORS.muted },
  );
  doc.end();
}
