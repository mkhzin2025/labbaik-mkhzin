import { ConversationsService } from './conversations.service';

describe('ConversationsService.findPaymentFailedFlowReplies', () => {
  const now = Date.now();
  const h = 3600 * 1000;
  const since = now - 20 * h;
  const failedFlow = (t: number, nodeId = 'n1') => ({ from: 'me', timestamp: t, metadata: { source: 'flow', flowId: 'f1', nodeId, status: 'failed', statusErrors: [{ code: 131042 }] } });
  const inbound = (t: number) => ({ from: '966500000001', timestamp: t });

  function run(docs: any[]) {
    const find = jest.fn(() => ({ lean: () => ({ exec: async () => docs }) }));
    const service = new ConversationsService({ find } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return service.findPaymentFailedFlowReplies(['966500000001'], ['s1'], since);
  }

  it('offers failed flow replies to customers still inside the window, once per node', async () => {
    const result = await run([{ _id: 'c1', customerPhone: '966500000001', storeId: 's1', messages: [inbound(now - 2 * h), failedFlow(now - 2 * h + 1), failedFlow(now - h)] }]);
    expect(result.eligible).toEqual([expect.objectContaining({ conversationId: 'c1', nodes: [{ flowId: 'f1', nodeId: 'n1' }] })]);
    expect(result.expired).toBe(0);
  });

  it('counts customers whose last message is older than the window as expired', async () => {
    const result = await run([{ _id: 'c1', customerPhone: '966500000001', storeId: 's1', messages: [inbound(now - 22 * h), failedFlow(now - 19 * h)] }]);
    expect(result.eligible).toEqual([]);
    expect(result.expired).toBe(1);
  });

  it('skips a node already re-sent successfully, and failures older than the window', async () => {
    const resent = { from: 'me', timestamp: now - h / 2, metadata: { source: 'flow', flowId: 'f1', nodeId: 'n1', status: 'delivered' } };
    const result = await run([
      { _id: 'c1', customerPhone: '966500000001', storeId: 's1', messages: [inbound(now - 2 * h), failedFlow(now - h), resent] },
      { _id: 'c2', customerPhone: '966500000001', storeId: 's1', messages: [failedFlow(now - 30 * h), inbound(now - h)] },
    ]);
    expect(result).toEqual({ eligible: [], expired: 0 });
  });
});
