import { WhatsAppCampaignStatus } from './entities/whatsapp-campaign.entity';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';

describe('WhatsAppCampaignsService.run', () => {
  function setup(opts: { total: number; status?: () => WhatsAppCampaignStatus; send?: (phone: string) => Promise<any> }) {
    const recipients = Array.from({ length: opts.total }, (_, i) => ({
      id: `r${i}`, campaignId: 'c1', storeId: 's1', customerId: `cu${i}`, phone: `9665${String(i).padStart(8, '0')}`, status: 'pending',
    }));
    const updates = new Map<string, any>();
    const campaign = { id: 'c1', organizationId: 'o1', templateId: 't1', status: WhatsAppCampaignStatus.QUEUED, messagesPerSecond: 1000, parameters: {} };
    const campaignRepository: any = {
      findOne: jest.fn(async () => ({ ...campaign, status: opts.status ? opts.status() : campaign.status === WhatsAppCampaignStatus.QUEUED ? WhatsAppCampaignStatus.SENDING : campaign.status })),
      update: jest.fn(async (_id: string, patch: any) => Object.assign(campaign, patch)),
    };
    const recipientRepository: any = {
      // claimBatch: hand out the next pending numbers.
      query: jest.fn(async (_sql: string, [, limit]: [string, number]) => {
        const batch = recipients.filter((r) => r.status === 'pending').slice(0, limit);
        batch.forEach((r) => { r.status = 'sending'; });
        return batch;
      }),
      update: jest.fn(async (id: string, patch: any) => {
        updates.set(id, patch);
        const row = recipients.find((r) => r.id === id);
        if (row) row.status = patch.status;
      }),
    };
    const metaWhatsAppService: any = {
      findTemplateWithConnection: jest.fn(async () => ({ connection: {}, template: {} })),
      personalizeTemplateDto: jest.fn((dto) => dto),
      sendOneTemplate: jest.fn(async (_s, _c, _t, phone: string) => {
        if (opts.send) return opts.send(phone);
        return { message: { metadata: { whatsappMessageId: `wamid.${phone}` } } };
      }),
    };
    const organizationsService: any = { assertStoreBelongsToOrganization: jest.fn(async () => ({ id: 's1' })) };
    const customersService: any = { findAudienceRowsByIds: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { fullName: id }]))) };
    const service = new WhatsAppCampaignsService(campaignRepository, recipientRepository, metaWhatsAppService, organizationsService, customersService, {} as any);
    jest.spyOn(service as any, 'campaignDto').mockReturnValue({});
    return { service, recipients, updates, campaign, metaWhatsAppService };
  }

  it('sends every recipient exactly once and completes', async () => {
    const { service, recipients, campaign, metaWhatsAppService } = setup({ total: 1234 });
    await (service as any).run('c1');
    expect(metaWhatsAppService.sendOneTemplate).toHaveBeenCalledTimes(1234);
    expect(new Set(metaWhatsAppService.sendOneTemplate.mock.calls.map((c: any[]) => c[3])).size).toBe(1234);
    expect(recipients.every((r) => r.status === 'sent')).toBe(true);
    expect(campaign.status).toBe(WhatsAppCampaignStatus.COMPLETED);
  });

  it('does not let one slow send hold up the others', async () => {
    // The first number hangs for 300ms; at 1000/s the rest should keep flowing meanwhile (old batch loop: ≤ 40).
    let slowDone = false;
    let sentWhileSlow = 0;
    const { service } = setup({
      total: 500,
      send: async (phone) => {
        if (phone.endsWith('00000000')) { await new Promise((r) => setTimeout(r, 300)); slowDone = true; }
        else if (!slowDone) sentWhileSlow++;
        return { message: { metadata: { whatsappMessageId: phone } } };
      },
    });
    await (service as any).run('c1');
    expect(sentWhileSlow).toBeGreaterThan(150);
  });

  it('stops claiming once the campaign is cancelled, without leaving numbers in sending', async () => {
    let checks = 0;
    const { service, recipients, metaWhatsAppService } = setup({
      total: 5000,
      status: () => (++checks > 2 ? WhatsAppCampaignStatus.CANCELLED : WhatsAppCampaignStatus.SENDING),
    });
    await (service as any).run('c1');
    expect(metaWhatsAppService.sendOneTemplate.mock.calls.length).toBeLessThan(5000);
    expect(recipients.some((r) => r.status === 'sending')).toBe(false);
  });

  it('stops the campaign after too many failures in a row', async () => {
    const { service, campaign } = setup({ total: 2000, send: async () => { throw new Error('wallet empty'); } });
    await (service as any).run('c1');
    expect(campaign.status).toBe(WhatsAppCampaignStatus.FAILED);
  });
});
