import { ConfigService } from '@nestjs/config';
import { CredentialEncryptionService } from './credential-encryption.service';

describe('CredentialEncryptionService', () => {
  const service = new CredentialEncryptionService({
    get: (key: string) => key === 'CREDENTIAL_ENCRYPTION_KEY' ? 'test-encryption-key-with-enough-length' : undefined,
  } as ConfigService);

  it('encrypts and decrypts access tokens', () => {
    const encrypted = service.encryptSecret('EAATESTTOKEN');

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe('EAATESTTOKEN');
    expect(encrypted?.startsWith('enc:v1:')).toBe(true);
    expect(service.decryptSecret(encrypted)).toBe('EAATESTTOKEN');
  });

  it('masks stored credentials for API responses', () => {
    const credentials = service.maskCredentials({
      phoneNumberId: '123',
      accessToken: service.encryptSecret('EAATESTTOKEN'),
    });

    expect(credentials).toEqual({
      phoneNumberId: '123',
      accessToken: '********',
    });
  });
});
