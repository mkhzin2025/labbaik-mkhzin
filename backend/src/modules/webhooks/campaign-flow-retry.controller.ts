import { Controller, Get, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Access } from '../organizations/access';
import { WebhooksService } from './webhooks.service';

/**
 * Re-sending a campaign's flow replies that Meta refused for unpaid billing. Lives with the webhooks
 * because that is where flows are sent; the campaign module cannot depend on it (it is used by it).
 */
@ApiTags('Meta WhatsApp Campaigns')
@ApiBearerAuth()
@Access('whatsapp')
@Controller('integrations/meta/whatsapp/campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignFlowRetryController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get(':id/flow-retry')
  async preview(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const { eligible, expired, running } = await this.webhooks.previewCampaignFlowRetry(req.user.id, req.user.organizationId, id);
    return { customers: eligible.length, messages: eligible.reduce((sum, item) => sum + item.nodes.length, 0), expired, running };
  }

  @Post(':id/flow-retry')
  start(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.startCampaignFlowRetry(req.user.id, req.user.organizationId, id);
  }
}
