import { Controller, Get, Post, Patch, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples } from '../../common/swagger/api-examples';
import { OrganizationsService } from '../organizations/organizations.service';

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create or update the authenticated user store profile' })
  @ApiBody({ type: CreateStoreDto, examples: { default: { value: examples.store.create } } })
  @ApiResponse({ status: 201, description: 'Store profile created or updated.', schema: { example: examples.store.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.storesService.create(createStoreDto, req.user, organization.id);
  }

  @Get()
  @ApiOperation({ summary: 'List branches for the active organization' })
  async findAll(@Request() req) {
    const { stores } = await this.organizationsService.listStoresForUser(req.user.id, req.user.organizationId);
    return stores;
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the default/legacy store profile' })
  @ApiResponse({ status: 200, description: 'Current store profile.', schema: { example: examples.store.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ description: 'Create a store profile first with POST /stores.', schema: { example: examples.errors.storeNotFound } })
  async findMe(@Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return store;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.storesService.findByIdInOrganization(id, organization.id);
  }

  @Patch('me')
  async update(@Body() updateStoreDto: UpdateStoreDto, @Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.storesService.updateById(store.id, store.organizationId!, updateStoreDto);
  }

  @Patch(':id')
  async updateOne(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto, @Request() req) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.storesService.updateById(id, organization.id, updateStoreDto);
  }
}
