import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import type { RecipientFilter } from './whatsapp-campaigns.service';

const RECIPIENT_FILTERS: RecipientFilter[] = ['all', 'pending', 'accepted', 'delivered', 'read', 'replied', 'clicked', 'failed', 'skipped'];

const pageOf = (page?: string, limit?: string, max = 100, fallback = 20) => ({
  page: Math.max(1, Number.parseInt(page || '1', 10) || 1),
  limit: Math.min(max, Math.max(1, Number.parseInt(limit || String(fallback), 10) || fallback)),
});

@ApiTags('Meta WhatsApp Campaigns')
@ApiBearerAuth()
@Controller('integrations/meta/whatsapp/campaigns')
@UseGuards(JwtAuthGuard)
export class WhatsAppCampaignsController {
  constructor(private readonly campaigns: WhatsAppCampaignsService) {}

  @Get()
  list(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('templateId') templateId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.campaigns.listForUser(req.user.id, req.user.organizationId, { ...pageOf(page, limit, 50), templateId, status, search });
  }

  /** Per-template campaign performance for the reports page. */
  @Get('report')
  report(@Request() req: any, @Query('days') days?: string, @Query('storeId') storeId?: string, @Query('tz') tz?: string) {
    const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const offset = Math.max(-840, Math.min(840, Number.parseInt(tz || '0', 10) || 0));
    return this.campaigns.reportForUser(req.user.id, req.user.organizationId, { days: period, storeId: storeId || undefined, tzOffsetMinutes: offset });
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.getForUser(req.user.id, req.user.organizationId, id);
  }

  @Get(':id/recipients')
  recipients(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: RecipientFilter,
    @Query('search') search?: string,
  ) {
    return this.campaigns.recipientsForUser(req.user.id, req.user.organizationId, id, {
      ...pageOf(page, limit, 100, 25),
      filter: filter && RECIPIENT_FILTERS.includes(filter) ? filter : 'all',
      search,
    });
  }

  @Post(':id/cancel')
  cancel(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancelForUser(req.user.id, req.user.organizationId, id);
  }

  @Post(':id/retry-failed')
  retryFailed(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.retryFailedForUser(req.user.id, req.user.organizationId, id);
  }
}
