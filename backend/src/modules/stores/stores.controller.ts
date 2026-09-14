import { Controller, Get, Post, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples } from '../../common/swagger/api-examples';

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update the authenticated user store profile', description: 'Run this after registration before using channels, customers, conversations, flows, or reviews.' })
  @ApiBody({ type: CreateStoreDto, examples: { default: { value: examples.store.create } } })
  @ApiResponse({ status: 201, description: 'Store profile created or updated.', schema: { example: examples.store.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    return this.storesService.create(createStoreDto, req.user);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user store profile' })
  @ApiResponse({ status: 200, description: 'Current store profile.', schema: { example: examples.store.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ description: 'Create a store profile first with POST /stores.', schema: { example: examples.errors.storeNotFound } })
  async findMe(@Request() req) {
    return this.storesService.findByOwner(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user store profile' })
  @ApiBody({ type: UpdateStoreDto, examples: { default: { value: examples.store.update } } })
  @ApiResponse({ status: 200, description: 'Store profile updated.', schema: { example: examples.store.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async update(@Body() updateStoreDto: UpdateStoreDto, @Request() req) {
    return this.storesService.update(req.user.id, updateStoreDto);
  }
}
