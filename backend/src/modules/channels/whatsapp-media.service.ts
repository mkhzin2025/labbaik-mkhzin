import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { CredentialEncryptionService } from './credential-encryption.service';

export interface WhatsAppAttachment {
  id: string;
  type: string;
  mimeType?: string;
  filename: string;
  originalFilename?: string;
  sha256?: string;
  caption?: string;
  url: string;
}

@Injectable()
export class WhatsAppMediaService {
  private readonly logger = new Logger(WhatsAppMediaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  async downloadMedia(media: any, type: string, encryptedAccessToken: string): Promise<WhatsAppAttachment> {
    const accessToken = this.credentialEncryption.decryptSecret(encryptedAccessToken);
    if (!accessToken) {
      throw new InternalServerErrorException('WhatsApp access token is missing');
    }

    const mediaId = media.id;
    const metadataResponse = await axios.get(`https://graph.facebook.com/${this.getGraphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const mediaUrl = metadataResponse.data?.url;
    const mimeType = media.mime_type || metadataResponse.data?.mime_type;
    if (!mediaUrl) {
      throw new InternalServerErrorException('WhatsApp media URL is missing');
    }

    const fileResponse = await axios.get<ArrayBuffer>(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const filename = this.buildFilename(mediaId, type, mimeType, media.filename);
    const uploadRoot = this.getWhatsAppUploadRoot();
    if (!existsSync(uploadRoot)) mkdirSync(uploadRoot, { recursive: true });

    writeFileSync(join(uploadRoot, filename), Buffer.from(fileResponse.data));

    return {
      id: mediaId,
      type,
      mimeType,
      filename,
      originalFilename: media.filename,
      sha256: media.sha256,
      caption: media.caption,
      url: `/conversations/attachments/${filename}`,
    };
  }

  async safeDownloadMedia(media: any, type: string, encryptedAccessToken: string) {
    try {
      return await this.downloadMedia(media, type, encryptedAccessToken);
    } catch (error) {
      this.logger.error(`Failed to download WhatsApp media ${media?.id}: ${error.message}`);
      return {
        id: media?.id,
        type,
        mimeType: media?.mime_type,
        filename: '',
        originalFilename: media?.filename,
        sha256: media?.sha256,
        caption: media?.caption,
        url: '',
        downloadError: true,
      };
    }
  }


  private getGraphVersion() {
    return this.configService.get<string>('META_GRAPH_API_VERSION') || 'v26.0';
  }

  getWhatsAppUploadRoot() {
    return join(this.configService.get<string>('UPLOADS_DIR') || join(process.cwd(), 'uploads'), 'whatsapp');
  }

  private buildFilename(mediaId: string, type: string, mimeType?: string, originalFilename?: string) {
    const sourceExtension = originalFilename ? extname(originalFilename) : '';
    const mimeExtension = this.extensionFromMime(mimeType);
    const extension = sourceExtension || mimeExtension || '.bin';
    const safeId = String(mediaId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');
    return `${Date.now()}-${type}-${safeId}${extension}`;
  }

  private extensionFromMime(mimeType?: string) {
    if (!mimeType) return '';
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/aac': '.aac',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'application/pdf': '.pdf',
    };
    return map[mimeType] || '';
  }
}
