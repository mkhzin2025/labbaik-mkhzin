import { normalizePhoneNumber } from '../../common/utils/phone.util';
import { drawPdfText } from '../../common/utils/pdf-text.util';
import { SourceStatisticsReport, SourceStatisticsRow, StatisticsSource, writeSourceStatisticsPdf } from './customers-statistics-pdf';
import { AGE_TAG_PREFIX, COMPETITION_CATEGORY, COMPETITION_ONLINE_CATEGORY } from './competition-sync.plan';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import {
  CreateCustomerCategoryDto,
  CreateCustomerDto,
  CreateCustomerTagDto,
  UpdateCustomerCategoryDto,
  UpdateCustomerDto,
  UpdateCustomerTagDto,
} from './dto/customer.dto';
import { Store } from '../stores/entities/store.entity';
import { CustomerCategory, CustomerTaxonomyScope } from './entities/customer-category.entity';
import { CustomerTag } from './entities/customer-tag.entity';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { join } from 'node:path';

export type CustomerFilters = {
  search?: string;
  categoryIds?: string[];
  tagIds?: string[];
  /** 'all' keeps only customers carrying every selected tag; the default matches any of them. */
  tagMatch?: 'any' | 'all';
  excludeCategoryIds?: string[];
  excludeTagIds?: string[];
  customerIds?: string[];
  excludeCustomerIds?: string[];
  whatsappOnly?: boolean;
  storeIds?: string[];
};

/** One WhatsApp-reachable customer of a campaign audience, without relations. */
export type AudienceRow = {
  id: string;
  storeId: string;
  storeName: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  whatsappId: string | null;
  email: string | null;
  marketingOptOut: boolean;
  updatedAt: Date;
};

/** Maps a campaign audience to customer filters within the branches the caller may use. */
export function audienceToFilters(
  audience: { mode: 'all' | 'segment' | 'manual'; categoryIds?: string[]; tagIds?: string[]; tagMatch?: 'any' | 'all'; excludeCategoryIds?: string[]; excludeTagIds?: string[]; customerIds?: string[]; excludeCustomerIds?: string[] },
  storeIds: string[],
): CustomerFilters {
  if (audience.mode === 'manual') return { storeIds, customerIds: audience.customerIds || [] };
  const filters: CustomerFilters = { storeIds, excludeCustomerIds: audience.excludeCustomerIds };
  if (audience.mode === 'segment') {
    if (!audience.categoryIds?.length && !audience.tagIds?.length && !audience.excludeCategoryIds?.length && !audience.excludeTagIds?.length) {
      throw new BadRequestException('اختر فئة أو تاقًا واحدًا على الأقل لتحديد الشريحة.');
    }
    Object.assign(filters, {
      categoryIds: audience.categoryIds,
      tagIds: audience.tagIds,
      tagMatch: audience.tagMatch,
      excludeCategoryIds: audience.excludeCategoryIds,
      excludeTagIds: audience.excludeTagIds,
    });
  }
  return filters;
}

/** Largest audience a single campaign may target. */
export const AUDIENCE_LIMIT = 50000;
/** The legacy unpaged `GET /customers` returns at most this many rows. */
const UNPAGED_LIST_LIMIT = 2000;

export type CustomerSegment = 'all' | 'categorized' | 'uncategorized' | 'tagged' | 'untagged';
export type CustomerSortKey = 'fullName' | 'phoneNumber' | 'createdAt' | 'updatedAt';

export type CustomerPageOptions = {
  page: number;
  limit: number;
  segment?: CustomerSegment;
  sort?: CustomerSortKey;
  dir?: 'asc' | 'desc';
};

const SORT_COLUMNS: Record<CustomerSortKey, string> = {
  fullName: 'customer.fullName',
  phoneNumber: 'customer.phoneNumber',
  createdAt: 'customer.createdAt',
  updatedAt: 'customer.updatedAt',
};

const HAS_CATEGORY = 'EXISTS (SELECT 1 FROM customer_category_links ccl WHERE ccl."customerId" = customer.id)';
const HAS_TAG = 'EXISTS (SELECT 1 FROM customer_tag_links ctl WHERE ctl."customerId" = customer.id)';
const PDF_EXPORT_LIMIT = 5000;
const EXPORT_BATCH_SIZE = 5000;

type CustomerExportOptions = {
  organizationId: string;
  storeIds: string[];
  tagId?: string;
  format: 'xlsx' | 'pdf';
  exportType: 'customers' | 'statistics';
  /** Statistics PDF columns, in order: "category:<id>" / "tag:<id>". */
  sources?: string[];
  /** Statistics PDF: customers created before this day (YYYY-MM-DD, Riyadh) count as "stored before". */
  baselineDate?: string;
  /** Statistics PDF: add one detail page per branch. */
  branchDetails?: boolean;
};

const STATISTICS_SOURCE_LIMIT = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const riyadhDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(date);

type CustomerExportRow = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  storeName: string;
  tagNames: string;
  categoryNames: string;
};

type CustomerExportStatistic = {
  storeId: string;
  storeName: string;
  total: number;
  withPhone: number;
  withEmail: number;
  withTags: number;
  withCategories: number;
  marketingOptOut: number;
};

