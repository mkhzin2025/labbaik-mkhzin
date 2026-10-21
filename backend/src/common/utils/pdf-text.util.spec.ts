import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { drawPdfText } from './pdf-text.util';

describe('drawPdfText', () => {
  let doc: PDFKit.PDFDocument;
  let text: jest.SpyInstance<
    PDFKit.PDFDocument,
    [
      string,
      (number | PDFKit.Mixins.TextOptions)?,
      number?,
      PDFKit.Mixins.TextOptions?,
    ]
  >;

  beforeEach(() => {
    doc = new PDFDocument();
    doc
      .font(join(process.cwd(), 'assets', 'fonts', 'Tajarib-Regular.otf'))
      .fontSize(12);
    text = jest.spyOn(doc, 'text');
    doc.resume();
  });

  afterEach(() => {
    doc.end();
    text.mockRestore();
  });

  it('shapes a complete Arabic phrase instead of independent words', () => {
    drawPdfText(doc, 'تاريخ التصدير', 20, 30, { width: 300 });
    expect(text).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith('تاريخ التصدير', expect.any(Number), 30, {
      features: [],
      lineBreak: false,
    });
    const width = doc.widthOfString('تاريخ التصدير', { features: [] });
    const x = text.mock.calls[0][1];
    if (typeof x !== 'number')
      throw new Error('Expected an explicit X coordinate');
    expect(x + width).toBeCloseTo(320);
  });

  it('orders mixed runs visually without reversing digits or Latin letters', () => {
    drawPdfText(doc, 'فرع 12 VIP', 20, 30, { width: 300 });
    expect(text.mock.calls.map(([value]) => value)).toEqual([
      'VIP',
      ' ',
      '12',
      'فرع ',
    ]);
    const positions = text.mock.calls.map(([, x]) => {
      if (typeof x !== 'number')
        throw new Error('Expected an explicit X coordinate');
      return x;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('mirrors parentheses around a number in Arabic text', () => {
    drawPdfText(doc, 'VIP فرع (12)', 20, 30, { width: 300 });
    expect(text.mock.calls.map(([value]) => value)).toEqual([
      '(',
      '12',
      ' فرع )',
      'VIP',
    ]);
  });

  it.each([
    '+966501234567',
    'sara@example.com',
    '2026-10-22',
    '692,247',
    '75%',
  ])('preserves the LTR value %s', (value) => {
    drawPdfText(doc, value, 20, 30, { width: 300, align: 'left' });
    expect(text).toHaveBeenCalledWith(value, 20, 30, {
      features: [],
      lineBreak: false,
    });
  });

  it('fits long Arabic content inside the cell with an ellipsis at the visual end', () => {
    drawPdfText(doc, 'الفرع الرئيسي لخدمة العملاء في مدينة الرياض', 20, 30, {
      width: 55,
      ellipsis: true,
    });
    const values = text.mock.calls.map(([value]) => value);
    expect(values.join('')).toContain('\u2026');
    const measured = values.reduce(
      (sum, value) => sum + doc.widthOfString(value, { features: [] }),
      0,
    );
    expect(measured).toBeLessThanOrEqual(55);
    expect(text.mock.calls[0][1]).toBeGreaterThanOrEqual(20);
  });

  it('does not add a page when drawing below the bottom text margin', () => {
    const pageAdded = jest.fn();
    doc.on('pageAdded', pageAdded);
    drawPdfText(doc, '1 / 2', 20, doc.page.height - 21, {
      width: 300,
      align: 'center',
    });
    expect(pageAdded).not.toHaveBeenCalled();
  });

  it('normalizes multiline data without leaking direction controls', () => {
    drawPdfText(doc, '\u200fسارة\nمحمد', 20, 30, { width: 300 });
    expect(text.mock.calls.map(([value]) => value).join('')).toBe('سارة محمد');
  });

  it('does not draw absent values', () => {
    drawPdfText(doc, null, 20, 30, { width: 300 });
    expect(text).not.toHaveBeenCalled();
  });
});
