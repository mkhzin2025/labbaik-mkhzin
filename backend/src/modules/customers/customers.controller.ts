import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CustomersService, audienceToFilters } from './customers.service';
import type { CustomerPageOptions, CustomerSegment, CustomerSortKey } from './customers.service';
import { CompetitionSyncService } from './competition-sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkCustomerTaxonomyDto,
  CreateCustomerCategoryDto,
  CreateCustomerTagDto,
  CustomerAudienceDto,
  ImportCustomersDto,
  UpdateCustomerCategoryDto,
  UpdateCustomerDto,
  UpdateCustomerTagDto,
} from './dto/customer.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { CustomerTaxonomyScope } from './entities/customer-category.entity';
import { Access } from '../organizations/access';

@ApiTags('Customers')
@ApiBearerAuth()
@Access('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly organizationsService: OrganizationsService,
    private readonly competitionSyncService: CompetitionSyncService,
  ) {}

  @Get('sync/competition')
  async competitionSyncState(@Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.competitionSyncService.getState(organization.id);
  }

  /** Pulls competition participants into their branches; owners/admins only. `full` re-reads every page. */
  @Post('sync/competition')
  async startCompetitionSync(@Request() req: any, @Body() body: { full?: boolean }) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(req.user.id, req.user.organizationId);
    return this.competitionSyncService.start(organization.id, body?.full === true);
  }

  @Get()
  @Access('customers', 'whatsapp')
  async findAll(
    @Request() req: any,
    @Query('storeId') storeId?: string,
    @Query('scope') scope?: 'organization' | 'store',
    @Query('storeIds') storeIds?: string,
    @Query('search') search?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('tagIds') tagIds?: string,
    @Query('tagMatch') tagMatch?: 'any' | 'all',
    @Query('excludeCategoryIds') excludeCategoryIds?: string,
    @Query('excludeTagIds') excludeTagIds?: string,
    @Query('whatsappOnly') whatsappOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('segment') segment?: CustomerSegment,
    @Query('sort') sort?: CustomerSortKey,
    @Query('dir') dir?: 'asc' | 'desc',
    @Query('counts') counts?: string,
  ) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const requestedStoreIds = this.csv(storeIds);
    const filters = {
      search,
      storeIds: requestedStoreIds,
      categoryIds: this.csv(categoryIds),
      tagIds: this.csv(tagIds),
      tagMatch: tagMatch === 'all' ? 'all' as const : 'any' as const,
      excludeCategoryIds: this.csv(excludeCategoryIds),
      excludeTagIds: this.csv(excludeTagIds),
      whatsappOnly: whatsappOnly === 'true',
    };
    // Without `page` the endpoint keeps returning the full array (used by broadcast recipient pickers).
    // `counts=false`: same filters as the previous page, so the client reuses the totals it already has.
    const paging = page !== undefined ? { ...this.pageOptions(page, limit, segment, sort, dir), withCounts: counts !== 'false' } : null;
    if (scope === 'organization' || !storeId) {
      const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, requestedStoreIds);
      if (!access.storeIds.length) return paging ? { items: [], total: 0, page: paging.page, limit: paging.limit, counts: { all: 0, categorized: 0, uncategorized: 0, tagged: 0, untagged: 0 } } : [];
      const scopedFilters = { ...filters, storeIds: access.storeIds };
      return paging
        ? this.customersService.findPage({ organizationId: organization.id }, scopedFilters, paging)
        : this.customersService.findAllByOrganization(organization.id, scopedFilters);
    }
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, organization.id, storeId);
    return paging
      ? this.customersService.findPage({ storeId: store.id }, filters, paging)
      : this.customersService.findAllByStore(store.id, filters);
  }

  @Patch('bulk')
  async bulkUpdate(@Request() req: any, @Body() dto: BulkCustomerTaxonomyDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, dto.storeId);
    if (!dto.categoryIds?.length && !dto.tagIds?.length) throw new BadRequestException('Choose at least one category or tag');
    return this.customersService.bulkUpdateTaxonomy(dto.storeId, organization.id, dto);
  }

  @Post('import')
  async importCustomers(@Request() req: any, @Body() dto: ImportCustomersDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, dto.storeId);
    return this.customersService.importCustomers(dto.storeId, organization.id, dto.rows, dto.tagIds || []);
  }

  @Get('export/options')
  async exportOptions(@Request() req: any, @Query('storeIds') storeIds?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, this.csv(storeIds));
    return this.customersService.getExportTags(organization.id, access.storeIds);
  }

  @Get('export/statistics-sources')
  async statisticsSources(@Request() req: any, @Query('storeIds') storeIds?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, this.csv(storeIds));
    return this.customersService.getStatisticsSources(organization.id, access.storeIds);
  }

  @Get('export')
  async exportCustomers(
    @Request() req: any,
    @Res() response: Response,
    @Query('format') format?: 'xlsx' | 'pdf',
    @Query('exportType') exportType?: 'customers' | 'statistics',
    @Query('storeIds') storeIds?: string,
    @Query('tagId') tagId?: string,
    @Query('sources') sources?: string,
    @Query('baselineDate') baselineDate?: string,
    @Query('branchDetails') branchDetails?: string,
  ) {
    if (format !== 'xlsx' && format !== 'pdf') throw new BadRequestException('Export format must be xlsx or pdf');
    if (exportType && exportType !== 'customers' && exportType !== 'statistics') throw new BadRequestException('Export type must be customers or statistics');
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, this.csv(storeIds));
    if (!access.storeIds.length) throw new BadRequestException('Choose at least one branch');
    await this.customersService.exportCustomers(response, {
      organizationId: organization.id,
      storeIds: access.storeIds,
      tagId: tagId || undefined,
      format,
      exportType: exportType || 'customers',
      sources: this.csv(sources),
      baselineDate: baselineDate || undefined,
      branchDetails: branchDetails === 'true',
    });
  }

  /** Categories/tags of the selected branches with reachable-customer counts, for the campaign audience builder. */
  @Get('audience/options')
  @Access('customers', 'whatsapp')
  async audienceOptions(@Request() req: any, @Query('storeIds') storeIds?: string, @Query('categoryIds') categoryIds?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, this.csv(storeIds));
    return this.customersService.getAudienceOptions(organization.id, access.storeIds, this.csv(categoryIds) || []);
  }

  /** How many numbers a campaign audience reaches, after opt-outs and duplicate numbers. */
  @Post('audience/summary')
  @Access('customers', 'whatsapp')
  async audienceSummary(@Request() req: any, @Body() dto: CustomerAudienceDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, dto.storeIds);
    return this.customersService.summarizeAudience(organization.id, audienceToFilters(dto, access.storeIds));
  }

  @Get('taxonomy/usage')
  async taxonomyUsage(@Request() req: any, @Query('storeId') storeId: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if (!storeId) throw new BadRequestException('storeId is required');
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, storeId);
    return this.customersService.getTaxonomyUsage(storeId);
  }

  @Get('taxonomy')
  @Access('customers', 'conversations', 'whatsapp')
  async taxonomy(@Request() req: any, @Query('storeId') storeId?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if (storeId) await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, storeId);
    return this.customersService.getTaxonomy(organization.id, storeId);
  }

  @Post('categories')
  async createCategory(@Request() req: any, @Body() dto: CreateCustomerCategoryDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if ((dto.scope || CustomerTaxonomyScope.STORE) === CustomerTaxonomyScope.STORE) {
      if (!dto.storeId) throw new BadRequestException('storeId is required');
      await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, dto.storeId);
    }
    return this.customersService.createCategory(organization.id, dto);
  }

  @Patch('categories/:id')
  async updateCategory(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCustomerCategoryDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.customersService.updateCategory(id, organization.id, dto);
  }

  @Delete('categories/:id')
  async deleteCategory(@Request() req: any, @Param('id') id: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.customersService.deleteCategory(id, organization.id);
  }

  @Post('tags')
  async createTag(@Request() req: any, @Body() dto: CreateCustomerTagDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if ((dto.scope || CustomerTaxonomyScope.STORE) === CustomerTaxonomyScope.STORE) {
      if (!dto.storeId) throw new BadRequestException('storeId is required');
      await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, dto.storeId);
    }
    return this.customersService.createTag(organization.id, dto);
  }

  @Patch('tags/:id')
  async updateTag(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCustomerTagDto) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.customersService.updateTag(id, organization.id, dto);
  }

  @Delete('tags/:id')
  async deleteTag(@Request() req: any, @Param('id') id: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.customersService.deleteTag(id, organization.id);
  }

  @Get(':id')
  @Access('customers', 'conversations')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const customer = await this.customersService.findOneInOrganization(id, organization.id);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, customer.storeId);
    return customer;
  }

  @Patch(':id')
  @Access('customers', 'conversations')
  async update(@Param('id') id: string, @Body() updateData: UpdateCustomerDto, @Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const customer = await this.customersService.findOneInOrganization(id, organization.id);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, customer.storeId);
    return this.customersService.update(id, customer.storeId, updateData);
  }

  private pageOptions(page?: string, limit?: string, segment?: CustomerSegment, sort?: CustomerSortKey, dir?: 'asc' | 'desc'): CustomerPageOptions {
    const segments: CustomerSegment[] = ['all', 'categorized', 'uncategorized', 'tagged', 'untagged'];
    const sorts: CustomerSortKey[] = ['fullName', 'phoneNumber', 'createdAt', 'updatedAt'];
    return {
      page: Math.max(1, Number.parseInt(page || '1', 10) || 1),
      limit: Math.min(100, Math.max(1, Number.parseInt(limit || '25', 10) || 25)),
      segment: segment && segments.includes(segment) ? segment : 'all',
      sort: sort && sorts.includes(sort) ? sort : 'updatedAt',
      dir: dir === 'asc' ? 'asc' : 'desc',
    };
  }

  private csv(value?: string) {
    return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
  }
}
