import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { isAgeTagAbove, posTagMonth, writeSummaryReportExcel, SUMMARY_NOTE } from './customers-summary-report';

describe('summary report', () => {
  it('keeps only age tags above 35', () => {
    expect(isAgeTagAbove('عمر 36 إلى 45')).toBe(true);
    expect(isAgeTagAbove('عمر أكثر من 45')).toBe(true);
    expect(isAgeTagAbove('عمر 26 إلى 35')).toBe(false);
    expect(isAgeTagAbove('عمر 18 إلى 25')).toBe(false);
    expect(isAgeTagAbove('عمر أقل من 18')).toBe(false);
  });

  it('reads the month of a point-of-sale tag in either order', () => {
    expect(posTagMonth('نقاط البيع 11-2026')).toBe(202611);
    expect(posTagMonth('نقاط البيع 2026-10')).toBe(202610);
    expect(posTagMonth('نقاط البيع')).toBe(0);
  });

  it('writes one row per branch, the totals and the note', async () => {
    const stream = new PassThrough() as any;
    stream.setHeader = jest.fn();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise((resolve) => stream.on('end', resolve));
    await writeSummaryReportExcel(stream, {
      date: '2026-11-22',
      newTagName: 'نقاط البيع 11-2026',
      rows: [
        { storeName: 'طويق', old: 100, fresh: 20, comp35: 30, app: 5 },
        { storeName: 'تبوك', old: 50, fresh: 10, comp35: 0, app: 1 },
      ],
    });
    await finished;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as any);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('A2').value).toBe('ارقام المسابقة مع الكاشيرات تاريخ 22 / 11 / 2026');
    expect(sheet.getRow(5).values).toEqual([undefined, 'طويق', 100, 20, 120, 30, 5, 155, SUMMARY_NOTE]);
    expect(sheet.getRow(7).values).toEqual([undefined, 'الإجمالي', 150, 30, 180, 30, 6, 216, '']);
  });
});
