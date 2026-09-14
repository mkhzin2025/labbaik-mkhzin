import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, Logger, Headers, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { examples } from '../../common/swagger/api-examples';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
  ) {}

  // 1. WhatsApp Webhooks
  @Get('whatsapp')
  @ApiOperation({ summary: 'Verify WhatsApp webhook subscription' })
  @ApiQuery({ name: 'hub.mode', example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token', example: 'labbaik_whatsapp_verify' })
  @ApiQuery({ name: 'hub.challenge', example: '1234567890' })
  @ApiResponse({ status: 200, description: 'Returns the challenge string when verification succeeds.', schema: { example: '1234567890' } })
  verifyWhatsApp(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhooksService.verifyWhatsApp(mode, token, challenge);
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp webhook messages' })
  @ApiBody({ schema: { type: 'object' }, examples: { textMessage: { value: examples.webhook.whatsappPayload } } })
  @ApiResponse({ status: 200, description: 'Webhook processed.', schema: { example: examples.webhook.success } })
  async handleWhatsAppMessage(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: any,
  ) {
    return this.webhooksService.handleWhatsAppMessage(payload, signature, req.rawBody);
  }

  // 2. Instagram Simulator (Now with persistent saving)
  @Post('instagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate an Instagram webhook message' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.webhook.simulatorPayload } } })
  @ApiResponse({ status: 200, description: 'Webhook processed.', schema: { example: examples.webhook.success } })
  async handleInstagramWebhook(@Body() payload: any) {
    this.logger.log('Incoming Instagram Webhook simulator received.');
    return this.webhooksService.handleGenericWebhook(
      payload.from || 'insta_user_123',
      payload.text || 'تعليق جديد من إنستغرام! 😍',
      'instagram'
    );
  }

  // 3. Facebook Simulator (Now with persistent saving)
  @Post('facebook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate a Facebook webhook message' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: { from: 'fb_user_456', text: 'رسالة جديدة من فيسبوك مسنجر' } } } })
  @ApiResponse({ status: 200, description: 'Webhook processed.', schema: { example: examples.webhook.success } })
  async handleFacebookWebhook(@Body() payload: any) {
    this.logger.log('Incoming Facebook Webhook simulator received.');
    return this.webhooksService.handleGenericWebhook(
      payload.from || 'fb_user_456',
      payload.text || 'رسالة جديدة من فيسبوك مسنجر',
      'facebook'
    );
  }
}
