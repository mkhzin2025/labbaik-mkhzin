import { ConversationsService } from './conversations.service';

describe('ConversationsService.markReadByBot', () => {
  function setup(found: { _id: string; storeId: string } | null) {
    const emit = jest.fn();
    const model = {
      findOneAndUpdate: jest.fn(() => ({ lean: () => ({ exec: async () => found }) })),
    };
    const gateway = { server: { to: jest.fn(() => ({ emit })) } };
    const service = new ConversationsService(model as any, {} as any, {} as any, {} as any, gateway as any, {} as any, {} as any);
    return { service, model, gateway, emit };
  }

  it('clears unread only for threads not handed to the team and handled by nobody, then tells the inbox', async () => {
    const { service, model, gateway, emit } = setup({ _id: 'c1', storeId: 's1' });
    await service.markReadByBot('c1');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'c1', unreadCount: { $gt: 0 }, awaitingReply: { $ne: true }, agentId: null },
      { $set: { unreadCount: 0 } },
      { projection: { storeId: 1 } },
    );
    expect(gateway.server.to).toHaveBeenCalledWith('store_s1');
    expect(emit).toHaveBeenCalledWith('conversation_read', { storeId: 's1', conversationId: 'c1' });
  });

  it('stays silent when nothing changed (handed off, handled, or already read)', async () => {
    const { service, emit } = setup(null);
    await service.markReadByBot('c1');
    expect(emit).not.toHaveBeenCalled();
  });
});
