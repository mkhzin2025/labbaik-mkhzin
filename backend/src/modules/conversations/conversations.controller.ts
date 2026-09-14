import { Controller, Get, Post, Param, UseGuards, Request, Patch, Body, NotFoundException, Res, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoresService } from '../stores/stores.service';
import { examples, ids } from '../../common/swagger/api-examples';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly storesService: StoresService,
    private readonly whatsAppMediaService: WhatsAppMediaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List conversations for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store conversations.', schema: { example: [examples.conversation.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.conversationsService.findAllByStore(store.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get conversation dashboard stats for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Conversation stats.', schema: { example: examples.conversation.stats } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async getStats(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.conversationsService.getStats(store.id);
  }

  @Get('attachments/:filename')
  @ApiOperation({ summary: 'Download a stored WhatsApp attachment' })
  async getAttachment(@Param('filename') filename: string, @Res() res: any) {
    if (filename !== basename(filename)) {
      throw new BadRequestException('Invalid attachment filename');
    }

    const filePath = join(this.whatsAppMediaService.getWhatsAppUploadRoot(), filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Attachment not found');
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    return createReadStream(filePath).pipe(res);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one conversation by id' })
  @ApiParam({ name: 'id', example: ids.conversation })
  @ApiResponse({ status: 200, description: 'Conversation found.', schema: { example: examples.conversation.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Conversation not found', error: 'Not Found', statusCode: 404 } } })
  async findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one conversation as read' })
  @ApiParam({ name: 'id', example: ids.conversation })
  @ApiResponse({ status: 200, description: 'Conversation updated.', schema: { example: { ...examples.conversation.item, unreadCount: 0 } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async markAsRead(@Param('id') id: string) {
    return this.conversationsService.markAsRead(id);
  }

  @Patch(':id/toggle-ai')
  @ApiOperation({ summary: 'Enable or disable AI replies for one conversation' })
  @ApiParam({ name: 'id', example: ids.conversation })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.conversation.toggleAi } } })
  @ApiResponse({ status: 200, description: 'Conversation AI state updated.', schema: { example: { ...examples.conversation.item, aiEnabled: false } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async toggleAi(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.conversationsService.toggleAi(id, enabled);
  }

  @Patch(':id/tags')
  @ApiOperation({ summary: 'Update tags for one conversation' })
  @ApiParam({ name: 'id', example: ids.conversation })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.conversation.tags } } })
  @ApiResponse({ status: 200, description: 'Conversation tags updated.', schema: { example: { ...examples.conversation.item, tags: examples.conversation.tags.tags } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async updateTags(@Param('id') id: string, @Body('tags') tags: string[]) {
    return this.conversationsService.updateTags(id, tags);
  }

  // MANUAL SEND ENDPOINT
  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a manual message in one conversation' })
  @ApiParam({ name: 'id', example: ids.conversation })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.conversation.message } } })
  @ApiResponse({ status: 201, description: 'Message sent.', schema: { example: examples.conversation.sent } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Conversation not found', error: 'Not Found', statusCode: 404 } } })
  async sendMessage(
    @Param('id') id: string,
    @Body('text') text: string,
    @Request() req
  ) {
    const store = await this.storesService.findByOwner(req.user.id);
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return this.conversationsService.sendMessage(id, store.id, text);
  }
}
