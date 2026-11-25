import { TrialRequestsService } from './trial-requests.service';

function setup(ownerIds?: string) {
  const saved: any[] = [];
  const repo = {
    create: (data: any) => data,
    save: jest.fn(async (data: any) => { saved.push(data); return { id: 'r1', ...data }; }),
  };
  const emit = jest.fn();
  const config = { get: () => ownerIds };
  const events = { server: { to: jest.fn(() => ({ emit })) } };
  const service = new TrialRequestsService(repo as any, config as any, events as any);
  return { service, repo, saved, emit, events };
}

describe('TrialRequestsService', () => {
  const valid = { name: '  محمد  ', phone: '055 123 4567', company: 'شركة المثال', message: '' };

  it('normalizes Saudi mobile numbers', () => {
    expect(TrialRequestsService.normalizePhone('0551234567')).toBe('966551234567');
    expect(TrialRequestsService.normalizePhone('+966 55 123 4567')).toBe('966551234567');
    expect(TrialRequestsService.normalizePhone('00966551234567')).toBe('966551234567');
    expect(TrialRequestsService.normalizePhone('551234567')).toBe('966551234567');
  });

  it('saves a valid request and tells the platform owner', async () => {
    const { service, saved, events, emit } = setup();
    await expect(service.create(valid, '1.1.1.1')).resolves.toEqual({ ok: true });
    expect(saved[0]).toMatchObject({ name: 'محمد', phone: '966551234567', company: 'شركة المثال', message: null, status: 'new' });
    expect(events.server.to).toHaveBeenCalledWith('organization_035622f8-9605-4f7c-a04b-aa69c9aa3948');
    expect(emit).toHaveBeenCalledWith('trial_request', { id: 'r1' });
  });

  it('rejects missing or malformed fields', async () => {
    const { service } = setup();
    await expect(service.create({ ...valid, name: 'a' }, null)).rejects.toThrow('الاسم مطلوب');
    await expect(service.create({ ...valid, company: '' }, null)).rejects.toThrow('اسم المنشأة مطلوب');
    await expect(service.create({ ...valid, phone: '12ab' }, null)).rejects.toThrow('رقم الجوال غير صحيح');
  });

  it('silently drops bots that fill the hidden field', async () => {
    const { service, repo } = setup();
    await expect(service.create({ ...valid, website: 'spam.example' }, null)).resolves.toEqual({ ok: true });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('limits how many requests one address may send', async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i += 1) await service.create(valid, '2.2.2.2');
    await expect(service.create(valid, '2.2.2.2')).rejects.toThrow('أرسلت عدة طلبات');
    await expect(service.create(valid, '3.3.3.3')).resolves.toEqual({ ok: true });
  });

  it('only the owner organizations see the requests', () => {
    const { service } = setup('org-a, org-b');
    expect(service.isOwner('org-b')).toBe(true);
    expect(service.isOwner('035622f8-9605-4f7c-a04b-aa69c9aa3948')).toBe(false);
    expect(() => service.assertOwner('other')).toThrow();
  });
});
