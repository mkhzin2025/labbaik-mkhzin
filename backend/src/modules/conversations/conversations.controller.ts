import { Controller, Get, Post, Param, UseGuards, Request, Patch, Body, NotFoundException, Res, BadRequestException, Query, ForbiddenException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';
import { OrganizationsService } from '../organizations/organizations.service';
import { CustomersService } from '../customers/customers.service';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CONVERSATION_RATINGS, CONVERSATION_STATUSES } from './schemas/conversation.schema';
import type { ConversationRating, ConversationStatus } from './schemas/conversation.schema';
import type { InboxFilters, InboxTab, InboxView, UploadedChatFile } from './conversations.service';
import { Access, sectionsFor } from '../organizations/access';
import { writeMemberActivityPdf } from './member-activity-pdf';

export class InboxFilterQueryDto {
  @IsOptional() @IsIn(['organization', 'store'])
  scope?: 'organization' | 'store';

  @IsOptional() @IsString()
  storeId?: string;

  @IsOptional() @IsIn(['active', 'mine', 'closed'])
  view?: InboxView;

  /** Owners and admins: whose conversations "mine" and "closed" show (a member id, or `all`). Others always see their own. */
  @IsOptional() @IsString() @MaxLength(100)
  agent?: string;

  @IsOptional() @IsIn(['all', 'unread', 'needs_reply', 'pending'])
  tab?: InboxTab;

  @IsOptional() @IsIn(['whatsapp', 'instagram', 'facebook', 'google_maps'])
  platform?: string;

