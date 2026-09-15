import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { SaveMetaWhatsAppConnectionDto, SendWhatsAppTemplateBulkDto, SendWhatsAppTemplateDto, SubscribeWebhookDto, UpdateMetaWhatsAppConnectionDto } from './dto/meta-whatsapp.dto';
import { MetaConnectionScope, MetaWebhookMode } from './entities/meta-whatsapp-connection.entity';

@ApiTags('Meta WhatsApp')
@ApiBearerAuth()
@Controller('integrations/meta/whatsapp')
@UseGuards(JwtAuthGuard)
export class MetaWhatsAppController {
  constructor(private readonly service: MetaWhatsAppService) {}

  @Get('connections')
  listConnections(@Request() req: any) {
    return this.service.listConnectionsForUser(req.user.id, req.user.organizationId);
  }

  @Get()
  getConnection(
    @Request() req: any,
    @Query('storeId') storeId?: string,
    @Query('scope') scope?: MetaConnectionScope,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.service.getForUser(req.user.id, req.user.organizationId, storeId, scope || MetaConnectionScope.STORE, connectionId);
  }

  @Post()
  createConnection(@Request() req: any, @Body() dto: SaveMetaWhatsAppConnectionDto) {
    return this.service.saveForUser(req.user.id, dto, req.user.organizationId);
  }

  @Patch()
  updateConnection(@Request() req: any, @Body() dto: UpdateMetaWhatsAppConnectionDto) {
    return this.service.saveForUser(req.user.id, dto, req.user.organizationId);
  }

  @Post('test')
  test(@Request() req: any, @Query('connectionId') connectionId?: string, @Query('storeId') storeId?: string, @Query('scope') scope?: MetaConnectionScope) {
    return this.service.testForUser(req.user.id, req.user.organizationId, { connectionId, storeId, scope });
  }

  @Post('subscribe-webhook')
  subscribeWebhook(
    @Request() req: any,
    @Query('connectionId') connectionId?: string,
    @Query('storeId') storeId?: string,
    @Query('scope') scope?: MetaConnectionScope,
    @Query('mode') queryMode?: MetaWebhookMode,
    @Body() body?: SubscribeWebhookDto,
  ) {
    const mode = body?.mode || queryMode || MetaWebhookMode.GLOBAL;
    return this.service.subscribeWebhookForUser(req.user.id, req.user.organizationId, { connectionId, storeId, scope, mode });
  }

  @Post('templates/sync')
  syncTemplates(@Request() req: any, @Query('connectionId') connectionId?: string, @Query('storeId') storeId?: string, @Query('scope') scope?: MetaConnectionScope) {
    return this.service.syncTemplatesForUser(req.user.id, req.user.organizationId, { connectionId, storeId, scope });
  }

  @Get('templates')
  listTemplates(@Request() req: any, @Query('connectionId') connectionId?: string, @Query('storeId') storeId?: string, @Query('scope') scope?: MetaConnectionScope) {
    return this.service.listTemplatesForUser(req.user.id, req.user.organizationId, { connectionId, storeId, scope });
  }

  @Post('templates/:templateId/send')
  sendTemplate(@Request() req: any, @Param('templateId') templateId: string, @Body() dto: SendWhatsAppTemplateDto) {
    return this.service.sendTemplateForUser(req.user.id, templateId, dto, req.user.organizationId);
  }

  @Post('templates/:templateId/send-bulk')
  sendTemplateBulk(@Request() req: any, @Param('templateId') templateId: string, @Body() dto: SendWhatsAppTemplateBulkDto) {
    return this.service.sendTemplateBulkForUser(req.user.id, templateId, dto, req.user.organizationId);
  }
}
