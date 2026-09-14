import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FlowsService } from './flows.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoresService } from '../stores/stores.service';
import { examples, ids } from '../../common/swagger/api-examples';

@ApiTags('Flows')
@ApiBearerAuth()
@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  constructor(
    private readonly flowsService: FlowsService,
    private readonly storesService: StoresService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List automation flows for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store flows.', schema: { example: [examples.flow.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.flowsService.findAllByStore(store.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one automation flow by id' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiResponse({ status: 200, description: 'Flow found.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async findOne(@Param('id') id: string, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.flowsService.findOne(id, store.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation flow' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.flow.create } } })
  @ApiResponse({ status: 201, description: 'Flow created.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async create(@Body() data: any, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.flowsService.create(store, data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an automation flow' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.flow.update } } })
  @ApiResponse({ status: 200, description: 'Flow updated.', schema: { example: { ...examples.flow.item, ...examples.flow.update } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async update(@Param('id') id: string, @Body() data: any, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.flowsService.update(id, store.id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an automation flow' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiResponse({ status: 200, description: 'Deleted flow.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async delete(@Param('id') id: string, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.flowsService.delete(id, store.id);
  }
}
