import { ConversationsService } from './conversations.service';

/** "Needs a reply" = a flow handed the conversation to an employee and nobody from the team has answered. */
function setup() {
  const model = {
    findByIdAndUpdate: jest.fn(async () => ({ storeId: 's1' })),
    findOneAndUpdate: jest.fn(async () => ({})),
  };
  const service = new ConversationsService(model as any, {} as any, {} as any, {} as any, { server: { to: () => ({ emit: jest.fn() }) } } as any, {} as any, {} as any);
  return { service, model };
}

describe('needs a reply', () => {
  it('is set by a flow handoff, not by other pauses', async () => {
    const { service, model } = setup();
    await service.toggleAi('c1', false, 'handoff');
    expect((model.findByIdAndUpdate.mock.calls[0] as any[])[1]).toMatchObject({ aiPausedReason: 'handoff', awaitingReply: true });
    await service.toggleAi('c1', false, 'manual');
    expect((model.findByIdAndUpdate.mock.calls[1] as any[])[1]).not.toHaveProperty('awaitingReply');
  });

  it('is not set by a customer message, and is cleared by a team reply', async () => {
    const { service, model } = setup();
    await service.addMessage('966500000000', 's1', 'whatsapp', { from: '966500000000', text: 'السلام عليكم', type: 'text' });
    expect((model.findOneAndUpdate.mock.calls[0] as any[])[1].$set).not.toHaveProperty('awaitingReply');
    await service.addMessage('966500000000', 's1', 'whatsapp', { from: 'me', text: 'تفضل', type: 'text', isManual: true });
    expect((model.findOneAndUpdate.mock.calls[1] as any[])[1].$set.awaitingReply).toBe(false);
    await service.addMessage('966500000000', 's1', 'whatsapp', { from: 'me', text: 'رسالة التدفق', type: 'text', isManual: false });
    expect((model.findOneAndUpdate.mock.calls[2] as any[])[1].$set).not.toHaveProperty('awaitingReply');
  });
});
