import { Body, Controller, Get, HttpException, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Access } from '../organizations/access';
import { User } from '../users/entities/user.entity';
import { StoreChatService } from './store-chat.service';

/** Mkhzin store chats inside the platform, for the organizations allowed in MKHZIN_STORE_ORG_IDS. */
@ApiTags('Store chat')
@ApiBearerAuth()
@Access('conversations')
@Controller('store-chat')
export class StoreChatController {
  constructor(
    private readonly storeChat: StoreChatService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether store chats are enabled for the caller organization' })
  status(@Request() req) {
    const enabled = this.storeChat.isEnabledFor(req.user.organizationId);
    // Labels and keys only; the branch URLs stay on the server
    return { enabled, branches: enabled ? this.storeChat.branches.map(({ key, label }) => ({ key, label })) : [] };
  }

  @Get('unread-total-count')
  unreadTotal(@Request() req, @Query('branch') branch?: string) {
    this.storeChat.assertEnabled(req.user.organizationId);
    return this.storeChat.request(branch, 'GET', '/unread-total-count');
  }

  @Get('customers')
  customers(@Request() req, @Query('branch') branch?: string) {
    this.storeChat.assertEnabled(req.user.organizationId);
    return this.storeChat.request(branch, 'GET', '/customers-with-unread');
  }

  @Get('unread-count')
  unreadCount(@Request() req, @Query('customerId') customerId: string, @Query('branch') branch?: string) {
    this.storeChat.assertEnabled(req.user.organizationId);
    return this.storeChat.request(branch, 'GET', '/unread-count', { params: { customerId: StoreChatService.assertUuid(customerId) } });
  }

  @Get('messages')
  messages(@Request() req, @Query() query: Record<string, string>) {
    this.storeChat.assertEnabled(req.user.organizationId);
    const branch = query.branch;
    const params: Record<string, unknown> = { customerId: StoreChatService.assertUuid(query.customerId) };
    if (query.cursor) params.cursor = StoreChatService.assertUuid(query.cursor, 'cursor');
    if (query.limit) params.limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 30)));
    return this.storeChat.request(branch, 'GET', '/messages', { params });
  }

  @Post('messages')
  async send(@Request() req, @Body() body: { customerId?: string; content?: string; branch?: string }) {
    this.storeChat.assertEnabled(req.user.organizationId);
    const customerId = StoreChatService.assertUuid(body?.customerId);
    const content = String(body?.content ?? '').trim();
    if (!content) throw new HttpException('اكتب الرسالة أولاً', 400);
    if (content.length > 2000) throw new HttpException('الرسالة أطول من 2000 حرف', 400);

    // The sender's name comes from the signed-in user, never from the browser
    const user = await this.users.findOne({ where: { id: req.user.id } });
    const senderName = (user?.fullName || req.user.email || '').trim().slice(0, 100) || undefined;

    return this.storeChat.request(body?.branch, 'POST', '/messages', { data: { customerId, content, senderName } });
  }

  @Get('customer-shipments')
  shipments(@Request() req, @Query() query: Record<string, string>) {
    this.storeChat.assertEnabled(req.user.organizationId);
    const branch = query.branch;
    return this.storeChat.request(branch, 'GET', '/customer-shipments', {
      params: { customerId: StoreChatService.assertUuid(query.customerId), ...StoreChatService.pageParams(query) },
    });
  }

  @Get('customer-returns')
  returns(@Request() req, @Query() query: Record<string, string>) {
    this.storeChat.assertEnabled(req.user.organizationId);
    const branch = query.branch;
    return this.storeChat.request(branch, 'GET', '/customer-returns', {
      params: { customerId: StoreChatService.assertUuid(query.customerId), ...StoreChatService.pageParams(query) },
    });
  }
}
