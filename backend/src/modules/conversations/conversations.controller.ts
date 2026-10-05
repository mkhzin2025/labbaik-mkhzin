import { Controller, Get, Post, Param, UseGuards, Request, Patch, Body, NotFoundException, Res, BadRequestException, Query, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';
import { OrganizationsService } from '../organizations/organizations.service';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { CONVERSATION_STATUSES } from './schemas/conversation.schema';
import type { ConversationStatus } from './schemas/conversation.schema';

export class UpdateConversationStatusDto {
  @IsIn(CONVERSATION_STATUSES as unknown as string[])
  status: ConversationStatus;

  @IsOptional()
  @IsISO8601()
  snoozedUntil?: string;
}

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

  @Get('analytics')
  async getAnalytics(@Request() req: any, @Query('days') days?: string, @Query('tz') tz?: string, @Query('storeId') storeId?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const { stores } = await this.organizationsService.listStoresForUser(req.user.id, organization.id);
    const accessible = stores.map((store) => store.id);
    if (storeId && !accessible.includes(storeId)) throw new ForbiddenException('Branch is outside your access');
    const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const offset = Math.max(-840, Math.min(840, Number.parseInt(tz || '0', 10) || 0));
    return this.conversationsService.getAnalytics(storeId ? [storeId] : accessible, period, offset);
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

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateConversationStatusDto, @Request() req: any) {
    await this.requireOwnedConversation(id, req);
    let snoozedUntil: Date | null = null;
    if (dto.status === 'snoozed') {
      snoozedUntil = dto.snoozedUntil ? new Date(dto.snoozedUntil) : null;
      const maxAhead = Date.now() + 90 * 86_400_000;
      if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil.getTime() <= Date.now() || snoozedUntil.getTime() > maxAhead) {
        throw new BadRequestException('snoozedUntil must be a future date within 90 days');
      }
    }
    return this.conversationsService.setStatus(id, dto.status, snoozedUntil);
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
