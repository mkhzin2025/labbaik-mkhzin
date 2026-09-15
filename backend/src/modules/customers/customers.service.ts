import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerCategory)
    private readonly categoryRepository: Repository<CustomerCategory>,
    @InjectRepository(CustomerTag)
    private readonly tagRepository: Repository<CustomerTag>,
  ) {}

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
    const { categoryIds, tagIds, tags, ...base } = updateData;
    Object.assign(customer, base);

    if (categoryIds !== undefined) customer.categories = await this.resolveCategories(organizationId, storeId, categoryIds);
    if (tagIds !== undefined) customer.tags = await this.resolveTags(organizationId, storeId, tagIds);
    else if (tags !== undefined) customer.tags = await this.resolveTagNames(organizationId, storeId, tags);

    if (tags !== undefined) customer.legacyTags = tags;
    const saved = await this.customerRepository.save(customer);
    return this.findOne(saved.id, storeId);
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
    return String(value || '').replace(/[^0-9]/g, '');
  }
}
