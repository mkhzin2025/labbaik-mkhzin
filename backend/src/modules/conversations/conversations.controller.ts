import { Controller, Get, Post, Param, UseGuards, Request, Patch, Body, NotFoundException, Res, BadRequestException, Query, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';
import { OrganizationsService } from '../organizations/organizations.service';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly organizationsService: OrganizationsService,
    private readonly whatsAppMediaService: WhatsAppMediaService,
  ) {}

  @Get()
  async findAll(@Request() req: any, @Query('storeId') storeId?: string, @Query('scope') scope?: 'organization' | 'store') {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if (scope === 'organization') {
      const { stores } = await this.organizationsService.listStoresForUser(req.user.id, organization.id);
      return this.conversationsService.findAllByStores(stores.map((store) => store.id));
    }
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, organization.id, storeId);
    return this.conversationsService.findAllByStore(store.id);
  }

  @Get('stats')
  async getStats(@Request() req: any, @Query('storeId') storeId?: string) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId, storeId);
    return this.conversationsService.getStats(store.id);
  }

  @Get('attachments/:filename')
  async getAttachment(@Param('filename') filename: string, @Res() res: any) {
    if (filename !== basename(filename)) throw new BadRequestException('Invalid attachment filename');
    const filePath = join(this.whatsAppMediaService.getWhatsAppUploadRoot(), filename);
    if (!existsSync(filePath)) throw new NotFoundException('Attachment not found');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return createReadStream(filePath).pipe(res);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.requireOwnedConversation(id, req);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    await this.requireOwnedConversation(id, req);
    return this.conversationsService.markAsRead(id);
  }

  @Patch(':id/toggle-ai')
  async toggleAi(@Param('id') id: string, @Body('enabled') enabled: boolean, @Request() req: any) {
    await this.requireOwnedConversation(id, req);
    return this.conversationsService.toggleAi(id, enabled);
  }

  @Patch(':id/tags')
  async updateTags(@Param('id') id: string, @Body('tags') tags: string[], @Request() req: any) {
    await this.requireOwnedConversation(id, req);
    return this.conversationsService.updateTags(id, tags);
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body('text') text: string, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    return this.conversationsService.sendMessage(id, conversation.storeId, text);
  }

  private async requireOwnedConversation(id: string, req: any) {
    const conversation: any = await this.conversationsService.findOne(id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    try {
      await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, conversation.storeId);
    } catch {
      throw new ForbiddenException('Conversation is outside your accessible branches');
    }
    return conversation;
  }
}
