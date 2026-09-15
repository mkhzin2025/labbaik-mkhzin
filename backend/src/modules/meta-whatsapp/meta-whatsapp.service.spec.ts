import { BadRequestException } from '@nestjs/common';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MetaConnectionScope, MetaConnectionStatus, MetaWebhookMode, MetaWhatsAppConnection } from './entities/meta-whatsapp-connection.entity';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MetaWhatsAppService - Webhook Subscription Logic', () => {
  let service: MetaWhatsAppService;
  let connectionRepository: any;
  let templateRepository: any;
  let channelRepository: any;
  let organizationsService: any;
  let credentialEncryption: any;
  let configService: any;
  let conversationsService: any;
  let customersService: any;
  let eventsGateway: any;
  let billingService: any;
  let templatePayloadBuilder: any;

  const mockConnection: Partial<MetaWhatsAppConnection> = {
    id: '054f269a-fc75-4d5c-a3ae-c252e4d63e9c',
    organizationId: 'org-123',
    scope: MetaConnectionScope.STORE,
    storeId: 'store-123',
    appId: '2173104126584484',
    wabaId: '1685815252287283',
    phoneNumberId: '616170271569273',
    accessToken: 'encrypted_token',
    verifyToken: 'encrypted_verify',
    status: MetaConnectionStatus.ERROR,
    webhookMode: MetaWebhookMode.GLOBAL,
    lastError: 'Previous error (#100)',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    connectionRepository = {
      findOne: jest.fn().mockResolvedValue({ ...mockConnection }),
      find: jest.fn().mockResolvedValue([{ ...mockConnection }]),
      save: jest.fn().mockImplementation((conn) => Promise.resolve(conn)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),
    };

    templateRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
    };

    channelRepository = {
      createQueryBuilder: jest.fn(),
    };

    organizationsService = {
      assertCanManageIntegrations: jest.fn().mockResolvedValue({ organization: { id: 'org-123' } }),
      getForUser: jest.fn().mockResolvedValue({ id: 'org-123' }),
      assertStoreBelongsToOrganization: jest.fn().mockResolvedValue({ id: 'store-123' }),
      listStoresByOrganization: jest.fn().mockResolvedValue([{ id: 'store-123' }]),
    };

    credentialEncryption = {
      decryptSecret: jest.fn().mockImplementation((val) => {
        if (val === 'encrypted_token') return 'decrypted_meta_token';
        if (val === 'encrypted_verify') return 'decrypted_verify_token';
        return val;
      }),
    };

    configService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'META_GRAPH_API_VERSION') return 'v26.0';
        if (key === 'META_APP_ID') return '2173104126584484';
        if (key === 'PUBLIC_WEBHOOK_URL') return 'https://labbaik.mkhzin-store.com';
        return null;
      }),
    };

    conversationsService = { addMessage: jest.fn() };
    customersService = { findOrCreate: jest.fn(), deduplicateWhatsAppCustomers: jest.fn() };
    eventsGateway = { server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } };
    billingService = { chargeMetaUsageForStore: jest.fn(), refundMetaUsage: jest.fn(), getTemplateUsageType: jest.fn() };
    templatePayloadBuilder = { validateAndBuild: jest.fn() };

    service = new MetaWhatsAppService(
      connectionRepository,
      templateRepository,
      channelRepository,
      organizationsService,
      credentialEncryption,
      configService,
      conversationsService,
      customersService,
      eventsGateway,
      billingService,
      templatePayloadBuilder,
    );
  });

  it('1. GLOBAL mode should POST to subscribed_apps without body, verify via GET, and activate webhook', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            whatsapp_business_api_data: {
              id: '2173104126584484',
              name: 'Mkhzin Business Messaging',
            },
          },
        ],
      },
    });

    const result = await service.subscribeWebhookForUser('user-1', 'org-123', {
      connectionId: mockConnection.id,
      mode: MetaWebhookMode.GLOBAL,
    });

    // Check that POST was called without body
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v26.0/1685815252287283/subscribed_apps',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer decrypted_meta_token',
        }),
      }),
    );

    // Verify result
    expect(result.success).toBe(true);
    expect(result.status).toBe(MetaConnectionStatus.WEBHOOK_ACTIVE);
    expect(result.subscriptionVerified).toBe(true);
    expect(result.webhookMode).toBe('GLOBAL');

    // Verify connection repository save updated status and cleared lastError
    expect(connectionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MetaConnectionStatus.WEBHOOK_ACTIVE,
        lastError: null,
        webhookMode: MetaWebhookMode.GLOBAL,
      }),
    );
  });

  it('2. GLOBAL mode should not fail if WABA is already subscribed (POST notices error but continues to GET)', async () => {
    // Simulate POST returning notice (already subscribed)
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { error: { message: 'Already subscribed' } } },
    });
    // GET confirms subscription
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: '2173104126584484',
          },
        ],
      },
    });

    const result = await service.subscribeWebhookForUser('user-1', 'org-123', {
      connectionId: mockConnection.id,
      mode: MetaWebhookMode.GLOBAL,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(MetaConnectionStatus.WEBHOOK_ACTIVE);
  });

  it('3. Should throw META_APP_NOT_SUBSCRIBED if GET subscribed_apps does not contain the expected appId', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            whatsapp_business_api_data: {
              id: '999999999999999', // Different App ID
            },
          },
        ],
      },
    });

    await expect(
      service.subscribeWebhookForUser('user-1', 'org-123', {
        connectionId: mockConnection.id,
        mode: MetaWebhookMode.GLOBAL,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('4. OVERRIDE mode should only send override_callback_uri when explicitly chosen by user', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

    const result = await service.subscribeWebhookForUser('user-1', 'org-123', {
      connectionId: mockConnection.id,
      mode: MetaWebhookMode.OVERRIDE,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v26.0/1685815252287283/subscribed_apps',
      {
        override_callback_uri: 'https://labbaik.mkhzin-store.com/webhooks/meta/whatsapp/054f269a-fc75-4d5c-a3ae-c252e4d63e9c',
        verify_token: 'decrypted_verify_token',
      },
      expect.anything(),
    );

    expect(result.webhookMode).toBe('OVERRIDE');
    expect(result.status).toBe(MetaConnectionStatus.WEBHOOK_ACTIVE);
  });

  it('5. Auto-heal: connection with previous error status can be healed to webhook_active', async () => {
    // Connection begins in status=ERROR with lastError set
    expect(mockConnection.status).toBe(MetaConnectionStatus.ERROR);

    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: '2173104126584484' }],
      },
    });

    const result = await service.subscribeWebhookForUser('user-1', 'org-123', {
      connectionId: mockConnection.id,
      mode: MetaWebhookMode.GLOBAL,
    });

    expect(result.status).toBe(MetaConnectionStatus.WEBHOOK_ACTIVE);
    expect(connectionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MetaConnectionStatus.WEBHOOK_ACTIVE,
        lastError: null,
      }),
    );
  });
});