  @IsOptional() @IsString() @MaxLength(100)
  tag?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(CONVERSATION_RATINGS as unknown as string[])
  rating?: ConversationRating;
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

export class MemberActivityQueryDto {
  /** Local calendar days, both included. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;

  /** Viewer's offset from UTC in minutes (east positive). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(-840) @Max(840)
  tz?: number;

  @IsOptional() @IsString()
  storeId?: string;
}

export class SatisfactionQueryDto {
  @IsOptional() @IsString()
  agentId?: string;

  @IsOptional() @IsString()
  storeId?: string;
}

export class AssignAgentDto {
  /** true: the caller takes the conversation; false: it is released. */
  @IsBoolean()
  take: boolean;
}

export class TransferCustomerDto {
  @IsUUID()
  storeId: string;
}

@ApiTags('Conversations')
@ApiBearerAuth()
@Access('conversations')
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
    return this.conversationsService.findPage(storeIds, this.toFilters(query, req), { limit: query.limit, cursor: query.cursor });
  }

  @Get('counts')
  async getCounts(@Request() req: any, @Query() query: InboxFilterQueryDto) {
    const storeIds = await this.resolveStoreIds(req, query.scope, query.storeId);
    return this.conversationsService.countInbox(storeIds, this.toFilters(query, req));
  }

  @Get('stats')
  @Access('home', 'conversations')
  async getStats(@Request() req: any, @Query('storeId') storeId?: string) {
    // Every branch the user can see (as the inbox counts), or just the one asked for.
    return this.conversationsService.getStats(await this.resolveStoreIds(req, 'organization', storeId));
  }

  /**
   * Customers' ratings for the home page chart. A support member only ever sees the ratings credited to them;
   * owners and admins see every rating, or one member's with `agentId`.
   */
  @Get('team/satisfaction')
  @Access('home', 'team')
  async getSatisfaction(@Request() req: any, @Query() query: SatisfactionQueryDto) {
    const storeIds = await this.resolveStoreIds(req, 'organization', query.storeId);
    const agentId = this.managesTeam(req) ? query.agentId || undefined : req.user.id;
    return this.conversationsService.getSatisfaction(storeIds, agentId);
  }

  /** A team member's work over a date range (`me` for the caller); other members need access to the team page. */
  @Get('team/:userId/activity')
  @Access('home', 'team')
  async getMemberActivity(@Request() req: any, @Param('userId') userId: string, @Query() query: MemberActivityQueryDto) {
    const { member, storeIds, from, to, tz } = await this.activityScope(req, userId, query);
    const activity = await this.conversationsService.getMemberActivity(storeIds, member.userId, from, to, tz);
    return { member: { userId: member.userId, fullName: member.fullName, email: member.email, role: member.role }, ...activity };
  }

  @Get('team/:userId/activity/pdf')
  @Access('home', 'team')
  async getMemberActivityPdf(@Request() req: any, @Param('userId') userId: string, @Query() query: MemberActivityQueryDto, @Res() res: any) {
    const { member, storeIds, from, to, tz } = await this.activityScope(req, userId, query);
    const activity = await this.conversationsService.getMemberActivity(storeIds, member.userId, from, to, tz);
    const { stores } = await this.organizationsService.listStoresForUser(req.user.id, req.user.organizationId);
    writeMemberActivityPdf(res, {
      organizationName: member.organization.name,
      member: { fullName: member.fullName || member.email, email: member.email, role: member.role },
      from: query.from,
      to: query.to,
      generatedAt: new Date(),
      tzOffsetMinutes: tz,
      storeNames: Object.fromEntries(stores.map((store) => [store.id, store.name])),
      activity,
    });
  }

  @Get('analytics')
  @Access('analytics')
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

  /** Takes the conversation (so teammates see who is answering) or releases it. */
  @Patch(':id/agent')
  async assignAgent(@Param('id') id: string, @Body() dto: AssignAgentDto, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    if (dto.take) return this.conversationsService.assignAgent(id, await this.organizationsService.agentFor(req.user.id));
    if (conversation.agentId && conversation.agentId !== req.user.id && !await this.canManageTeam(req)) {
      throw new ForbiddenException('يتابع هذه المحادثة عضو آخر. استلمها بدلًا من ذلك.');
    }
    return this.conversationsService.assignAgent(id, null);
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
    return this.conversationsService.setStatus(id, dto.status, snoozedUntil, await this.organizationsService.agentFor(req.user.id));
  }

  @Patch(':id/tags')
  async updateTags(@Param('id') id: string, @Body('tags') tags: string[], @Request() req: any) {
    await this.requireOwnedConversation(id, req);
    return this.conversationsService.updateTags(id, tags);
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body('text') text: string, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    return this.conversationsService.sendMessage(id, conversation.storeId, text, await this.organizationsService.agentFor(req.user.id));
  }

  /** Blocks (or unblocks) the conversation's customer across the organization: their messages are dropped and campaigns skip them. */
  @Post(':id/block')
  async setBlocked(@Param('id') id: string, @Body('blocked') blocked: boolean, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    const organization = await this.organizationsService.getForUser(req.user.id, req.user.organizationId);
    return this.conversationsService.setCustomerBlocked(id, conversation.storeId, organization.id, blocked !== false);
  }

  /** Sends an image, video, audio or document (with an optional caption) to the customer. */
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  async sendAttachment(@Param('id') id: string, @UploadedFile() file: UploadedChatFile, @Body('caption') caption: string | undefined, @Request() req: any) {
    const conversation: any = await this.requireOwnedConversation(id, req);
    return this.conversationsService.sendAttachment(id, conversation.storeId, file, typeof caption === 'string' ? caption.slice(0, 1024) : undefined, await this.organizationsService.agentFor(req.user.id));
  }

  private toFilters(query: InboxFilterQueryDto, req: any): InboxFilters {
    const agentId = !this.managesTeam(req) ? req.user.id : query.agent === 'all' ? undefined : query.agent || req.user.id;
    return { view: query.view, tab: query.tab, platform: query.platform, tag: query.tag, search: query.search, rating: query.rating, agentId };
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

  /** Set by the Access guard: whether the caller's role opens the team page (owners and admins). */
  private managesTeam(req: any) {
    return Array.isArray(req.orgSections) && req.orgSections.includes('team');
  }

  private async canManageTeam(req: any) {
    const { membership } = await this.organizationsService.getMembership(req.user.id, req.user.organizationId);
    return sectionsFor(membership.role).includes('team');
  }

  /** Whose activity, over which branches and local days. Members without the team page only see their own. */
  private async activityScope(req: any, userId: string, query: MemberActivityQueryDto) {
    const targetId = userId === 'me' ? req.user.id : userId;
    if (targetId !== req.user.id && !this.managesTeam(req)) throw new ForbiddenException('يمكنك عرض نشاطك أنت فقط.');
    const member = await this.organizationsService.memberSummary(req.user.id, req.user.organizationId, targetId);
    const tz = query.tz ?? 0;
    const toInstant = (day: string, next = false) => {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + (next ? 1 : 0)) - tz * 60_000);
    };
    const from = toInstant(query.from);
    const to = toInstant(query.to, true);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    if (to.getTime() - from.getTime() > 370 * 86_400_000) throw new BadRequestException('اختر فترة لا تزيد على سنة.');
    const storeIds = await this.resolveStoreIds(req, 'organization', query.storeId);
    return { member, storeIds, from, to, tz };
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
