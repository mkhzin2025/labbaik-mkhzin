import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { StoresService } from '../stores/stores.service';
import { CreateChannelDto } from './dto/channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';

@ApiTags('Channels')
@ApiBearerAuth()
@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly storesService: StoresService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a channel for the authenticated store', description: 'Requires a store profile. Create one with POST /stores first.' })
  @ApiBody({ type: CreateChannelDto, examples: { whatsapp: { value: examples.channel.create } } })
  @ApiResponse({ status: 201, description: 'Channel created.', schema: { example: examples.channel.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async create(@Body() createChannelDto: CreateChannelDto, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    if (!store) {
      throw new NotFoundException('Please create a store profile first');
    }
    return this.channelsService.create(createChannelDto, store);
  }

  @Get()
  @ApiOperation({ summary: 'List channels for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store channels.', schema: { example: [examples.channel.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.channelsService.findAllByStore(store.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one channel by id' })
  @ApiParam({ name: 'id', example: ids.channel })
  @ApiResponse({ status: 200, description: 'Channel found.', schema: { example: examples.channel.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Channel not found', error: 'Not Found', statusCode: 404 } } })
  async findOne(@Param('id') id: string, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.channelsService.findOne(id, store.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one channel by id' })
  @ApiParam({ name: 'id', example: ids.channel })
  @ApiResponse({ status: 200, description: 'Deleted channel.', schema: { example: examples.channel.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Channel not found', error: 'Not Found', statusCode: 404 } } })
  async remove(@Param('id') id: string, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.channelsService.remove(id, store.id);
  }
}
