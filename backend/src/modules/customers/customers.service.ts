import { normalizePhoneNumber } from '../../common/utils/phone.util';
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

export type CustomerFilters = {
  search?: string;
  categoryIds?: string[];
  tagIds?: string[];
  whatsappOnly?: boolean;
  storeIds?: string[];
};

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

  private async findAllScoped(organizationId?: string, storeId?: string, filters: CustomerFilters = {}) {
    const query = this.customerRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.store', 'store')
      .leftJoinAndSelect('customer.categories', 'category')
      .leftJoinAndSelect('customer.tags', 'tag')
      .orderBy('customer.updatedAt', 'DESC')
      .distinct(true);

    if (storeId) query.where('customer.storeId = :storeId', { storeId });
    else if (organizationId) query.where('store.organizationId = :organizationId', { organizationId });
    else throw new BadRequestException('Organization or branch scope is required');

    if (filters.storeIds?.length) {
      query.andWhere('customer.storeId IN (:...storeIds)', { storeIds: [...new Set(filters.storeIds)] });
    }

    if (filters.search?.trim()) {
      const search = `%${filters.search.trim().toLowerCase()}%`;
      query.andWhere(new Brackets((qb) => {
        qb.where('LOWER(COALESCE(customer.fullName, \'\')) LIKE :search', { search })
          .orWhere('LOWER(COALESCE(customer.email, \'\')) LIKE :search', { search })
          .orWhere('COALESCE(customer.phoneNumber, \'\') LIKE :phoneSearch', { phoneSearch: `%${filters.search!.replace(/[^0-9]/g, '')}%` });
      }));
    }

    if (filters.categoryIds?.length) query.andWhere('category.id IN (:...categoryIds)', { categoryIds: filters.categoryIds });
    if (filters.tagIds?.length) query.andWhere('tag.id IN (:...tagIds)', { tagIds: filters.tagIds });
    if (filters.whatsappOnly) query.andWhere("COALESCE(customer.phoneNumber, customer.whatsappId, '') <> ''");

    const customers = await query.getMany();
    for (const customer of customers) {
      await this.migrateLegacyTags([customer], customer.storeId, customer.store?.organizationId || organizationId);
    }
    return this.reloadWithRelations(customers.map((customer) => customer.id));
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
      query.andWhere('EXISTS (SELECT 1 FROM customer_tag_links ftl WHERE ftl."customerId" = customer.id AND ftl."tagId" IN (:...tagIds))', { tagIds: filters.tagIds });
    }
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
