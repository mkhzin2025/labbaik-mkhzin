import { ConversationsService } from './conversations.service';

/** Model double: per-branch status groups and counts, recording every query it receives. */
function setup(groups: Record<string, { _id: unknown; n: number }[]> = {}) {
  const calls = { aggregate: [] as any[], count: [] as any[], wake: [] as any[] };
  const branchOf = (match: any) => (typeof match.storeId === 'string' ? match.storeId : match.storeId.$in.join('+'));
  const model = {
    aggregate: jest.fn((pipeline: any[]) => {
      calls.aggregate.push(pipeline);
      const result = { exec: async () => groups[branchOf(pipeline[0].$match)] || [], hint: () => result };
      return result;
    }),
    countDocuments: jest.fn((query: any) => {
      calls.count.push(query);
      return { exec: async () => (query.unreadCount ? 7 : 3) };
    }),
    updateMany: jest.fn((filter: any) => {
      calls.wake.push(filter);
      return { exec: async () => ({ modifiedCount: 0 }) };
    }),
    findByIdAndUpdate: jest.fn((id: string) => {
      const doc = { _id: id, storeId: 's1', status: 'open', platform: 'instagram' };
      const query: any = Promise.resolve(doc);
      query.lean = () => ({ exec: async () => doc });
      return query;
    }),
    findById: jest.fn((id: string) => ({ lean: () => ({ exec: async () => ({ _id: id, storeId: 's1', status: 'pending', snoozedUntil: null }) }) })),
  };
  const gateway = { server: { to: () => ({ emit: jest.fn() }) } };
  const service = new ConversationsService(model as any, {} as any, {} as any, {} as any, gateway as any, {} as any, {} as any);
  return { service, model, calls };
}

