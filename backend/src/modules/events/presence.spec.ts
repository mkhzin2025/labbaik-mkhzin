import { EventsGateway } from './events.gateway';

describe('EventsGateway presence', () => {
  function setup() {
    const emit = jest.fn();
    const gateway = new EventsGateway({} as any, {} as any);
    gateway.server = { to: jest.fn(() => ({ emit })) } as any;
    const open = (user: string, org = 'o1') => {
      const client: any = { data: { user: { sub: user } } };
      (gateway as any).trackPresence(org, user, client);
      return client;
    };
    return { gateway, emit, open };
  }

  it('keeps a member online until their last tab closes, then records when', () => {
    const { gateway, emit, open } = setup();
    const tab1 = open('u1');
    const tab2 = open('u1');
    expect(gateway.presenceOf('o1').online).toEqual(['u1']);
    expect(emit).toHaveBeenCalledTimes(1);
    gateway.handleDisconnect(tab1);
    expect(gateway.presenceOf('o1').online).toEqual(['u1']);
    gateway.handleDisconnect(tab2);
    const { online, lastSeen } = gateway.presenceOf('o1');
    expect(online).toEqual([]);
    expect(lastSeen.u1).toEqual(expect.any(String));
    expect(emit).toHaveBeenLastCalledWith('presence', expect.objectContaining({ userId: 'u1', online: false }));
  });

  it('never shows one organization the members of another', () => {
    const { gateway, open } = setup();
    gateway.handleDisconnect(open('u2', 'o2'));
    open('u1', 'o1');
    expect(gateway.presenceOf('o1')).toEqual({ online: ['u1'], lastSeen: {} });
  });

  it('ignores a socket that closed before it was counted', () => {
    const { gateway } = setup();
    gateway.handleDisconnect({ id: 'x', data: { user: { sub: 'u1' } } } as any);
    expect(gateway.presenceOf('o1').online).toEqual([]);
  });
});
