import type { Response } from 'express';
import ExcelJS from 'exceljs';

/**
 * Compact "competition with cashiers" report: one row per branch, every customer counted once, by priority:
 *   1. new        — carries the current point-of-sale tag (e.g. "نقاط البيع 11-2026")
 *   2. old        — carries an older point-of-sale tag, or is in neither the competition nor the app
 *   3. comp35     — in a competition category with an age tag above 35
 *   4. app        — in the app category
 *   competition customers aged 35 or under (or without an age) are left out.
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
  legend.getCell(1).value = `الأرقام الجديدة: ${report.newTagName}. ارقام الكاشيرات القديمة: نقاط البيع السابقة وكل الداتا القديمة. كل عميل محسوب مرة واحدة.`;
  legend.getCell(1).font = { size: 10, color: { argb: 'FF6B6B6B' } };
  legend.getCell(1).alignment = { horizontal: 'right' };

  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', `attachment; filename="competition-cashiers-${report.date}.xlsx"`);
  await workbook.xlsx.write(response);
  response.end();
}
