import { appRole, runsCampaigns, runsPlatformJobs } from './app-role';
import { WhatsAppCampaignsService } from '../modules/meta-whatsapp/whatsapp-campaigns.service';

describe('APP_ROLE', () => {
  const original = process.env.APP_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_ROLE;
    else process.env.APP_ROLE = original;
    jest.useRealTimers();
  });

  it('runs everything in one process when unset (as before)', () => {
    delete process.env.APP_ROLE;
    expect(appRole()).toBe('all');
    expect(runsCampaigns()).toBe(true);
    expect(runsPlatformJobs()).toBe(true);
  });

  it('splits campaigns from the platform jobs', () => {
    process.env.APP_ROLE = 'api';
    expect([runsCampaigns(), runsPlatformJobs()]).toEqual([false, true]);
    process.env.APP_ROLE = ' Worker ';
    expect([runsCampaigns(), runsPlatformJobs()]).toEqual([true, false]);
    process.env.APP_ROLE = 'something-else';
    expect(appRole()).toBe('all');
  });

  function campaigns() {
    const service = new WhatsAppCampaignsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const run = jest.spyOn(service as any, 'run').mockResolvedValue(undefined);
    return { service, run };
  }

  it('an API-only process leaves a started campaign queued and never resumes or polls', () => {
    jest.useFakeTimers();
    process.env.APP_ROLE = 'api';
    const { service, run } = campaigns();
    service.onApplicationBootstrap();
    (service as any).kick('c1');
    jest.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('the sending process starts a campaign at once', () => {
    process.env.APP_ROLE = 'worker';
    const { service, run } = campaigns();
    (service as any).kick('c1');
    expect(run).toHaveBeenCalledWith('c1');
  });
});
