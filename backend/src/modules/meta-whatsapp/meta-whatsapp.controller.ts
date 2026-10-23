import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync } from 'fs';
import { basename } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import type { UploadedMediaFile } from './meta-whatsapp.service';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import { SaveMetaWhatsAppConnectionDto, SendWhatsAppTemplateBulkDto, SendWhatsAppTemplateDto, SubscribeWebhookDto, UpdateMetaWhatsAppConnectionDto } from './dto/meta-whatsapp.dto';
import { MetaConnectionScope, MetaWebhookMode } from './entities/meta-whatsapp-connection.entity';

@ApiTags('Meta WhatsApp')
@ApiBearerAuth()
@Controller('integrations/meta/whatsapp')
@UseGuards(JwtAuthGuard)
export class MetaWhatsAppController {
  constructor(
    private readonly service: MetaWhatsAppService,
    private readonly campaigns: WhatsAppCampaignsService,
  ) {}

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

  /** Creates a campaign and starts sending in the background; poll `campaigns/:id` for progress. */
  @Post('templates/:templateId/send-bulk')
  sendTemplateBulk(@Request() req: any, @Param('templateId') templateId: string, @Body() dto: SendWhatsAppTemplateBulkDto) {
    return this.campaigns.createForUser(req.user.id, req.user.organizationId, templateId, dto);
  }

  /** Uploads a header image/video/PDF to Meta for this number and returns the media id to send with. */
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  uploadMedia(@Request() req: any, @Query('connectionId') connectionId: string, @UploadedFile() file: UploadedMediaFile) {
    if (!connectionId) throw new BadRequestException('connectionId is required');
    return this.service.uploadHeaderMediaForUser(req.user.id, req.user.organizationId, connectionId, file);
  }

  @Post('templates/:templateId/sample-media')
  useSampleMedia(@Request() req: any, @Param('templateId') templateId: string) {
    return this.service.useTemplateSampleMediaForUser(req.user.id, req.user.organizationId, templateId);
  }

  @Get('media/:filename')
  getMedia(@Param('filename') filename: string, @Res() res: any) {
    if (filename !== basename(filename)) throw new BadRequestException('Invalid filename');
    const path = this.service.headerMediaPath(filename);
    if (!existsSync(path)) throw new NotFoundException('File not found');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return createReadStream(path).pipe(res);
  }
}
