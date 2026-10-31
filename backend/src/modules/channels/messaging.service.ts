import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CredentialEncryptionService } from './credential-encryption.service';

/** Meta keeps uploaded media for 30 days; re-upload well before. */
const MEDIA_ID_TTL_MS = 20 * 24 * 60 * 60 * 1000;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly mediaIdCache = new Map<string, { id: string; at: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  async sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, text: string) {
    try {
      const plainAccessToken = this.credentialEncryption.decryptSecret(accessToken);
      const url = `https://graph.facebook.com/${this.getGraphVersion()}/${phoneNumberId}/messages`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: { body: text, preview_url: /https?:\/\//i.test(text) },
        },
        {
          headers: {
            Authorization: `Bearer ${plainAccessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    } catch (error) {
      const metaError = error.response?.data?.error;
      this.logger.error(`WhatsApp Send Error: ${metaError?.message || error.message} ${metaError ? JSON.stringify({ code: metaError.code, type: metaError.type, subcode: metaError.error_subcode, fbtrace_id: metaError.fbtrace_id }) : ''}`);
      if (phoneNumberId === '123456789') return { message_id: 'simulated_id_' + Date.now() };
      throw error;
    }
  }

  /** Sends any Cloud API message body (`type` plus its object), e.g. media or interactive messages from flows. */
  async sendWhatsAppPayload(phoneNumberId: string, accessToken: string, to: string, payload: Record<string, any>) {
    try {
      const plainAccessToken = this.credentialEncryption.decryptSecret(accessToken);
      const response = await axios.post(
        `https://graph.facebook.com/${this.getGraphVersion()}/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload },
        { headers: { Authorization: `Bearer ${plainAccessToken}`, 'Content-Type': 'application/json' } },
      );
      return response.data;
    } catch (error) {
      const metaError = error.response?.data?.error;
      this.logger.error(`WhatsApp ${payload.type} Error: ${metaError?.message || error.message} ${metaError ? JSON.stringify({ code: metaError.code, type: metaError.type, subcode: metaError.error_subcode, fbtrace_id: metaError.fbtrace_id }) : ''}`);
      if (phoneNumberId === '123456789') return { message_id: `simulated_${payload.type}_${Date.now()}` };
      throw error;
    }
  }

  /**
   * Blocks (or unblocks) a customer on the business number through Meta's Block Users API: a blocked user
   * cannot message the business. Meta only allows blocking users who wrote within the last 24 hours.
   */
  async setWhatsAppUserBlocked(phoneNumberId: string, accessToken: string, user: string, blocked: boolean) {
    const plainAccessToken = this.credentialEncryption.decryptSecret(accessToken);
    const response = await axios.request({
      method: blocked ? 'POST' : 'DELETE',
      url: `https://graph.facebook.com/${this.getGraphVersion()}/${phoneNumberId}/block_users`,
      data: { messaging_product: 'whatsapp', block_users: [{ user }] },
      headers: { Authorization: `Bearer ${plainAccessToken}`, 'Content-Type': 'application/json' },
    });
    return response.data;
  }

  /**
   * Uploads a file to Meta for this phone number and returns its media id. Ids stay valid for 30 days,
   * so they are cached per number and file and refreshed well before that.
   */
  async uploadWhatsAppMedia(phoneNumberId: string, accessToken: string, cacheKey: string, file: { buffer: Buffer; mimeType: string; filename: string }) {
    const key = `${phoneNumberId}:${cacheKey}`;
    const cached = this.mediaIdCache.get(key);
    if (cached && Date.now() - cached.at < MEDIA_ID_TTL_MS) return cached.id;

    const plainAccessToken = this.credentialEncryption.decryptSecret(accessToken);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', file.mimeType);
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.filename);
    const { data } = await axios.post(`https://graph.facebook.com/${this.getGraphVersion()}/${phoneNumberId}/media`, form, {
      headers: { Authorization: `Bearer ${plainAccessToken}` },
      timeout: 60000,
      maxBodyLength: Infinity,
    });
    const id = String(data?.id || '');
    if (!id) throw new Error('Meta did not return a media id');
    this.mediaIdCache.set(key, { id, at: Date.now() });
    return id;
  }

  private getGraphVersion() {
    return this.configService.get<string>('META_GRAPH_API_VERSION') || 'v26.0';
  }

  async sendInstagramMessage(accessToken: string, recipientId: string, text: string) {
    this.logger.log(`Simulating Instagram send to ${recipientId}: ${text}`);
    return { status: 'simulated_success' };
  }

  async sendFacebookMessage(accessToken: string, recipientId: string, text: string) {
    this.logger.log(`Simulating Facebook send to ${recipientId}: ${text}`);
    return { status: 'simulated_success' };
  }
}