describe('ConversationsService.countInbox', () => {
  let now = 1_700_000_000_000;
  beforeEach(() => { now = 1_700_000_000_000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());

  it('derives the view tabs from one grouped pass; open is the unassigned queue without parked ones, all adds up the views', async () => {
    const { service, calls } = setup({
      s1: [
        { _id: { status: 'open', owner: 'none' }, n: 5 }, { _id: { owner: 'none' }, n: 2 }, { _id: { status: 'pending', owner: 'none' }, n: 4 },
        { _id: { status: 'open', owner: 'match' }, n: 8 }, { _id: { status: 'snoozed', owner: 'match' }, n: 6 }, { _id: { status: 'open', owner: 'other' }, n: 9 },
        { _id: { status: 'closed', owner: 'match' }, n: 3 }, { _id: { status: 'closed', owner: 'none' }, n: 1 }, { _id: { status: 'snoozed', owner: 'none' }, n: 2 },
      ],
    });
    const counts = await service.countInbox(['s1'], { view: 'active', tab: 'unread', platform: 'whatsapp', agentId: 'u1' });
    expect(counts).toEqual({ all: 14, active: 7, pending: 4, closed: 3, mine: 14, unread: 7, needsReply: 3 });
    // The grouped pass keeps every filter except the view; unread / needs-reply stay inside the open view.
    expect(calls.aggregate[0][0].$match).toEqual({ storeId: 's1', platform: 'whatsapp' });
    expect(calls.count).toHaveLength(2);
    for (const query of calls.count) expect(query).toMatchObject({ storeId: 's1', platform: 'whatsapp', status: { $nin: ['snoozed', 'closed', 'pending'] }, agentId: null });
  });

  it('lists all as the union of open, pending and closed, each with its own owner rule', async () => {
    const { service, calls } = setup();
    await service.countInbox(['s1'], { view: 'all', tab: 'unread', agentId: 'u1' });
    expect(calls.count[0].$and[0]).toEqual({ $or: [
      { status: { $nin: ['snoozed', 'closed', 'pending'] }, agentId: null },
      { status: 'pending', agentId: { $in: [null, 'u1'] } },
      { status: 'closed', agentId: 'u1' },
    ] });
    await service.countInbox(['s1'], { view: 'pending', search: 'ali', agentId: 'u1' });
    expect(calls.count[2]).toMatchObject({ status: 'pending' });
    expect(calls.count[2]).not.toHaveProperty('agentId');
    await service.countInbox(['s1'], { view: 'pending', agentId: undefined });
    expect(calls.count[4]).not.toHaveProperty('agentId');
  });

  it('scopes mine and closed to the member, and a search to nobody', async () => {
    const { service, calls } = setup();
    await service.countInbox(['s1'], { view: 'mine', agentId: 'u1' });
    expect(calls.count[0]).toMatchObject({ status: { $ne: 'closed' }, agentId: 'u1' });
    await service.countInbox(['s1'], { view: 'closed' });
    expect(calls.count[2]).toMatchObject({ status: 'closed', agentId: { $ne: null } });
    await service.countInbox(['s1'], { view: 'active', search: 'ali', agentId: 'u1' });
    expect(calls.count[4]).not.toHaveProperty('agentId');
  });

  it('never shares counts between members', async () => {
    const { service, model } = setup();
    await service.countInbox(['s1'], { agentId: 'u1' });
    await service.countInbox(['s1'], { agentId: 'u2' });
    await service.countInbox(['s1'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(3);
  });

  it('answers concurrent identical requests with a single computation', async () => {
    const { service, model } = setup({ s1: [{ _id: 'open', n: 1 }] });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.countInbox(['s1'], { view: 'active' })));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(model.aggregate).toHaveBeenCalledTimes(1);
  });

  it('never shares counts between different branch sets, but ignores their order', async () => {
    const { service, model } = setup({ s1: [{ _id: 'open', n: 1 }], s2: [{ _id: 'open', n: 50 }], 'a+b': [{ _id: 'open', n: 9 }] });
    expect((await service.countInbox(['s1'], {})).active).toBe(1);
    expect((await service.countInbox(['s2'], {})).active).toBe(50);
    await service.countInbox(['a', 'b'], {});
    await service.countInbox(['b', 'a'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(3);
  });

  it('keys on every filter that changes the result', async () => {
    const { service, model } = setup();
    await service.countInbox(['s1'], { view: 'active' });
    await service.countInbox(['s1'], { view: 'active', tab: 'unread' }); // the tab does not change the counts
    await service.countInbox(['s1'], {}); // no view means active
    await service.countInbox(['s1'], { view: 'closed' });
    await service.countInbox(['s1'], { platform: 'whatsapp' });
    await service.countInbox(['s1'], { search: ' ali ' });
    await service.countInbox(['s1'], { search: 'ali' });
    await service.countInbox(['s1'], { tag: 'x' });
    await service.countInbox(['s1'], { rating: 'positive' });
    expect(model.aggregate).toHaveBeenCalledTimes(6);
  });

  it('reuses counts for a few seconds, then reads them again', async () => {
    const { service, model } = setup();
    await service.countInbox(['s1'], {});
    now += 2_999;
    await service.countInbox(['s1'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(1);
    now += 1;
    await service.countInbox(['s1'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(2);
  });

  it('drops a branch\'s cached counts when the team changes a conversation there, and only that branch\'s', async () => {
    const { service, model } = setup();
    await service.countInbox(['s1'], {});
    await service.countInbox(['s1', 's2'], {});
    await service.countInbox(['s2'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(3);

    await service.setStatus('c1', 'pending'); // conversation c1 is in s1
    await service.countInbox(['s1'], {});
    await service.countInbox(['s1', 's2'], {});
    await service.countInbox(['s2'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(5);

    await service.markAsRead('c1');
    await service.countInbox(['s1'], {});
    expect(model.aggregate).toHaveBeenCalledTimes(6);
  });

  it('counts without the index hint while the index is still being built', async () => {
    const { service, model } = setup({ s1: [{ _id: { status: 'open', owner: 'none' }, n: 4 }] });
    const fallback = model.aggregate.getMockImplementation()!;
    model.aggregate.mockImplementationOnce((pipeline: any[]) => {
      const unbuilt: any = { exec: async () => ({}) };
      unbuilt.hint = () => ({ exec: async () => { throw new Error('hint provided does not correspond to an existing index'); } });
      return unbuilt;
    }).mockImplementationOnce(fallback);
    await expect(service.countInbox(['s1'], {})).resolves.toMatchObject({ active: 4 });
  });

  it('does not cache a failure', async () => {
    const { service, model } = setup();
    model.aggregate.mockImplementationOnce(() => {
      const failing: any = { exec: async () => { throw new Error('mongo down'); } };
      failing.hint = () => failing;
      return failing;
    });
    await expect(service.countInbox(['s1'], {})).rejects.toThrow('mongo down');
    await expect(service.countInbox(['s1'], {})).resolves.toMatchObject({ active: 0 });
  });

  it('returns zeros without querying when no branch is accessible', async () => {
    const { service, model } = setup();
    expect(await service.countInbox([], {})).toEqual({ all: 0, active: 0, pending: 0, closed: 0, mine: 0, unread: 0, needsReply: 0 });
    expect(model.aggregate).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();
  });
});

describe('ConversationsService snooze wake-up', () => {
  let now = 1_700_000_000_000;
  beforeEach(() => { now = 1_700_000_000_000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());

  it('reopens expired snoozes of a branch at most once per interval, and only for branches not just checked', async () => {
    const { service, calls } = setup();
    await service.countInbox(['s1'], { view: 'active' });
    await service.countInbox(['s1'], { view: 'closed' }); // another cache key: computed, but s1 was just woken
    expect(calls.wake).toHaveLength(1);
    expect(calls.wake[0]).toEqual({ storeId: { $in: ['s1'] }, status: 'snoozed', snoozedUntil: { $lte: new Date(now) } });

    await service.countInbox(['s1', 's2'], {});
    expect(calls.wake).toHaveLength(2);
    expect(calls.wake[1].storeId).toEqual({ $in: ['s2'] });

    now += 10_000;
    await service.countInbox(['s1'], { platform: 'whatsapp' });
    expect(calls.wake).toHaveLength(3);
  });

  it('checks a branch again right away after a failed wake-up', async () => {
    const { service, model, calls } = setup();
    model.updateMany.mockImplementationOnce((filter: any) => { calls.wake.push(filter); return { exec: async () => { throw new Error('write failed'); } }; });
    await expect(service.countInbox(['s1'], {})).rejects.toThrow('write failed');
    await service.countInbox(['s1'], { view: 'closed' });
    expect(calls.wake).toHaveLength(2);
  });
});
