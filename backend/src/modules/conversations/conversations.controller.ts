import { Controller, Get, Post, Param, UseGuards, Request, Patch, Body, NotFoundException, Res, BadRequestException, Query, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';
import { OrganizationsService } from '../organizations/organizations.service';
import { CustomersService } from '../customers/customers.service';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CONVERSATION_STATUSES } from './schemas/conversation.schema';
import type { ConversationStatus } from './schemas/conversation.schema';
import type { InboxFilters, InboxTab, InboxView } from './conversations.service';

export class InboxFilterQueryDto {
  @IsOptional() @IsIn(['organization', 'store'])
  scope?: 'organization' | 'store';

  @IsOptional() @IsString()
  storeId?: string;

  @IsOptional() @IsIn(['active', 'snoozed', 'closed'])
  view?: InboxView;

  @IsOptional() @IsIn(['all', 'unread', 'needs_reply'])
  tab?: InboxTab;

  @IsOptional() @IsIn(['whatsapp', 'instagram', 'facebook', 'google_maps'])
  platform?: string;

  @IsOptional() @IsString() @MaxLength(100)
  tag?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}

export class InboxPageQueryDto extends InboxFilterQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsString() @MaxLength(500)
  cursor?: string;
}

export class MessagesPageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  before?: number;
}

export class UpdateConversationStatusDto {
  @IsIn(CONVERSATION_STATUSES as unknown as string[])
  status: ConversationStatus;

  @IsOptional()
  @IsISO8601()
  snoozedUntil?: string;
}

export class TransferCustomerDto {
  @IsUUID()
  storeId: string;
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
    private readonly customersService: CustomersService,
  ) {}

  /** Paged inbox: `{ items, nextCursor }`. Pass `nextCursor` back as `cursor` for the next page. */
  @Get()
  async findAll(@Request() req: any, @Query() query: InboxPageQueryDto) {
    const storeIds = await this.resolveStoreIds(req, query.scope, query.storeId);
    return this.conversationsService.findPage(storeIds, this.toFilters(query), { limit: query.limit, cursor: query.cursor });
  }

  @Get('counts')
  async getCounts(@Request() req: any, @Query() query: InboxFilterQueryDto) {
    const storeIds = await this.resolveStoreIds(req, query.scope, query.storeId);
    return this.conversationsService.countInbox(storeIds, this.toFilters(query));
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

  /** Moves a customer and their conversations to another branch; the user needs access to both branches. */
  @Patch('customers/:customerId/store')
  async transferCustomer(@Param('customerId') customerId: string, @Body() dto: TransferCustomerDto, @Request() req: any) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    const customer = await this.customersService.findOneInOrganization(customerId, organization.id);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, customer.storeId);
    await this.organizationsService.assertStoreAccessibleByUser(req.user.id, organization.id, dto.storeId);
    return this.conversationsService.transferCustomer(customerId, organization.id, dto.storeId);
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
    return this.conversationsService.withCustomerName(await this.requireOwnedConversation(id, req));
  }

  /** Messages oldest → newest, read from the end. Pass the returned `start` as `before` to load older ones. */
  @Get(':id/messages')
  async findMessages(@Param('id') id: string, @Query() query: MessagesPageQueryDto, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    return this.conversationsService.findMessages(id, conversation.storeId, { limit: query.limit, before: query.before });
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

  private toFilters(query: InboxFilterQueryDto): InboxFilters {
    return { view: query.view, tab: query.tab, platform: query.platform, tag: query.tag, search: query.search };
  }

  // scope=organization covers every branch the user can access, narrowed to `storeId` when given.
  private async resolveStoreIds(req: any, scope?: 'organization' | 'store', storeId?: string) {
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    if (scope === 'organization') {
      const { stores } = await this.organizationsService.listStoresForUser(req.user.id, organization.id);
      const accessible = stores.map((store) => store.id);
      if (!storeId) return accessible;
      if (!accessible.includes(storeId)) throw new ForbiddenException('Branch is outside your access');
      return [storeId];
    }
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, organization.id, storeId);
    return [store.id];
  }

  private async requireOwnedConversation(id: string, req: any) {
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new NotFoundException('Conversation not found');
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
