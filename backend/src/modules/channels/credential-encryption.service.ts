import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1';

@Injectable()
export class CredentialEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encryptSecret(value?: string): string | undefined {
    if (!value || this.isEncrypted(value)) return value;

    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      ENCRYPTED_PREFIX,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decryptSecret(value?: string): string | undefined {
    if (!value || !this.isEncrypted(value)) return value;

    const [, , ivValue, tagValue, encryptedValue] = value.split(':');
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new InternalServerErrorException('Invalid encrypted credential format');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getKey(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  encryptCredentials(credentials?: Record<string, any>): Record<string, any> | undefined {
    if (!credentials) return credentials;
    return {
      ...credentials,
      accessToken: this.encryptSecret(credentials.accessToken),
    };
  }

  decryptCredentials(credentials?: Record<string, any>): Record<string, any> | undefined {
    if (!credentials) return credentials;
    return {
      ...credentials,
      accessToken: this.decryptSecret(credentials.accessToken),
    };
  }

  maskCredentials(credentials?: Record<string, any>): Record<string, any> | undefined {
    if (!credentials) return credentials;
    const token = credentials.accessToken;
    return {
      ...credentials,
      accessToken: token ? '********' : token,
    };
  }

  private isEncrypted(value: string) {
    return value.startsWith(`${ENCRYPTED_PREFIX}:`);
  }

  private getKey() {
    const configuredKey =
      this.configService.get<string>('CREDENTIAL_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET');

    if (!configuredKey) {
      throw new InternalServerErrorException('CREDENTIAL_ENCRYPTION_KEY is required');
    }

    return createHash('sha256').update(configuredKey).digest();
  }
}
