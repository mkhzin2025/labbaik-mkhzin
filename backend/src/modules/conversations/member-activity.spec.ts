import { ConversationsService } from './conversations.service';

describe('ConversationsService.getMemberActivity', () => {
  const h = 3600 * 1000;
  // One local day in UTC+3: 2026-11-01 00:00 to 2026-11-02 00:00 (+03:00).
  const from = new Date(Date.UTC(2026, 10, 1) - 3 * h);
  const to = new Date(from.getTime() + 24 * h);
  const at = (hours: number) => from.getTime() + hours * h;
  const customer = (t: number) => ({ from: '966500000001', type: 'text', timestamp: t });
  const reply = (t: number, agentId = 'u1') => ({ from: 'me', type: 'text', isManual: true, agentId, timestamp: t });

  function run(docs: any[]) {
    const find = jest.fn(() => ({ lean: () => ({ cursor: () => (async function* () { yield* docs; })() }) }));
    const service = new ConversationsService({ find } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return service.getMemberActivity(['s1'], 'u1', from, to, 180);
  }

  it('counts the member\'s replies, closes and ratings inside the period, and their response time', async () => {
    const result = await run([
      {
        _id: 'c1', customerPhone: '966500000001', storeId: 's1', platform: 'whatsapp', status: 'closed', rating: 'positive', ratedAgentId: 'u1', ratedAt: new Date(at(5)),
        closures: [{ by: 'u1', name: 'A', at: new Date(at(4)) }],
        // Customer wrote twice, then u1 answered 10 minutes after the first message.
        messages: [customer(at(1)), customer(at(1) + 5 * 60_000), reply(at(1) + 10 * 60_000), reply(at(2))],
      },
      {
        _id: 'c2', customerPhone: '966500000002', storeId: 's1', platform: 'whatsapp', status: 'open', rating: null, closures: [],
        // Another member's reply, and one of u1 from the day before: neither counts.
        messages: [customer(at(3)), reply(at(3) + 60_000, 'u2'), reply(at(-2))],
      },
    ]);
    expect(result.totals).toEqual(expect.objectContaining({ replies: 2, conversations: 1, closed: 1, positive: 1, rated: 1, satisfaction: 1 }));
    expect(result.responseTime).toEqual(expect.objectContaining({ medianSeconds: 600, samples: 1 }));
    expect(result.daily).toEqual([expect.objectContaining({ date: '2026-11-01', replies: 2, closed: 1, positive: 1 })]);
    expect(result.conversations.map((c) => c.id)).toEqual(['c1']);
  });

  it('does not credit a rating given to someone else', async () => {
    const result = await run([{
      _id: 'c1', customerPhone: '966500000001', storeId: 's1', platform: 'whatsapp', status: 'closed', rating: 'negative', ratedAgentId: 'u2', ratedAt: new Date(at(5)),
      closures: [], messages: [customer(at(1)), reply(at(2))],
    }]);
    expect(result.totals).toEqual(expect.objectContaining({ replies: 1, rated: 0, negative: 0, satisfaction: null }));
  });
});