@Injectable()
export class CustomersService implements OnModuleInit {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerCategory)
    private readonly categoryRepository: Repository<CustomerCategory>,
    @InjectRepository(CustomerTag)
    private readonly tagRepository: Repository<CustomerTag>,
  ) {}

  private registerPdfFonts(doc: PDFKit.PDFDocument) {
    doc.registerFont('ArabicRegular', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Regular.otf'));
    doc.registerFont('ArabicBold', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Bold.otf'));
    doc.font('ArabicRegular');
  }

  // Same convention as StoresService: add new columns idempotently on boot
  // (see CUSTOMER-MARKETING-OPT-OUT-MIGRATION.sql for running it by hand).
  async onModuleInit() {
    try {
      await this.customerRepository.query(
        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS "marketingOptOut" boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "marketingOptOutAt" timestamptz NULL;',
      );
    } catch (e: any) {
      this.logger.warn(`Auto-migration for marketingOptOut skipped or failed: ${e.message}`);
    }
  }

  async findOrCreate(store: Store, identifier: string, data: Partial<CreateCustomerDto>, platform: string) {
    let customer = await this.findByIdentifier(store.id, identifier, platform);

    if (!customer) {
      const { categoryIds: _categoryIds, tagIds: _tagIds, tags, ...base } = data as CreateCustomerDto;
      customer = this.customerRepository.create({
        ...base,
        legacyTags: tags || [],
        storeId: store.id,
        store,
      });
      customer = await this.customerRepository.save(customer);
    }

    return customer;
  }

  /** Placeholder names we generate ourselves; safe to replace with the customer's real WhatsApp profile name. */
  isPlaceholderName(name: string | null | undefined, identifier?: string) {
    const value = String(name || '').trim();
    if (!value) return true;
    if (/^(WhatsApp|العميل|عميل)\s/.test(value)) return true;
    const digits = value.replace(/[^0-9]/g, '');
    return !!identifier && digits.length > 5 && digits === identifier.replace(/[^0-9]/g, '');
  }

  async updateProfileName(customer: Customer, profileName: string | null | undefined, identifier: string) {
    const name = String(profileName || '').trim();
    if (!name || !this.isPlaceholderName(customer.fullName, identifier) || customer.fullName === name) return customer;
    customer.fullName = name;
    await this.customerRepository.update(customer.id, { fullName: name });
    return customer;
  }

  async findNamesByIds(ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return new Map<string, string>();
    const rows = await this.customerRepository.find({ where: { id: In(unique) }, select: ['id', 'fullName', 'phoneNumber', 'whatsappId'] });
    const names = new Map<string, string>();
    for (const row of rows) {
      if (!this.isPlaceholderName(row.fullName, row.phoneNumber || row.whatsappId || '')) names.set(row.id, row.fullName);
    }
    return names;
  }

  /**
   * Active categories and tags for a batch of customers, keyed by customer id (for inbox badges).
   * Two flat queries on the link tables, so cost scales with the conversations shown, not the customer base.
   */
  async findLabelsByIds(ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const labels = new Map<string, { categories: { id: string; name: string; color: string }[]; tags: { id: string; name: string; color: string }[] }>();
    if (!unique.length) return labels;
    const [categories, tags] = await Promise.all([
      this.customerRepository.query(
        `SELECT l."customerId", c.id, c.name, c.color FROM customer_category_links l
         JOIN customer_categories c ON c.id = l."categoryId"
         WHERE l."customerId" = ANY($1::uuid[]) AND c."isActive" = true
         ORDER BY c."sortOrder" ASC, c.name ASC`,
        [unique],
      ),
      this.customerRepository.query(
        `SELECT l."customerId", t.id, t.name, t.color FROM customer_tag_links l
         JOIN customer_tags t ON t.id = l."tagId"
         WHERE l."customerId" = ANY($1::uuid[]) AND t."isActive" = true
         ORDER BY t.name ASC`,
        [unique],
      ),
    ]);
    const entry = (id: string) => {
      if (!labels.has(id)) labels.set(id, { categories: [], tags: [] });
      return labels.get(id)!;
    };
    for (const row of categories) entry(row.customerId).categories.push({ id: row.id, name: row.name, color: row.color });
    for (const row of tags) entry(row.customerId).tags.push({ id: row.id, name: row.name, color: row.color });
    return labels;
  }

  async findAllByStore(storeId: string, filters: CustomerFilters = {}) {
    return this.findAllScoped(undefined, storeId, filters);
  }

  async findAllByOrganization(organizationId: string, filters: CustomerFilters = {}) {
    return this.findAllScoped(organizationId, undefined, filters);
  }

  async getExportTags(organizationId: string, storeIds: string[]) {
    if (!storeIds.length) return [];
    return this.tagRepository.createQueryBuilder('tag')
      .where('tag.organizationId = :organizationId', { organizationId })
      .andWhere('tag.isActive = true')
      .andWhere(new Brackets((qb) => qb
        .where('tag.scope = :organizationScope', { organizationScope: CustomerTaxonomyScope.ORGANIZATION })
        .orWhere('(tag.scope = :storeScope AND tag.storeId IN (:...storeIds))', { storeScope: CustomerTaxonomyScope.STORE, storeIds })))
      .orderBy('tag.name', 'ASC')
      .getMany()
      .then((tags) => tags.map(({ id, name, color, scope, storeId }) => ({ id, name, color, scope, storeId })));
  }

  /** Categories and tags available as statistics-report columns, with their customer counts in the branches. */
  async getStatisticsSources(organizationId: string, storeIds: string[]) {
    if (!storeIds.length) return [];
    const rows: { type: 'category' | 'tag'; id: string; name: string; color: string; customers: number }[] = await this.customerRepository.query(
      `SELECT 'category' AS type, t.id, t.name, t.color, t."sortOrder" AS "sortOrder",
              (SELECT COUNT(*)::int FROM customer_category_links l JOIN customers c ON c.id = l."customerId"
                WHERE l."categoryId" = t.id AND c."storeId" = ANY($2::uuid[])) AS customers
         FROM customer_categories t
        WHERE t."organizationId" = $1 AND t."isActive" AND (t.scope = 'organization' OR t."storeId" = ANY($2::uuid[]))
       UNION ALL
       SELECT 'tag' AS type, t.id, t.name, t.color, 0 AS "sortOrder",
              (SELECT COUNT(*)::int FROM customer_tag_links l JOIN customers c ON c.id = l."customerId"
                WHERE l."tagId" = t.id AND c."storeId" = ANY($2::uuid[])) AS customers
         FROM customer_tags t
        WHERE t."organizationId" = $1 AND t."isActive" AND (t.scope = 'organization' OR t."storeId" = ANY($2::uuid[]))
        ORDER BY type, "sortOrder", name`,
      [organizationId, storeIds],
    );
    return rows.map(({ type, id, name, color, customers }) => ({ key: `${type}:${id}`, type, id, name, color, customers: Number(customers) }));
  }

  async exportCustomers(response: Response, options: CustomerExportOptions) {
    if (options.exportType === 'statistics') {
      if (options.format === 'pdf') return writeSourceStatisticsPdf(response, await this.sourceStatisticsReport(options));
      const rows = await this.exportStatistics(options);
      return this.writeStatisticsExcelExport(response, rows);
    }
    const total = await this.countExportRows(options);
    if (options.format === 'pdf' && total > PDF_EXPORT_LIMIT) {
      throw new BadRequestException(`تصدير PDF يدعم حتى ${PDF_EXPORT_LIMIT.toLocaleString('en')} عميل. قلّل عدد الفروع أو اختر تاقاً، أو استخدم Excel.`);
    }
    if (options.format === 'xlsx') return this.writeExcelExport(response, options, total);
    return this.writePdfExport(response, options, total);
  }

  private async sourceStatisticsReport(options: CustomerExportOptions): Promise<SourceStatisticsReport> {
    const baselineDate = options.baselineDate || riyadhDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baselineDate) || Number.isNaN(Date.parse(`${baselineDate}T00:00:00+03:00`))) {
      throw new BadRequestException('Baseline date must be YYYY-MM-DD');
    }
    const requested = [...new Set(options.sources || [])];
    if (requested.length > STATISTICS_SOURCE_LIMIT) throw new BadRequestException(`اختر حتى ${STATISTICS_SOURCE_LIMIT} أعمدة من الفئات والتاقات`);
    const parsed = requested.map((key) => {
      const [type, id] = key.split(':');
      if ((type !== 'category' && type !== 'tag') || !UUID_PATTERN.test(id || '')) throw new BadRequestException(`Invalid statistics column: ${key}`);
      return { key, type: type as 'category' | 'tag', id };
    });

    let sources: StatisticsSource[] = [];
    if (parsed.length) {
      const found: { type: 'category' | 'tag'; id: string; name: string; color: string }[] = await this.customerRepository.query(
        `SELECT 'category' AS type, id, name, color FROM customer_categories
          WHERE id = ANY($2::uuid[]) AND "organizationId" = $1 AND (scope = 'organization' OR "storeId" = ANY($4::uuid[]))
         UNION ALL
         SELECT 'tag' AS type, id, name, color FROM customer_tags
          WHERE id = ANY($3::uuid[]) AND "organizationId" = $1 AND (scope = 'organization' OR "storeId" = ANY($4::uuid[]))`,
        [
          options.organizationId,
          parsed.filter((item) => item.type === 'category').map((item) => item.id),
          parsed.filter((item) => item.type === 'tag').map((item) => item.id),
          options.storeIds,
        ],
      );
      const byKey = new Map(found.map((item) => [`${item.type}:${item.id}`, item]));
      sources = parsed.map((item) => {
        const match = byKey.get(item.key);
        if (!match) throw new BadRequestException('One or more report columns are not available to these branches');
        return { key: item.key, type: item.type, id: item.id, name: match.name, color: match.color };
      });
    }

    const [organization] = await this.customerRepository.query('SELECT name FROM organizations WHERE id = $1', [options.organizationId]);
    const base: { storeId: string; storeName: string; baseline: number; unique: number }[] = await this.customerRepository.query(
      `SELECT s.id AS "storeId", s.name AS "storeName",
              COUNT(c.id) FILTER (WHERE c."createdAt" < $3::timestamptz)::int AS baseline,
              COUNT(c.id)::int AS "unique"
         FROM stores s
         LEFT JOIN customers c ON c."storeId" = s.id
        WHERE s."organizationId" = $1 AND s.id = ANY($2::uuid[])
        GROUP BY s.id, s.name
        ORDER BY s.name ASC`,
      [options.organizationId, options.storeIds, `${baselineDate}T00:00:00+03:00`],
    );
    // "fresh" = linked customers added on/after the baseline date; the rest were already stored.
    const counts: { storeId: string; key: string; total: number; fresh: number }[] = sources.length
      ? await this.customerRepository.query(
        `SELECT c."storeId" AS "storeId", 'category:' || l."categoryId" AS key, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE c."createdAt" >= $4::timestamptz)::int AS fresh
           FROM customer_category_links l JOIN customers c ON c.id = l."customerId"
          WHERE l."categoryId" = ANY($1::uuid[]) AND c."storeId" = ANY($3::uuid[])
          GROUP BY 1, 2
         UNION ALL
         SELECT c."storeId", 'tag:' || l."tagId", COUNT(*)::int,
                COUNT(*) FILTER (WHERE c."createdAt" >= $4::timestamptz)::int
           FROM customer_tag_links l JOIN customers c ON c.id = l."customerId"
          WHERE l."tagId" = ANY($2::uuid[]) AND c."storeId" = ANY($3::uuid[])
          GROUP BY 1, 2`,
        [
          sources.filter((source) => source.type === 'category').map((source) => source.id),
          sources.filter((source) => source.type === 'tag').map((source) => source.id),
          options.storeIds,
          `${baselineDate}T00:00:00+03:00`,
        ],
      )
      : [];
    const rows: SourceStatisticsRow[] = base.map((row) => ({
      storeId: String(row.storeId),
      storeName: String(row.storeName),
      baseline: Number(row.baseline || 0),
      unique: Number(row.unique || 0),
      sources: {},
      sourcesNew: {},
    }));
    const byStore = new Map(rows.map((row) => [row.storeId, row]));
    for (const count of counts) {
      const row = byStore.get(String(count.storeId));
      if (!row) continue;
      row.sources[count.key] = Number(count.total || 0);
      row.sourcesNew[count.key] = Number(count.fresh || 0);
    }

    // Branch pages split the two competition categories by the participants' age-group tags ("عمر ...").
    const competition = sources.filter((source) =>
      source.type === 'category' && [COMPETITION_CATEGORY, COMPETITION_ONLINE_CATEGORY].includes(source.name.trim()));
    if (options.branchDetails && competition.length) {
      const ages: { storeId: string; key: string; age: string; total: number; fresh: number }[] = await this.customerRepository.query(
        `SELECT c."storeId" AS "storeId", 'category:' || cl."categoryId" AS key, TRIM(t.name) AS age,
                COUNT(*)::int AS total, COUNT(*) FILTER (WHERE c."createdAt" >= $3::timestamptz)::int AS fresh
           FROM customer_category_links cl
           JOIN customers c ON c.id = cl."customerId"
           JOIN customer_tag_links tl ON tl."customerId" = c.id
           JOIN customer_tags t ON t.id = tl."tagId"
          WHERE cl."categoryId" = ANY($1::uuid[]) AND c."storeId" = ANY($2::uuid[])
            AND t."organizationId" = $4 AND t.name LIKE $5
          GROUP BY 1, 2, 3`,
        [competition.map((source) => source.id), options.storeIds, `${baselineDate}T00:00:00+03:00`, options.organizationId, `${AGE_TAG_PREFIX}%`],
      );
      for (const item of ages) {
        const row = byStore.get(String(item.storeId));
        if (!row) continue;
        row.sourceAges ||= {};
        (row.sourceAges[item.key] ||= []).push({
          age: String(item.age).slice(AGE_TAG_PREFIX.length).trim(),
          total: Number(item.total || 0),
          fresh: Number(item.fresh || 0),
        });
      }
    }
    return {
      organizationName: String(organization?.name || ''),
      baselineDate,
      generatedDate: riyadhDate(new Date()),
      sources,
      rows,
      branchDetails: options.branchDetails === true,
    };
  }

  private async exportStatistics(options: CustomerExportOptions): Promise<CustomerExportStatistic[]> {
    const params: unknown[] = [options.organizationId, options.storeIds];
    const tagFilter = options.tagId
      ? `AND EXISTS (SELECT 1 FROM customer_tag_links filter_link WHERE filter_link."customerId" = c.id AND filter_link."tagId" = $${params.push(options.tagId)})`
      : '';
    const rows = await this.customerRepository.query(
      `SELECT s.id AS "storeId", s.name AS "storeName",
              COUNT(c.id)::int AS total,
              COUNT(c.id) FILTER (WHERE COALESCE(c."phoneNumber", '') <> '')::int AS "withPhone",
              COUNT(c.id) FILTER (WHERE COALESCE(c.email, '') <> '')::int AS "withEmail",
              COUNT(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM customer_tag_links tag_link WHERE tag_link."customerId" = c.id))::int AS "withTags",
              COUNT(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM customer_category_links category_link WHERE category_link."customerId" = c.id))::int AS "withCategories",
              COUNT(c.id) FILTER (WHERE c."marketingOptOut" = true)::int AS "marketingOptOut"
       FROM stores s
       LEFT JOIN customers c ON c."storeId" = s.id ${tagFilter}
       WHERE s."organizationId" = $1 AND s.id = ANY($2::uuid[])
       GROUP BY s.id, s.name
       ORDER BY s.name ASC`,
      params,
    );
    return rows.map((row: Record<string, string | number>) => ({
      storeId: String(row.storeId),
      storeName: String(row.storeName),
      total: Number(row.total || 0),
      withPhone: Number(row.withPhone || 0),
      withEmail: Number(row.withEmail || 0),
      withTags: Number(row.withTags || 0),
      withCategories: Number(row.withCategories || 0),
      marketingOptOut: Number(row.marketingOptOut || 0),
    }));
  }

  private async writeStatisticsExcelExport(response: Response, rows: CustomerExportStatistic[]) {
    const stamp = new Date().toISOString().slice(0, 10);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const withPhone = rows.reduce((sum, row) => sum + row.withPhone, 0);
    const withEmail = rows.reduce((sum, row) => sum + row.withEmail, 0);
    const withTags = rows.reduce((sum, row) => sum + row.withTags, 0);
    const withCategories = rows.reduce((sum, row) => sum + row.withCategories, 0);
    const marketingOptOut = rows.reduce((sum, row) => sum + row.marketingOptOut, 0);
    const rate = (value: number) => total ? value / total : 0;
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="customer-statistics-${stamp}.xlsx"`);
    response.setHeader('X-Export-Count', String(total));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Tael Bot';
    workbook.created = new Date();

    const dashboard = workbook.addWorksheet('لوحة المؤشرات', { views: [{ state: 'frozen', ySplit: 9, rightToLeft: true }] });
    dashboard.properties.defaultRowHeight = 21;
    dashboard.columns = Array.from({ length: 8 }, () => ({ width: 16 }));
    dashboard.mergeCells('A1:H2');
    dashboard.getCell('A1').value = 'إحصائيات العملاء';
    dashboard.getCell('A1').font = { bold: true, size: 22, color: { argb: 'FFFFFFFF' } };
    dashboard.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF38204A' } };
    dashboard.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle' };
    dashboard.mergeCells('A3:H3');
    dashboard.getCell('A3').value = `نظرة تنفيذية حسب الفروع المحددة - ${stamp}`;
    dashboard.getCell('A3').font = { size: 10, color: { argb: 'FF746A79' } };
    dashboard.getCell('A3').alignment = { horizontal: 'right' };

    const metricCards = [
      { range: 'A5:B7', value: total, label: 'إجمالي العملاء', color: 'FF643B89' },
      { range: 'C5:D7', value: rate(withPhone), label: 'اكتمال أرقام الجوال', color: 'FF167D72', percent: true },
      { range: 'E5:F7', value: rate(withTags), label: 'عملاء لديهم تاقات', color: 'FFB36A16', percent: true },
      { range: 'G5:H7', value: rate(withCategories), label: 'عملاء لديهم فئات', color: 'FF3E6FA8', percent: true },
    ];
    for (const card of metricCards) {
      dashboard.mergeCells(card.range);
      const cell = dashboard.getCell(card.range.split(':')[0]);
      cell.value = `${card.percent ? `${Math.round(card.value * 100)}%` : card.value.toLocaleString('en')}\n${card.label}`;
      cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.color } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    dashboard.getRow(5).height = 25;
    dashboard.getRow(6).height = 25;
    dashboard.getRow(7).height = 25;

    dashboard.mergeCells('A9:H9');
    dashboard.getCell('A9').value = 'توزيع العملاء حسب الفروع';
    dashboard.getCell('A9').font = { bold: true, size: 13, color: { argb: 'FF38204A' } };
    dashboard.getCell('A9').alignment = { horizontal: 'right' };
    const dashboardHeaders = ['الفرع', 'عدد العملاء', 'الحصة من الإجمالي', 'اكتمال الجوال', 'اكتمال البريد', 'لديهم تاقات', 'لديهم فئات', 'إلغاء التسويق'];
    const dashboardHeader = dashboard.getRow(10);
    dashboardHeaders.forEach((label, index) => { dashboardHeader.getCell(index + 1).value = label; });
    dashboardHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dashboardHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF643B89' } };
    dashboardHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    dashboardHeader.height = 34;
    rows.forEach((row) => dashboard.addRow([
      row.storeName, row.total, total ? row.total / total : 0,
      row.total ? row.withPhone / row.total : 0, row.total ? row.withEmail / row.total : 0,
      row.total ? row.withTags / row.total : 0, row.total ? row.withCategories / row.total : 0,
      row.total ? row.marketingOptOut / row.total : 0,
    ]));
    const dashboardTotal = dashboard.addRow(['الإجمالي', total, 1, rate(withPhone), rate(withEmail), rate(withTags), rate(withCategories), rate(marketingOptOut)]);
    dashboardTotal.font = { bold: true, color: { argb: 'FF643B89' } };
    dashboardTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EBF6' } };
    for (let rowNumber = 11; rowNumber <= dashboardTotal.number; rowNumber += 1) {
      dashboard.getRow(rowNumber).alignment = { horizontal: 'right', vertical: 'middle' };
      dashboard.getCell(`B${rowNumber}`).numFmt = '#,##0';
      for (let column = 3; column <= 8; column += 1) dashboard.getRow(rowNumber).getCell(column).numFmt = '0%';
    }
    if (rows.length) {
      dashboard.addConditionalFormatting({
        ref: `B11:B${10 + rows.length}`,
        rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF4EEF8' }, { argb: 'FFCDB4DD' }, { argb: 'FF643B89' }] }],
      });
      dashboard.addConditionalFormatting({
        ref: `C11:G${10 + rows.length}`,
        rules: [{ type: 'colorScale', priority: 2, cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF4EEF8' }, { argb: 'FFD7C3E6' }, { argb: 'FF643B89' }] }],
      });
    }
    dashboard.autoFilter = { from: 'A10', to: `H${10 + rows.length}` };

    const sheet = workbook.addWorksheet('البيانات التفصيلية', { views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }] });
    sheet.columns = [
      { header: 'الفرع', key: 'storeName', width: 28 }, { header: 'إجمالي العملاء', key: 'total', width: 18 },
      { header: 'لديهم رقم جوال', key: 'withPhone', width: 22 }, { header: 'لديهم بريد إلكتروني', key: 'withEmail', width: 22 },
      { header: 'لديهم تاقات', key: 'withTags', width: 20 }, { header: 'لديهم فئات', key: 'withCategories', width: 22 },
      { header: 'إلغاء الاشتراك التسويقي', key: 'marketingOptOut', width: 24 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF643B89' } };
    header.alignment = { horizontal: 'right', vertical: 'middle' };
    header.height = 27;
    rows.forEach((row) => sheet.addRow(row));
    const totals = sheet.addRow({ storeName: 'الإجمالي', total, withPhone, withEmail, withTags, withCategories, marketingOptOut });
    totals.font = { bold: true, color: { argb: 'FF643B89' } };
    totals.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2ECF7' } };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 2) {
        row.alignment = { horizontal: 'right', vertical: 'middle' };
        for (let column = 2; column <= 7; column += 1) row.getCell(column).numFmt = '#,##0';
      }
    });
    sheet.autoFilter = { from: 'A1', to: `G${1 + rows.length}` };
    await workbook.xlsx.write(response);
    response.end();
  }

  private async countExportRows(options: CustomerExportOptions) {
    const params: unknown[] = [options.organizationId, options.storeIds];
    const tagFilter = options.tagId
      ? `AND EXISTS (SELECT 1 FROM customer_tag_links filter_link WHERE filter_link."customerId" = c.id AND filter_link."tagId" = $${params.push(options.tagId)})`
      : '';
    const [row] = await this.customerRepository.query(
      `SELECT COUNT(*)::int AS total
       FROM customers c
       JOIN stores s ON s.id = c."storeId"
       WHERE s."organizationId" = $1 AND c."storeId" = ANY($2::uuid[]) ${tagFilter}`,
      params,
    );
    return Number(row?.total || 0);
  }

  private async exportRows(options: CustomerExportOptions, lastId: string | null, limit: number): Promise<CustomerExportRow[]> {
    const params: unknown[] = [options.organizationId, options.storeIds];
    const tagFilter = options.tagId
      ? `AND EXISTS (SELECT 1 FROM customer_tag_links filter_link WHERE filter_link."customerId" = c.id AND filter_link."tagId" = $${params.push(options.tagId)})`
      : '';
    const cursorFilter = lastId ? `AND c.id > $${params.push(lastId)}` : '';
    params.push(limit);
    return this.customerRepository.query(
      `SELECT c.id, c."fullName", c."phoneNumber", c.email, c.notes, c."createdAt", c."updatedAt",
              s.name AS "storeName",
              COALESCE(string_agg(DISTINCT t.name, ', '), '') AS "tagNames",
              COALESCE(string_agg(DISTINCT cat.name, ', '), '') AS "categoryNames"
       FROM customers c
       JOIN stores s ON s.id = c."storeId"
       LEFT JOIN customer_tag_links ctl ON ctl."customerId" = c.id
       LEFT JOIN customer_tags t ON t.id = ctl."tagId" AND t."isActive" = true
       LEFT JOIN customer_category_links ccl ON ccl."customerId" = c.id
       LEFT JOIN customer_categories cat ON cat.id = ccl."categoryId" AND cat."isActive" = true
       WHERE s."organizationId" = $1 AND c."storeId" = ANY($2::uuid[]) ${tagFilter} ${cursorFilter}
       GROUP BY c.id, c."fullName", c."phoneNumber", c.email, c.notes, c."createdAt", c."updatedAt", s.name
       ORDER BY c.id ASC
       LIMIT $${params.length}`,
      params,
    );
  }

  private async eachExportBatch(options: CustomerExportOptions, callback: (rows: CustomerExportRow[]) => Promise<void>) {
    let lastId: string | null = null;
    while (true) {
      const rows = await this.exportRows(options, lastId, EXPORT_BATCH_SIZE);
      if (!rows.length) break;
      await callback(rows);
      lastId = rows[rows.length - 1].id;
      if (rows.length < EXPORT_BATCH_SIZE) break;
    }
  }

  private async writeExcelExport(response: Response, options: CustomerExportOptions, total: number) {
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="customers-${stamp}.xlsx"`);
    response.setHeader('X-Export-Count', String(total));
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: false });
    const sheet = workbook.addWorksheet('Customers', { views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }] });
    sheet.columns = [
      { header: 'الاسم', key: 'fullName', width: 28 },
      { header: 'رقم الجوال', key: 'phoneNumber', width: 18 },
      { header: 'البريد الإلكتروني', key: 'email', width: 30 },
      { header: 'الفرع', key: 'storeName', width: 22 },
      { header: 'الفئات', key: 'categoryNames', width: 28 },
      { header: 'التاقات', key: 'tagNames', width: 28 },
      { header: 'ملاحظات', key: 'notes', width: 38 },
      { header: 'تاريخ الإضافة', key: 'createdAt', width: 20 },
      { header: 'آخر تحديث', key: 'updatedAt', width: 20 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF643B89' } };
    header.alignment = { horizontal: 'right', vertical: 'middle' };
    header.height = 24;
    header.commit();
    await this.eachExportBatch(options, async (rows) => {
      for (const row of rows) {
        const excelRow = sheet.addRow({ ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });
        excelRow.alignment = { vertical: 'top', wrapText: false };
        excelRow.getCell('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
        excelRow.getCell('updatedAt').numFmt = 'yyyy-mm-dd hh:mm';
        excelRow.commit();
      }
    });
    sheet.commit();
    await workbook.commit();
  }

  private async writePdfExport(response: Response, options: CustomerExportOptions, total: number) {
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="customers-${stamp}.pdf"`);
    response.setHeader('X-Export-Count', String(total));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 34, bottom: 34, left: 30, right: 30 }, bufferPages: true });
    doc.pipe(response);
    this.registerPdfFonts(doc);
    const columns = [
      { key: 'fullName', label: 'الاسم', width: 150 },
      { key: 'phoneNumber', label: 'رقم الجوال', width: 100 },
      { key: 'email', label: 'البريد', width: 145 },
      { key: 'storeName', label: 'الفرع', width: 90 },
      { key: 'categoryNames', label: 'الفئات', width: 100 },
      { key: 'tagNames', label: 'التاقات', width: 100 },
      { key: 'createdAt', label: 'تاريخ الإضافة', width: 78 },
    ] as const;
    const tableX = 30;
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    let y = 105;
    const drawTableHeader = () => {
      let x = tableX + tableWidth;
      doc.rect(tableX, y, tableWidth, 22).fill('#643B89');
      doc.fillColor('#ffffff').fontSize(8.5);
      for (const column of columns) {
        x -= column.width;
        drawPdfText(doc.font('ArabicBold'), column.label, x + 4, y + 6, { width: column.width - 8 });
      }
      y += 22;
    };
    const drawPageTitle = () => {
      drawPdfText(doc.fillColor('#24152f').font('ArabicBold').fontSize(19), 'تقرير العملاء', 30, 32, { width: 752 });
      doc.fillColor('#6b6470').font('ArabicRegular').fontSize(9).text(`${total.toLocaleString('en')}  |  ${stamp}`, 30, 65, { width: 752, align: 'right' });
      y = 105;
      drawTableHeader();
    };
    drawPageTitle();
    doc.on('pageAdded', drawPageTitle);
    let rowIndex = 0;
    await this.eachExportBatch(options, async (rows) => {
      for (const row of rows) {
        if (y + 19 > doc.page.height - 34) doc.addPage();
        const background = rowIndex % 2 === 0 ? '#f7f4fb' : '#ffffff';
        doc.rect(tableX, y, tableWidth, 19).fill(background);
        let x = tableX + tableWidth;
        doc.fillColor('#252129').font('ArabicRegular').fontSize(7.5);
        for (const column of columns) {
          x -= column.width;
          const raw = column.key === 'createdAt' ? new Date(row.createdAt).toISOString().slice(0, 10) : row[column.key];
          const value = String(raw || '—');
          drawPdfText(doc, value, x + 4, y + 5, { width: column.width - 8, align: column.key === 'email' ? 'left' : 'right', ellipsis: true });
        }
        y += 19;
        rowIndex += 1;
      }
    });
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(index);
      drawPdfText(doc.fillColor('#777177').fontSize(8), `${index + 1} / ${pages.count}`, 30, doc.page.height - 24, { width: 752, align: 'center' });
    }
    doc.end();
  }

  /**
   * Unpaged list, capped so a large customer base can no longer exhaust the server.
   * Filters run on ids only; relations are loaded once for the matching rows.
   */
  private async findAllScoped(organizationId?: string, storeId?: string, filters: CustomerFilters = {}) {
    const rows = await this.filteredQuery(storeId ? { storeId } : { organizationId }, filters)
      .select(['customer.id'])
      .orderBy('customer.updatedAt', 'DESC')
      .limit(UNPAGED_LIST_LIMIT)
      .getMany();
    const customers = await this.reloadWithRelations(rows.map((row) => row.id));
    for (const customer of customers) {
      await this.migrateLegacyTags([customer], customer.storeId, customer.store?.organizationId || organizationId);
    }
    return customers;
  }

  /** Every WhatsApp-reachable customer matching the filters, as lean rows (no relations). */
  async findAudienceRows(organizationId: string, filters: CustomerFilters): Promise<AudienceRow[]> {
    const rows = await this.filteredQuery({ organizationId }, { ...filters, whatsappOnly: true })
      .select('customer.id', 'id')
      .addSelect('customer.storeId', 'storeId')
      .addSelect('store.name', 'storeName')
      .addSelect('customer.fullName', 'fullName')
      .addSelect('customer.phoneNumber', 'phoneNumber')
      .addSelect('customer.whatsappId', 'whatsappId')
      .addSelect('customer.email', 'email')
      .addSelect('customer.marketingOptOut', 'marketingOptOut')
      .addSelect('customer.updatedAt', 'updatedAt')
      .orderBy('customer.id', 'ASC')
      .limit(AUDIENCE_LIMIT + 1)
      .getRawMany();
    return rows.map((row) => ({ ...row, marketingOptOut: row.marketingOptOut === true || row.marketingOptOut === 't' }));
  }

  /** Lean rows for personalizing a batch of campaign messages, keyed by customer id. */
  async findAudienceRowsByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, AudienceRow>();
    if (!unique.length) return map;
    const rows: AudienceRow[] = await this.customerRepository.query(
      `SELECT c.id, c."storeId", s.name AS "storeName", c."fullName", c."phoneNumber", c."whatsappId", c.email, c."marketingOptOut", c."updatedAt"
         FROM customers c JOIN stores s ON s.id = c."storeId" WHERE c.id = ANY($1::uuid[])`,
      [unique],
    );
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  /**
   * Turns audience rows into the numbers that will actually receive a campaign: opted-out records
   * are dropped, duplicate numbers are sent once, and numbers opted out in any branch are skipped.
   */
  async planAudience(organizationId: string, rows: AudienceRow[]) {
    const marketable = rows.filter((row) => !row.marketingOptOut);
    const deduped = this.deduplicateWhatsAppCustomers(marketable as unknown as Customer[]);
    const optedOutPhones = await this.findMarketingOptedOutPhones(organizationId, deduped.unique.map((item) => item.phone));
    const recipients = deduped.unique
      .filter((item) => !optedOutPhones.has(item.phone))
      .map((item) => ({ ...item, customer: item.customer as unknown as AudienceRow }));
    return {
      records: rows.length,
      optedOut: rows.length - marketable.length + optedOutPhones.size,
      duplicates: deduped.duplicateRecords,
      recipients,
    };
  }

  /** Counts for the campaign composer, computed with the same rules the send uses. */
  async summarizeAudience(organizationId: string, filters: CustomerFilters) {
    const records = await this.filteredQuery({ organizationId }, { ...filters, whatsappOnly: true }).getCount();
    if (records > AUDIENCE_LIMIT) {
      return { records, optedOut: 0, duplicates: 0, recipients: 0, byBranch: [], overLimit: true, limit: AUDIENCE_LIMIT };
    }
    const plan = await this.planAudience(organizationId, await this.findAudienceRows(organizationId, filters));
    const byBranch = new Map<string, { storeId: string; storeName: string; recipients: number }>();
    for (const item of plan.recipients) {
      const entry = byBranch.get(item.customer.storeId) || { storeId: item.customer.storeId, storeName: item.customer.storeName || '', recipients: 0 };
      entry.recipients += 1;
      byBranch.set(item.customer.storeId, entry);
    }
    return {
      records: plan.records,
      optedOut: plan.optedOut,
      duplicates: plan.duplicates,
      recipients: plan.recipients.length,
      byBranch: [...byBranch.values()].sort((a, b) => b.recipients - a.recipients),
      overLimit: false,
      limit: AUDIENCE_LIMIT,
    };
  }

  /**
   * Categories and tags usable in the selected branches, each with how many WhatsApp-reachable customers
   * carry it. Tag counts narrow to the selected categories so the user can drill down branch → category → tag.
   */
  async getAudienceOptions(organizationId: string, storeIds: string[], categoryIds: string[] = []) {
    if (!storeIds.length) return { categories: [], tags: [] };
    const reachable = `c."storeId" = ANY($1::uuid[]) AND COALESCE(c."phoneNumber", c."whatsappId", '') <> ''`;
    const [taxonomy, categoryCounts, tagCounts] = await Promise.all([
      this.customerRepository.query(
        `SELECT 'category' AS type, id, name, color, scope::text AS scope, "storeId", "sortOrder" FROM customer_categories
          WHERE "organizationId" = $1 AND "isActive" AND (scope = 'organization' OR "storeId" = ANY($2::uuid[]))
         UNION ALL
         SELECT 'tag' AS type, id, name, color, scope::text, "storeId", 0 FROM customer_tags
          WHERE "organizationId" = $1 AND "isActive" AND (scope = 'organization' OR "storeId" = ANY($2::uuid[]))
         ORDER BY "sortOrder", name`,
        [organizationId, storeIds],
      ),
      this.customerRepository.query(
        `SELECT l."categoryId" AS id, COUNT(*)::int AS count
           FROM customer_category_links l JOIN customers c ON c.id = l."customerId"
          WHERE ${reachable}
          GROUP BY l."categoryId"`,
        [storeIds],
      ),
      this.customerRepository.query(
        `SELECT l."tagId" AS id, COUNT(*)::int AS count
           FROM customer_tag_links l JOIN customers c ON c.id = l."customerId"
          WHERE ${reachable}
            AND (cardinality($2::uuid[]) = 0 OR EXISTS (
              SELECT 1 FROM customer_category_links cl WHERE cl."customerId" = c.id AND cl."categoryId" = ANY($2::uuid[])))
          GROUP BY l."tagId"`,
        [storeIds, categoryIds],
      ),
    ]);
    const toMap = (rows: { id: string; count: number }[]) => new Map(rows.map((row) => [row.id, Number(row.count)]));
    const categoryMap = toMap(categoryCounts);
    const tagMap = toMap(tagCounts);
    const shape = (row: any, counts: Map<string, number>) => ({
      id: row.id, name: row.name, color: row.color, scope: row.scope, storeId: row.storeId, customers: counts.get(row.id) || 0,
    });
    return {
      categories: taxonomy.filter((row: any) => row.type === 'category').map((row: any) => shape(row, categoryMap)),
      tags: taxonomy.filter((row: any) => row.type === 'tag').map((row: any) => shape(row, tagMap)),
    };
  }

  /**
   * One page of customers plus per-segment totals for the same filters, so the UI can show
   * accurate counts without loading every customer.
   */
  async findPage(scope: { organizationId?: string; storeId?: string }, filters: CustomerFilters, options: CustomerPageOptions) {
    const base = () => this.filteredQuery(scope, filters);

    const [all, categorized, tagged] = await Promise.all([
      base().getCount(),
      base().andWhere(HAS_CATEGORY).getCount(),
      base().andWhere(HAS_TAG).getCount(),
    ]);
    const counts: Record<CustomerSegment, number> = {
      all,
      categorized,
      uncategorized: all - categorized,
      tagged,
      untagged: all - tagged,
    };

    const page = base();
    switch (options.segment) {
      case 'categorized': page.andWhere(HAS_CATEGORY); break;
      case 'uncategorized': page.andWhere(`NOT ${HAS_CATEGORY}`); break;
      case 'tagged': page.andWhere(HAS_TAG); break;
      case 'untagged': page.andWhere(`NOT ${HAS_TAG}`); break;
    }

    const column = SORT_COLUMNS[options.sort || 'updatedAt'] || SORT_COLUMNS.updatedAt;
    const direction = options.dir === 'asc' ? 'ASC' : 'DESC';
    const rows = await page
      .select(['customer.id', 'customer.storeId'])
      .orderBy(column, direction, 'NULLS LAST')
      .addOrderBy('customer.id', 'ASC')
      .offset((options.page - 1) * options.limit)
      .limit(options.limit)
      .getMany();

    const ids = rows.map((row) => row.id);
    const loaded = await this.reloadWithRelations(ids);
    const byId = new Map(loaded.map((customer) => [customer.id, customer]));
    const items = ids.map((id) => byId.get(id)).filter((customer): customer is Customer => Boolean(customer));
    for (const customer of items) {
      await this.migrateLegacyTags([customer], customer.storeId, customer.store?.organizationId || scope.organizationId);
    }

    return {
      items,
      total: counts[options.segment || 'all'] ?? all,
      page: options.page,
      limit: options.limit,
      counts,
    };
  }

  /** Adds or removes categories/tags on many customers of one branch at once. */
  async bulkUpdateTaxonomy(storeId: string, organizationId: string, dto: { customerIds: string[]; mode: 'add' | 'remove'; categoryIds?: string[]; tagIds?: string[] }) {
    const customers = await this.getCustomersByIdsForStore(storeId, dto.customerIds);
    const customerIds = customers.map((customer) => customer.id);
    const categories = dto.categoryIds?.length ? await this.resolveCategories(organizationId, storeId, dto.categoryIds) : [];
    const tags = dto.tagIds?.length ? await this.resolveTags(organizationId, storeId, dto.tagIds) : [];

    await this.customerRepository.manager.transaction(async (manager) => {
      for (const [table, column, items] of [
        ['customer_category_links', 'categoryId', categories],
        ['customer_tag_links', 'tagId', tags],
      ] as const) {
        for (const item of items) {
          if (dto.mode === 'add') {
            await manager.query(
              `INSERT INTO ${table} ("customerId", "${column}") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`,
              [customerIds, item.id],
            );
          } else {
            await manager.query(`DELETE FROM ${table} WHERE "${column}" = $1 AND "customerId" = ANY($2::uuid[])`, [item.id, customerIds]);
          }
        }
      }
      await manager.getRepository(Customer).update({ id: In(customerIds) }, { updatedAt: new Date() });
    });

    return { success: true, updated: customerIds.length };
  }

  /** Imports a deduplicated batch and updates matching numbers in the selected branch. */
  async importCustomers(
    storeId: string,
    organizationId: string,
    rows: { phoneNumber: string; fullName?: string; email?: string; notes?: string }[],
    tagIds: string[],
  ) {
    const tags = tagIds.length ? await this.resolveTags(organizationId, storeId, tagIds) : [];
    const normalized = new Map<string, { phoneNumber: string; fullName?: string; email?: string; notes?: string }>();
    let skipped = 0;

    for (const row of rows) {
      const phoneNumber = this.normalizePhone(row.phoneNumber);
      if (phoneNumber.length < 8 || phoneNumber.length > 15) {
        skipped += 1;
        continue;
      }
      const clean = (value?: string) => String(value || '').trim() || undefined;
      normalized.set(phoneNumber, {
        phoneNumber,
        fullName: clean(row.fullName),
        email: clean(row.email)?.toLowerCase(),
        notes: clean(row.notes),
      });
    }

    if (!normalized.size) throw new BadRequestException('No valid phone numbers were found in the import file');
    const phones = [...normalized.keys()];
    const existing = await this.customerRepository.find({
      where: { storeId, phoneNumber: In(phones) },
      select: ['id', 'phoneNumber', 'fullName', 'email', 'notes', 'storeId'],
    });
    const byPhone = new Map(existing.map((customer) => [customer.phoneNumber, customer]));
    let created = 0;
    let updated = 0;

    const customerIds = await this.customerRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Customer);
      const records: Customer[] = [];
      for (const [phoneNumber, row] of normalized) {
        const customer = byPhone.get(phoneNumber);
        if (customer) {
          if (row.fullName) customer.fullName = row.fullName;
          if (row.email) customer.email = row.email;
          if (row.notes) customer.notes = row.notes;
          customer.updatedAt = new Date();
          records.push(customer);
          updated += 1;
        } else {
          records.push(repo.create({
            storeId,
            phoneNumber,
            whatsappId: phoneNumber,
            fullName: row.fullName || phoneNumber,
            email: row.email,
            notes: row.notes,
            legacyTags: [],
          }));
          created += 1;
        }
      }

      const saved = await repo.save(records, { chunk: 200 });
      if (tags.length) {
        const ids = saved.map((customer) => customer.id);
        for (const tag of tags) {
          await manager.query(
            'INSERT INTO customer_tag_links ("customerId", "tagId") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING',
            [ids, tag.id],
          );
        }
      }
      return saved.map((customer) => customer.id);
    });

    return { success: true, total: customerIds.length, created, updated, skipped };
  }

  private filteredQuery(scope: { organizationId?: string; storeId?: string }, filters: CustomerFilters) {
    const query = this.customerRepository.createQueryBuilder('customer').leftJoin('customer.store', 'store');

    if (scope.storeId) query.where('customer.storeId = :storeId', { storeId: scope.storeId });
    else if (scope.organizationId) query.where('store.organizationId = :organizationId', { organizationId: scope.organizationId });
    else throw new BadRequestException('Organization or branch scope is required');

    if (filters.storeIds?.length) {
      query.andWhere('customer.storeId IN (:...storeIds)', { storeIds: [...new Set(filters.storeIds)] });
    }

    const term = filters.search?.trim();
    if (term) {
      // Local numbers (05…) should match stored international ones (+9665…), so leading zeros are ignored.
      const digits = term.replace(/[^0-9]/g, '').replace(/^0+/, '');
      query.andWhere(new Brackets((qb) => {
        qb.where('LOWER(COALESCE(customer.fullName, \'\')) LIKE :search', { search: `%${term.toLowerCase()}%` })
          .orWhere('LOWER(COALESCE(customer.email, \'\')) LIKE :search');
        if (digits) qb.orWhere('COALESCE(customer.phoneNumber, \'\') LIKE :phoneSearch', { phoneSearch: `%${digits}%` });
      }));
    }

    if (filters.categoryIds?.length) {
      query.andWhere('EXISTS (SELECT 1 FROM customer_category_links fcl WHERE fcl."customerId" = customer.id AND fcl."categoryId" IN (:...categoryIds))', { categoryIds: filters.categoryIds });
    }
    if (filters.tagIds?.length) {
      const tagIds = [...new Set(filters.tagIds)];
      if (filters.tagMatch === 'all' && tagIds.length > 1) {
        query.andWhere('(SELECT COUNT(DISTINCT ftl."tagId") FROM customer_tag_links ftl WHERE ftl."customerId" = customer.id AND ftl."tagId" IN (:...tagIds)) = :tagCount', { tagIds, tagCount: tagIds.length });
      } else {
        query.andWhere('EXISTS (SELECT 1 FROM customer_tag_links ftl WHERE ftl."customerId" = customer.id AND ftl."tagId" IN (:...tagIds))', { tagIds });
      }
    }
    if (filters.excludeCategoryIds?.length) {
      query.andWhere('NOT EXISTS (SELECT 1 FROM customer_category_links xcl WHERE xcl."customerId" = customer.id AND xcl."categoryId" IN (:...excludeCategoryIds))', { excludeCategoryIds: filters.excludeCategoryIds });
    }
    if (filters.excludeTagIds?.length) {
      query.andWhere('NOT EXISTS (SELECT 1 FROM customer_tag_links xtl WHERE xtl."customerId" = customer.id AND xtl."tagId" IN (:...excludeTagIds))', { excludeTagIds: filters.excludeTagIds });
    }
    if (filters.customerIds) query.andWhere('customer.id = ANY(CAST(:customerIds AS uuid[]))', { customerIds: filters.customerIds });
    if (filters.excludeCustomerIds?.length) query.andWhere('NOT (customer.id = ANY(CAST(:excludeCustomerIds AS uuid[])))', { excludeCustomerIds: filters.excludeCustomerIds });
    if (filters.whatsappOnly) query.andWhere("COALESCE(customer.phoneNumber, customer.whatsappId, '') <> ''");

    return query;
  }

  /** How many customers of a branch carry each category/tag, for the taxonomy manager. */
  async getTaxonomyUsage(storeId: string) {
    const [categories, tags] = await Promise.all([
      this.customerRepository.query(
        'SELECT l."categoryId" AS id, COUNT(*)::int AS count FROM customer_category_links l JOIN customers c ON c.id = l."customerId" WHERE c."storeId" = $1 GROUP BY l."categoryId"',
        [storeId],
      ),
      this.customerRepository.query(
        'SELECT l."tagId" AS id, COUNT(*)::int AS count FROM customer_tag_links l JOIN customers c ON c.id = l."customerId" WHERE c."storeId" = $1 GROUP BY l."tagId"',
        [storeId],
      ),
    ]);
    const toMap = (rows: { id: string; count: number }[]) => Object.fromEntries(rows.map((row) => [row.id, row.count]));
    return { categories: toMap(categories), tags: toMap(tags) };
  }

  async findOne(id: string, storeId: string) {
    const customer = await this.customerRepository.findOne({
      where: { id, storeId },
      relations: ['store', 'categories', 'tags'],
    });
    if (!customer) throw new NotFoundException('Customer not found');
    await this.migrateLegacyTags([customer], storeId, customer.store?.organizationId || undefined);
    return (await this.reloadWithRelations([customer.id]))[0];
  }

  async findOneInOrganization(id: string, organizationId: string) {
    const customer = await this.customerRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.store', 'store')
      .leftJoinAndSelect('customer.categories', 'category')
      .leftJoinAndSelect('customer.tags', 'tag')
      .where('customer.id = :id', { id })
      .andWhere('store.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!customer) throw new NotFoundException('Customer not found');
    await this.migrateLegacyTags([customer], customer.storeId, organizationId);
    return (await this.reloadWithRelations([customer.id]))[0];
  }

  async update(id: string, storeId: string, updateData: UpdateCustomerDto) {
    const customer = await this.findOne(id, storeId);
    const organizationId = customer.store?.organizationId;
    if (!organizationId) throw new BadRequestException('Customer branch is not linked to an organization');
    const { categoryIds, tagIds, tags, marketingOptOut, ...base } = updateData;
    Object.assign(customer, base);
    const optOutChanged = marketingOptOut !== undefined && marketingOptOut !== customer.marketingOptOut;
    if (optOutChanged) {
      customer.marketingOptOut = marketingOptOut;
      customer.marketingOptOutAt = marketingOptOut ? new Date() : null;
    }

    if (categoryIds !== undefined) customer.categories = await this.resolveCategories(organizationId, storeId, categoryIds);
    if (tagIds !== undefined) customer.tags = await this.resolveTags(organizationId, storeId, tagIds);
    else if (tags !== undefined) customer.tags = await this.resolveTagNames(organizationId, storeId, tags);

    if (tags !== undefined) customer.legacyTags = tags;
    const saved = await this.customerRepository.save(customer);
    if (optOutChanged) await this.syncMarketingOptOut(organizationId, saved);
    return this.findOne(saved.id, storeId);
  }

  /** The opt-out belongs to the person, so it is copied to their records in the organization's other branches. */
  private async syncMarketingOptOut(organizationId: string, customer: Customer) {
    const phone = this.normalizePhone(customer.phoneNumber || customer.whatsappId || '');
    if (!phone) return;
    await this.customerRepository.query(
      `UPDATE customers c SET "marketingOptOut" = $1, "marketingOptOutAt" = $2
         FROM stores s
        WHERE s.id = c."storeId" AND s."organizationId" = $3 AND c.id <> $4
          AND REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g') = $5`,
      [customer.marketingOptOut, customer.marketingOptOutAt, organizationId, customer.id, phone],
    );
  }

  /** Normalized numbers among `phones` that opted out of marketing anywhere in the organization. */
  async findMarketingOptedOutPhones(organizationId: string, phones: string[]) {
    const normalized = [...new Set(phones.map((phone) => this.normalizePhone(phone)).filter(Boolean))];
    if (!normalized.length) return new Set<string>();
    const rows: { phone: string }[] = await this.customerRepository.query(
      `SELECT DISTINCT REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g') AS phone
         FROM customers c JOIN stores s ON s.id = c."storeId"
        WHERE s."organizationId" = $1 AND c."marketingOptOut" = true
          AND REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g') = ANY($2::text[])`,
      [organizationId, normalized],
    );
    return new Set(rows.map((row) => row.phone));
  }

  /**
   * Moves a customer to another branch of the same organization. When that branch already holds a
   * record for the same contact, the two are merged into it and the source record is removed.
   * Branch-scoped categories/tags of the old branch are dropped; organization-wide ones are kept.
   */
  async transferToStore(id: string, organizationId: string, targetStoreId: string) {
    const source = await this.findOneInOrganization(id, organizationId);
    if (source.storeId === targetStoreId) throw new BadRequestException('Customer is already in this branch');
    const fromStoreId = source.storeId;
    const fitsTarget = <T extends { scope: CustomerTaxonomyScope; storeId: string | null }>(item: T) =>
      item.scope === CustomerTaxonomyScope.ORGANIZATION || item.storeId === targetStoreId;
    const existing = await this.findSameContactInStore(source, targetStoreId);

    const keptId = await this.customerRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Customer);
      if (!existing) {
        source.storeId = targetStoreId;
        source.store = { id: targetStoreId } as Store;
        source.categories = (source.categories || []).filter(fitsTarget);
        source.tags = (source.tags || []).filter(fitsTarget);
        await repo.save(source);
        return source.id;
      }
      const identifier = source.phoneNumber || source.whatsappId || '';
      if (this.isPlaceholderName(existing.fullName, identifier) && !this.isPlaceholderName(source.fullName, identifier)) existing.fullName = source.fullName;
      existing.email = existing.email || source.email;
      existing.phoneNumber = existing.phoneNumber || source.phoneNumber;
      existing.whatsappId = existing.whatsappId || source.whatsappId;
      existing.instagramId = existing.instagramId || source.instagramId;
      existing.facebookId = existing.facebookId || source.facebookId;
      if (source.marketingOptOut && !existing.marketingOptOut) {
        existing.marketingOptOut = true;
        existing.marketingOptOutAt = source.marketingOptOutAt;
      }
      existing.notes = [existing.notes, source.notes].filter((note) => note?.trim()).join('\n\n') || existing.notes;
      const byId = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
      existing.categories = byId([...(existing.categories || []), ...(source.categories || []).filter(fitsTarget)]);
      existing.tags = byId([...(existing.tags || []), ...(source.tags || []).filter(fitsTarget)]);
      await repo.save(existing);
      await repo.delete(source.id);
      return existing.id;
    });

    // Inbound routing follows the most recently updated record, so the new branch must be the newest.
    await this.customerRepository.update(keptId, { updatedAt: new Date() });
    const customer = (await this.reloadWithRelations([keptId]))[0];
    return { customer, fromStoreId, removedCustomerId: existing ? source.id : null };
  }

  private async findSameContactInStore(customer: Customer, storeId: string) {
    const query = this.customerRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.categories', 'category')
      .leftJoinAndSelect('customer.tags', 'tag')
      .where('customer.storeId = :storeId', { storeId })
      .andWhere('customer.id <> :id', { id: customer.id });
    const phone = this.normalizePhone(customer.phoneNumber || customer.whatsappId || '');
    if (phone) {
      query.andWhere("REGEXP_REPLACE(COALESCE(customer.phoneNumber, customer.whatsappId, ''), '[^0-9]', '', 'g') = :phone", { phone });
    } else if (customer.instagramId) {
      query.andWhere('customer.instagramId = :instagramId', { instagramId: customer.instagramId });
    } else if (customer.facebookId) {
      query.andWhere('customer.facebookId = :facebookId', { facebookId: customer.facebookId });
    } else {
      return null;
    }
    return query.getOne();
  }

  async updateInOrganization(id: string, organizationId: string, updateData: UpdateCustomerDto) {
    const customer = await this.findOneInOrganization(id, organizationId);
    return this.update(id, customer.storeId, updateData);
  }

  async findByIdentifier(storeId: string, identifier: string, platform: string) {
    const query = this.customerRepository.createQueryBuilder('customer').where('customer.storeId = :storeId', { storeId });
    if (platform === 'whatsapp') query.andWhere('(customer.phoneNumber = :identifier OR customer.whatsappId = :identifier)', { identifier });
    else if (platform === 'instagram') query.andWhere('customer.instagramId = :identifier', { identifier });
    else if (platform === 'facebook') query.andWhere('customer.facebookId = :identifier', { identifier });
    return query.getOne();
  }

  async findMostRecentStoreForPhone(organizationId: string, phone: string) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;
    const customer = await this.customerRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.store', 'store')
      .where('store.organizationId = :organizationId', { organizationId })
      .andWhere("REGEXP_REPLACE(COALESCE(customer.phoneNumber, customer.whatsappId, ''), '[^0-9]', '', 'g') = :phone", { phone: normalized })
      .orderBy('customer.updatedAt', 'DESC')
      .getOne();
    return customer?.store || null;
  }

  async getTaxonomy(organizationId: string, storeId?: string) {
    const categoryQuery = this.categoryRepository.createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere(new Brackets((qb) => {
        qb.where('item.scope = :organizationScope', { organizationScope: CustomerTaxonomyScope.ORGANIZATION });
        if (storeId) qb.orWhere('(item.scope = :storeScope AND item.storeId = :storeId)', { storeScope: CustomerTaxonomyScope.STORE, storeId });
      }))
      .orderBy('item.scope', 'ASC')
      .addOrderBy('item.sortOrder', 'ASC')
      .addOrderBy('item.name', 'ASC');

    const tagQuery = this.tagRepository.createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere(new Brackets((qb) => {
        qb.where('item.scope = :organizationScope', { organizationScope: CustomerTaxonomyScope.ORGANIZATION });
        if (storeId) qb.orWhere('(item.scope = :storeScope AND item.storeId = :storeId)', { storeScope: CustomerTaxonomyScope.STORE, storeId });
      }))
      .orderBy('item.scope', 'ASC')
      .addOrderBy('item.name', 'ASC');

    const [categories, tags] = await Promise.all([categoryQuery.getMany(), tagQuery.getMany()]);
    return { categories, tags };
  }

  async createCategory(organizationId: string, dto: CreateCustomerCategoryDto) {
    const name = this.cleanName(dto.name);
    const scope = dto.scope || CustomerTaxonomyScope.STORE;
    if (scope === CustomerTaxonomyScope.STORE && !dto.storeId) throw new BadRequestException('Branch is required for a branch category');
    await this.assertUniqueCategory(organizationId, scope, dto.storeId || null, name);
    return this.categoryRepository.save(this.categoryRepository.create({
      organizationId,
      scope,
      storeId: scope === CustomerTaxonomyScope.STORE ? dto.storeId! : null,
      name,
      color: dto.color || '#7c3aed',
      sortOrder: dto.sortOrder || 0,
    }));
  }

  async updateCategory(id: string, organizationId: string, dto: UpdateCustomerCategoryDto) {
    const category = await this.categoryRepository.findOne({ where: { id, organizationId } });
    if (!category) throw new NotFoundException('Customer category not found');
    if (dto.name !== undefined) {
      const name = this.cleanName(dto.name);
      await this.assertUniqueCategory(organizationId, category.scope, category.storeId, name, id);
      category.name = name;
    }
    if (dto.color !== undefined) category.color = dto.color;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    return this.categoryRepository.save(category);
  }

  async deleteCategory(id: string, organizationId: string) {
    const category = await this.categoryRepository.findOne({ where: { id, organizationId } });
    if (!category) throw new NotFoundException('Customer category not found');
    await this.categoryRepository.manager.transaction(async (manager) => {
      await manager.query('DELETE FROM customer_category_links WHERE "categoryId" = $1', [id]);
      await manager.getRepository(CustomerCategory).delete({ id, organizationId });
    });
    return { success: true };
  }

  async createTag(organizationId: string, dto: CreateCustomerTagDto) {
    const name = this.cleanName(dto.name);
    const scope = dto.scope || CustomerTaxonomyScope.STORE;
    if (scope === CustomerTaxonomyScope.STORE && !dto.storeId) throw new BadRequestException('Branch is required for a branch tag');
    await this.assertUniqueTag(organizationId, scope, dto.storeId || null, name);
    return this.tagRepository.save(this.tagRepository.create({
      organizationId,
      scope,
      storeId: scope === CustomerTaxonomyScope.STORE ? dto.storeId! : null,
      name,
      color: dto.color || '#2563eb',
    }));
  }

  async updateTag(id: string, organizationId: string, dto: UpdateCustomerTagDto) {
    const tag = await this.tagRepository.findOne({ where: { id, organizationId } });
    if (!tag) throw new NotFoundException('Customer tag not found');
    if (dto.name !== undefined) {
      const name = this.cleanName(dto.name);
      await this.assertUniqueTag(organizationId, tag.scope, tag.storeId, name, id);
      tag.name = name;
    }
    if (dto.color !== undefined) tag.color = dto.color;
    if (dto.isActive !== undefined) tag.isActive = dto.isActive;
    return this.tagRepository.save(tag);
  }

  async deleteTag(id: string, organizationId: string) {
    const tag = await this.tagRepository.findOne({ where: { id, organizationId } });
    if (!tag) throw new NotFoundException('Customer tag not found');
    await this.tagRepository.manager.transaction(async (manager) => {
      await manager.query('DELETE FROM customer_tag_links WHERE "tagId" = $1', [id]);
      await manager.getRepository(CustomerTag).delete({ id, organizationId });
    });
    return { success: true };
  }

  async getCustomersByIdsForStore(storeId: string, customerIds: string[]) {
    if (!customerIds.length) return [];
    const uniqueIds = [...new Set(customerIds)];
    const customers = await this.customerRepository.find({ where: { id: In(uniqueIds), storeId }, relations: ['store', 'categories', 'tags'] });
    if (customers.length !== uniqueIds.length) throw new BadRequestException('One or more selected customers do not belong to the selected branch');
    return customers;
  }

  async getCustomersByIdsForOrganization(organizationId: string, customerIds: string[], storeIds?: string[]) {
    if (!customerIds.length) return [];
    const uniqueIds = [...new Set(customerIds)];
    const query = this.customerRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.store', 'store')
      .leftJoinAndSelect('customer.categories', 'category')
      .leftJoinAndSelect('customer.tags', 'tag')
      .where('customer.id IN (:...ids)', { ids: uniqueIds })
      .andWhere('store.organizationId = :organizationId', { organizationId })
      .distinct(true);
    if (storeIds?.length) query.andWhere('customer.storeId IN (:...storeIds)', { storeIds: [...new Set(storeIds)] });
    const customers = await query.getMany();
    if (customers.length !== uniqueIds.length) throw new BadRequestException('One or more selected customers are outside the selected organization/branches');
    return customers;
  }

  deduplicateWhatsAppCustomers(customers: Customer[]) {
    const groups = new Map<string, Customer[]>();
    for (const customer of customers) {
      const phone = this.normalizePhone(customer.phoneNumber || customer.whatsappId || '');
      if (!phone) continue;
      const list = groups.get(phone) || [];
      list.push(customer);
      groups.set(phone, list);
    }
    const unique = [...groups.entries()].map(([phone, rows]) => ({
      phone,
      customer: [...rows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
      duplicateCustomerIds: rows.slice(1).map((item) => item.id),
      storeIds: [...new Set(rows.map((item) => item.storeId))],
    }));
    return {
      unique,
      sourceRecords: customers.length,
      uniqueRecipients: unique.length,
      duplicateRecords: Math.max(0, customers.length - unique.length),
    };
  }

  private async resolveCategories(organizationId: string, storeId: string, ids: string[]) {
    if (!ids.length) return [];
    const uniqueIds = [...new Set(ids)];
    const rows = await this.categoryRepository.createQueryBuilder('item')
      .where('item.id IN (:...ids)', { ids: uniqueIds })
      .andWhere('item.organizationId = :organizationId', { organizationId })
      .andWhere('(item.scope = :orgScope OR (item.scope = :storeScope AND item.storeId = :storeId))', {
        orgScope: CustomerTaxonomyScope.ORGANIZATION,
        storeScope: CustomerTaxonomyScope.STORE,
        storeId,
      }).getMany();
    if (rows.length !== uniqueIds.length) throw new BadRequestException('One or more customer categories are not available to this branch');
    return rows;
  }

  private async resolveTags(organizationId: string, storeId: string, ids: string[]) {
    if (!ids.length) return [];
    const uniqueIds = [...new Set(ids)];
    const rows = await this.tagRepository.createQueryBuilder('item')
      .where('item.id IN (:...ids)', { ids: uniqueIds })
      .andWhere('item.organizationId = :organizationId', { organizationId })
      .andWhere('(item.scope = :orgScope OR (item.scope = :storeScope AND item.storeId = :storeId))', {
        orgScope: CustomerTaxonomyScope.ORGANIZATION,
        storeScope: CustomerTaxonomyScope.STORE,
        storeId,
      }).getMany();
    if (rows.length !== uniqueIds.length) throw new BadRequestException('One or more customer tags are not available to this branch');
    return rows;
  }

  private async resolveTagNames(organizationId: string, storeId: string, names: string[]) {
    const rows: CustomerTag[] = [];
    for (const raw of [...new Set(names.map((name) => this.cleanName(name)).filter(Boolean))]) {
      let tag = await this.tagRepository.createQueryBuilder('tag')
        .where('tag.organizationId = :organizationId', { organizationId })
        .andWhere('tag.scope = :scope', { scope: CustomerTaxonomyScope.STORE })
        .andWhere('tag.storeId = :storeId', { storeId })
        .andWhere('LOWER(tag.name) = LOWER(:name)', { name: raw })
        .getOne();
      if (!tag) tag = await this.tagRepository.save(this.tagRepository.create({ organizationId, scope: CustomerTaxonomyScope.STORE, storeId, name: raw, color: '#2563eb' }));
      rows.push(tag);
    }
    return rows;
  }

  private async migrateLegacyTags(customers: Customer[], storeId: string, organizationId?: string) {
    if (!organizationId) return;
    const candidates = customers.filter((customer) => customer.legacyTags?.length && !(customer.tags?.length));
    for (const customer of candidates) {
      customer.tags = await this.resolveTagNames(organizationId, storeId, customer.legacyTags);
      await this.customerRepository.save(customer);
    }
  }

  private async reloadWithRelations(ids: string[]) {
    if (!ids.length) return [];
    return this.customerRepository.find({
      where: { id: In(ids) },
      relations: ['store', 'categories', 'tags'],
      order: { updatedAt: 'DESC' },
    });
  }

  private cleanName(name: string) {
    const value = String(name || '').trim().replace(/\s+/g, ' ');
    if (!value) throw new BadRequestException('Name is required');
    if (value.length > 80) throw new BadRequestException('Name is too long');
    return value;
  }

  private async assertUniqueCategory(organizationId: string, scope: CustomerTaxonomyScope, storeId: string | null, name: string, exceptId?: string) {
    const query = this.categoryRepository.createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('item.scope = :scope', { scope })
      .andWhere(scope === CustomerTaxonomyScope.ORGANIZATION ? 'item.storeId IS NULL' : 'item.storeId = :storeId', { storeId })
      .andWhere('LOWER(item.name) = LOWER(:name)', { name });
    if (exceptId) query.andWhere('item.id <> :exceptId', { exceptId });
    if (await query.getOne()) throw new BadRequestException('A category with this name already exists in this scope');
  }

  private async assertUniqueTag(organizationId: string, scope: CustomerTaxonomyScope, storeId: string | null, name: string, exceptId?: string) {
    const query = this.tagRepository.createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId })
      .andWhere('item.scope = :scope', { scope })
      .andWhere(scope === CustomerTaxonomyScope.ORGANIZATION ? 'item.storeId IS NULL' : 'item.storeId = :storeId', { storeId })
      .andWhere('LOWER(item.name) = LOWER(:name)', { name });
    if (exceptId) query.andWhere('item.id <> :exceptId', { exceptId });
    if (await query.getOne()) throw new BadRequestException('A tag with this name already exists in this scope');
  }

  private normalizePhone(value: string) {
    return normalizePhoneNumber(value);
  }
}
