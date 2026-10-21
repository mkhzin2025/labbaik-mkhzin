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

  async function exportPdf(exportType: 'customers' | 'statistics') {
    const app = express();
    app.get('/export', (req, res, next) => {
      void service
        .exportCustomers(res, {
          organizationId: 'organization',
          storeIds: ['store'],
          format: 'pdf',
          exportType,
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

  it('applies the same Arabic layout to the statistics dashboard and detail table', async () => {
    query.mockResolvedValueOnce([
      {
        storeId: 'store',
        storeName: 'الفرع الرئيسي',
        total: 1234,
        withPhone: 1200,
        withEmail: 500,
        withTags: 600,
        withCategories: 700,
        marketingOptOut: 12,
      },
    ]);
    const pdf = await exportPdf('statistics');
    expect(pdf.toString('latin1')).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2\b/);
    for (const label of [
      'إحصائيات العملاء',
      'تاريخ التصدير',
      'توزيع العملاء حسب الفروع',
      'الفرع الرئيسي',
      'تفاصيل الفروع',
    ]) {
      expect(
        text.mock.calls.some(
          ([value, , , options]) => value === label && options?.features,
        ),
      ).toBe(true);
    }
    expect(
      text.mock.calls.filter(
        ([value]) => value === '1 / 2' || value === '2 / 2',
      ),
    ).toHaveLength(2);
  });
});
