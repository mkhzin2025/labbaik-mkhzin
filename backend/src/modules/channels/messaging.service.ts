import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CredentialEncryptionService } from './credential-encryption.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

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
          text: { body: text },
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

  async sendWhatsAppButtons(phoneNumberId: string, accessToken: string, to: string, text: string, buttons: { id: string, label: string }[], imageUrl?: string) {
    try {
      const plainAccessToken = this.credentialEncryption.decryptSecret(accessToken);
      const url = `https://graph.facebook.com/${this.getGraphVersion()}/${phoneNumberId}/messages`;
      
      if (buttons.length > 3 || buttons.length === 0) {
        const finalMsg = text + "\n\n━━━━━━━━━━━━\n" + buttons.map((b, i) => `${i+1}. *${b.label}*`).join('\n');
        return this.sendWhatsAppMessage(phoneNumberId, accessToken, to, finalMsg);
      }

      const interactiveObj: any = {
        type: 'button',
        body: { text },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.label.substring(0, 20) }
          }))
        }
      };

      // Add Image Header if provided
      if (imageUrl) {
        interactiveObj.header = {
          type: 'image',
          image: { link: imageUrl }
        };
      }

      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: interactiveObj
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
      this.logger.error(`WhatsApp Buttons Error: ${metaError?.message || error.message} ${metaError ? JSON.stringify({ code: metaError.code, type: metaError.type, subcode: metaError.error_subcode, fbtrace_id: metaError.fbtrace_id }) : ''}`);
      if (phoneNumberId === '123456789') return { message_id: 'simulated_btn_' + Date.now() };
      throw error;
    }
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
