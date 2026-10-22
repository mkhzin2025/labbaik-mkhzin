import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import express from 'express';
import PDFDocument from 'pdfkit';
import request from 'supertest';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';
import { CustomerCategory } from './entities/customer-category.entity';
import { CustomerTag } from './entities/customer-tag.entity';

describe('Customer PDF exports', () => {
  const query = jest.fn();
  let service: CustomersService;
  let text: jest.SpyInstance<
    PDFKit.PDFDocument,
    [
      string,
      (number | PDFKit.Mixins.TextOptions)?,
      number?,
      PDFKit.Mixins.TextOptions?,
    ]
  >;

  beforeEach(async () => {
    query.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: { query } },
        { provide: getRepositoryToken(CustomerCategory), useValue: {} },
        { provide: getRepositoryToken(CustomerTag), useValue: {} },
      ],
    }).compile();
    service = module.get(CustomersService);
    text = jest.spyOn(PDFDocument.prototype as PDFKit.PDFDocument, 'text');
  });

  afterEach(() => text.mockRestore());

  async function exportPdf(
    exportType: 'customers' | 'statistics',
    extra: { sources?: string[]; baselineDate?: string } = {},
  ) {
    const app = express();
    app.get('/export', (req, res, next) => {
      void service
        .exportCustomers(res, {
          organizationId: 'organization',
          storeIds: ['store'],
          format: 'pdf',
          exportType,
          ...extra,
        })
        .catch(next);
    });
    const response = await request(app)
      .get('/export')
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    const body: unknown = response.body;
    if (!Buffer.isBuffer(body)) throw new Error('Expected a PDF buffer');
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.toString('latin1')).toMatch(/%%EOF\s*$/);
    return body;
  }

  it('exports customer rows with registered fonts, RTL columns, and stable pagination', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      fullName: 'سارة محمد',
      phoneNumber: '+966501234567',
      email: 'sara@example.com',
      storeName: 'الفرع الرئيسي',
      categoryNames: 'عملاء جدد',
      tagNames: 'VIP',
      createdAt: new Date('2026-10-22T00:00:00Z'),
    }));
    query
      .mockResolvedValueOnce([{ total: rows.length }])
      .mockResolvedValueOnce(rows);
    const pdf = await exportPdf('customers');
    expect(pdf.toString('latin1')).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2\b/);
    const headings = text.mock.calls
      .filter(
        ([value, , , options]) =>
          ['الاسم', 'رقم الجوال', 'البريد', 'الفرع'].includes(value) &&
          options?.features,
      )
      .slice(0, 4);
    expect(headings.map(([value]) => value)).toEqual([
      'الاسم',
      'رقم الجوال',
      'البريد',
      'الفرع',
    ]);
    const positions = headings.map(([, x]) => {
      if (typeof x !== 'number')
        throw new Error('Expected an explicit X coordinate');
      return x;
    });
    expect(positions[0]).toBeGreaterThan(positions[1]);
    expect(positions[1]).toBeGreaterThan(positions[2]);
    expect(positions[2]).toBeGreaterThan(positions[3]);
    expect(text.mock.calls.some(([value]) => value === 'سارة محمد')).toBe(true);
    expect(text.mock.calls.some(([value]) => value === '+966501234567')).toBe(
      true,
    );
    expect(
      text.mock.calls.some(([value]) => value === 'sara@example.com'),
    ).toBe(true);
    expect(
      text.mock.calls.filter(
        ([value]) => value === '1 / 2' || value === '2 / 2',
      ),
    ).toHaveLength(2);
  });

  it('builds the branch report with baseline, one column per category/tag, and both totals', async () => {
    const category = '11111111-1111-4111-8111-111111111111';
    const tag = '22222222-2222-4222-8222-222222222222';
    query
      .mockResolvedValueOnce([
        { type: 'category', id: category, name: 'المسابقة', color: '#dc2626' },
        { type: 'tag', id: tag, name: 'نقاط البيع 10-2026', color: '#64748b' },
      ])
      .mockResolvedValueOnce([{ name: 'مخازن' }])
      .mockResolvedValueOnce([
        { storeId: 'store', storeName: 'بريدة', baseline: 1000, unique: 1300 },
      ])
      .mockResolvedValueOnce([
        { storeId: 'store', key: `category:${category}`, total: 400 },
        { storeId: 'store', key: `tag:${tag}`, total: 120 },
      ]);
    const pdf = await exportPdf('statistics', {
      sources: [`tag:${tag}`, `category:${category}`],
      baselineDate: '2026-10-22',
    });
    expect(pdf.toString('latin1')).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2\b/);
    const [, baseParams] = query.mock.calls[2] as [string, unknown[]];
    expect(baseParams).toEqual(['organization', ['store'], '2026-10-22T00:00:00+03:00']);
    const drawn = (label: string) =>
      text.mock.calls.some(([value, , , options]) => value === label && options?.features);
    for (const label of [
      'تقرير مصادر أرقام العملاء',
      'تفاصيل الفروع حسب مصادر الأرقام',
      'بريدة',
      'المسابقة',
      'بدون تكرار',
      // baseline + both sources, and the real branch count
      '1,520',
      '1,300',
      '+300',
    ]) {
      expect(drawn(label)).toBe(true);
    }
    expect(
      text.mock.calls.filter(
        ([value]) => value === '1 / 2' || value === '2 / 2',
      ),
    ).toHaveLength(2);
  });
});
