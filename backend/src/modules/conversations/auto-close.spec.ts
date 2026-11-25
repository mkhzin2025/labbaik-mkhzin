import { ConversationsService } from './conversations.service';

const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;

/** Model double: `find` returns the candidates; `findOneAndUpdate` closes unless the thread moved (`moved`). */
function setup(candidates: any[], moved = new Set<string>()) {
  const emit = jest.fn();
  const model = {
    find: jest.fn(() => ({ limit: () => ({ lean: () => ({ exec: async () => candidates }) }) })),
    findOneAndUpdate: jest.fn((filter: any) => ({
      lean: () => ({ exec: async () => (moved.has(filter._id) ? null : { _id: filter._id, storeId: 's1', platform: 'instagram' }) }),
    })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  const gateway = { server: { to: () => ({ emit }) } };
  const service = new ConversationsService(model as any, {} as any, {} as any, {} as any, gateway as any, {} as any, {} as any);
  return { service, model, emit };
}

const teamReply = { from: 'me', isManual: true, agentId: 'u1', agentName: 'سارة', text: 'تفضل' };

describe('closing conversations the customer stopped answering', () => {
  afterEach(() => { delete process.env.CONVERSATION_AUTO_CLOSE_MINUTES; });

  it('only counts a reply typed by a team member as waiting on the customer', () => {
    expect(ConversationsService.endsWithTeamReply(teamReply)).toBe(true);
    expect(ConversationsService.endsWithTeamReply({ from: 'me', isManual: false })).toBe(false); // flow / AI / rating request
    expect(ConversationsService.endsWithTeamReply({ from: '9665000', isManual: undefined })).toBe(false);
    expect(ConversationsService.endsWithTeamReply(null)).toBe(false);
  });

  it('reads only the conversations whose wait is due, using the partial index', async () => {
    const { service, model } = setup([]);
    await service.closeUnansweredConversations(NOW);
    const [query] = model.find.mock.calls[0] as any[];
    expect(query).toEqual({ awaitingCustomerSince: { $type: 'date', $lte: new Date(NOW - 10 * MIN) } });
  });

  it('closes after 10 silent minutes, credits the handling member and sets up a fresh start', async () => {
    const since = new Date(NOW - 11 * MIN);
    const { service, model, emit } = setup([{ _id: 'c1', awaitingCustomerSince: since, status: 'open', blockedAt: null, agentId: 'u1', agentName: 'سارة' }]);
    await service.closeUnansweredConversations(NOW);

    const [filter, update] = model.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter).toEqual({ _id: 'c1', status: { $in: ['open', 'pending'] }, awaitingCustomerSince: since });
    expect(update.$set).toMatchObject({ status: 'closed', closedById: 'u1', closedByName: 'سارة', unreadCount: 0, awaitingCustomerSince: null });
    expect(update.$push.closures.$each[0]).toMatchObject({ by: 'u1', auto: true });

    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'c1' }, { $set: { restartFlow: true, currentFlowId: null, currentFlowNodeId: null, flowInvalidReplies: 0 } });
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'c1', aiPausedReason: { $in: ['agent_reply', 'handoff'] } },
      { $set: { aiEnabled: true, aiDisabledUntil: null, aiPausedReason: null } },
    );
    expect(emit).toHaveBeenCalledWith('conversation_status', { conversationId: 'c1', status: 'closed', snoozedUntil: null });
  });

  it('leaves a conversation open when the customer wrote in the meantime', async () => {
    const { service, model, emit } = setup([{ _id: 'c1', awaitingCustomerSince: new Date(NOW - 11 * MIN), status: 'open' }], new Set(['c1']));
    await service.closeUnansweredConversations(NOW);
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not close a snoozed conversation, and drops it from the sweep', async () => {
    const since = new Date(NOW - 11 * MIN);
    const { service, model } = setup([{ _id: 'c1', awaitingCustomerSince: since, status: 'snoozed' }]);
    await service.closeUnansweredConversations(NOW);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'c1', awaitingCustomerSince: since }, { $set: { awaitingCustomerSince: null } });
  });

  it('can be turned off', async () => {
    process.env.CONVERSATION_AUTO_CLOSE_MINUTES = '0';
    const { service, model } = setup([]);
    await service.closeUnansweredConversations(NOW);
    expect(model.find).not.toHaveBeenCalled();
  });
});

describe('conversations a member still owes an answer', () => {
  const customer = { from: '9665000', type: 'text' };
  const team = { from: 'me', type: 'text', isManual: true };
  it('counts them when the customer had the last word', () => {
    expect(ConversationsService.customerHasLastWord([team, customer])).toBe(true);
    expect(ConversationsService.customerHasLastWord([team, customer, { from: 'system', type: 'system_error' }])).toBe(true);
  });
  it('does not count a reply from the team, or a reaction to it', () => {
    expect(ConversationsService.customerHasLastWord([customer, team])).toBe(false);
    expect(ConversationsService.customerHasLastWord([customer, team, { from: '9665000', type: 'reaction' }])).toBe(false);
    expect(ConversationsService.customerHasLastWord([])).toBe(false);
  });
});
