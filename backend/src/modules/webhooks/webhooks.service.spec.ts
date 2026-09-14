import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WebhooksService } from './webhooks.service';

function createService() {
  const configService = {
    get: (key: string) => {
      if (key === 'META_APP_SECRET') return 'meta-secret';
      if (key === 'WHATSAPP_VERIFY_TOKEN') return 'verify-token';
      return undefined;
    },
  } as ConfigService;

  return new WebhooksService(
    { server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } } as any,
    configService,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { safeDownloadMedia: jest.fn() } as any,
  );
}

describe('WebhooksService', () => {
  it('verifies WhatsApp webhook challenge tokens', () => {
    const service = createService();

    expect(service.verifyWhatsApp('subscribe', 'verify-token', 'challenge')).toBe('challenge');
    expect(service.verifyWhatsApp('subscribe', 'wrong-token', 'challenge')).toBe('Verification failed');
  });

  it('accepts signed Meta webhook requests and rejects invalid signatures', async () => {
    const service = createService();
    const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
    const validSignature = `sha256=${createHmac('sha256', 'meta-secret').update(rawBody).digest('hex')}`;

    await expect(service.handleWhatsAppMessage({ entry: [] }, validSignature, rawBody)).resolves.toEqual({ status: 'success' });
    await expect(service.handleWhatsAppMessage({ entry: [] }, 'sha256=bad', rawBody)).rejects.toThrow('Invalid Meta webhook signature');
  });

  it('normalizes text, location, contact, and unsupported WhatsApp messages', async () => {
    const service = createService() as any;

    await expect(service.normalizeWhatsAppMessage({
      from: '966500000000',
      id: 'wamid.text',
      timestamp: '1710000000',
      type: 'text',
      text: { body: 'hello' },
    }, 'token', { phone_number_id: 'phone-id' })).resolves.toMatchObject({
      from: '966500000000',
      text: 'hello',
      type: 'text',
      timestamp: 1710000000000,
      attachments: [],
    });

    await expect(service.normalizeWhatsAppMessage({
      from: '966500000000',
      id: 'wamid.location',
      timestamp: '1710000000',
      type: 'location',
      location: { latitude: 24.7136, longitude: 46.6753, name: 'Riyadh' },
    }, 'token', {})).resolves.toMatchObject({
      text: 'Riyadh',
      type: 'location',
      metadata: { location: { latitude: 24.7136, longitude: 46.6753, name: 'Riyadh' } },
    });

    await expect(service.normalizeWhatsAppMessage({
      from: '966500000000',
      id: 'wamid.contacts',
      timestamp: '1710000000',
      type: 'contacts',
      contacts: [{ name: { formatted_name: 'Sara' }, phones: [{ phone: '+9665' }] }],
    }, 'token', {})).resolves.toMatchObject({
      text: 'Sara',
      type: 'contacts',
    });

    await expect(service.normalizeWhatsAppMessage({
      from: '966500000000',
      id: 'wamid.unknown',
      timestamp: '1710000000',
      type: 'reaction',
      reaction: { emoji: '+1' },
    }, 'token', {})).resolves.toMatchObject({
      text: '[Unsupported WhatsApp message: reaction]',
      type: 'unsupported',
    });
  });
});
