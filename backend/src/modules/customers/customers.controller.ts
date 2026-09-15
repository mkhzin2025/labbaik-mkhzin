import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateCustomerCategoryDto,
  CreateCustomerTagDto,
  UpdateCustomerCategoryDto,
  UpdateCustomerDto,
  UpdateCustomerTagDto,
} from './dto/customer.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { CustomerTaxonomyScope } from './entities/customer-category.entity';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  async findAll(
    @Request() req: any,
    @Query('storeId') storeId?: string,
    @Query('scope') scope?: 'organization' | 'store',
    @Query('storeIds') storeIds?: string,
    @Query('search') search?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('tagIds') tagIds?: string,
    @Query('whatsappOnly') whatsappOnly?: string,
  ) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const requestedStoreIds = this.csv(storeIds);
    const filters = {
      search,
      storeIds: requestedStoreIds,
      categoryIds: this.csv(categoryIds),
      tagIds: this.csv(tagIds),
      whatsappOnly: whatsappOnly === 'true',
    };
    if (scope === 'organization' || !storeId) {
      const access = await this.organizationsService.assertRequestedStoresAccessible(req.user.id, organization.id, requestedStoreIds);
      if (!access.storeIds.length) return [];
      return this.customersService.findAllByOrganization(organization.id, { ...filters, storeIds: access.storeIds });
    }
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, organization.id, storeId);
    return this.customersService.findAllByStore(store.id, filters);
  }

  @Get('taxonomy')
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
  async findOne(@Param('id') id: string, @Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const customer = await this.customersService.findOneInOrganization(id, organization.id);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, customer.storeId);
    return customer;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: UpdateCustomerDto, @Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const customer = await this.customersService.findOneInOrganization(id, organization.id);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, customer.storeId);
    return this.customersService.update(id, customer.storeId, updateData);
  }

  private csv(value?: string) {
    return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
  }
}
