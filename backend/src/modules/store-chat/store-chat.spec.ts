import { StoreChatService } from './store-chat.service';

describe('store chat needs-reply count', () => {
  it('counts unread chats and chats where the customer wrote last', () => {
    expect(StoreChatService.countNeedsReply([
      { unreadCount: 2, lastMessage: { senderType: 'CUSTOMER' } },
      { unreadCount: 0, lastMessage: { senderType: 'CUSTOMER' } },
      { unreadCount: 0, lastMessage: { senderType: 'EMPLOYEE' } },
      { unreadCount: 0, lastMessage: null },
      { unreadCount: 1 },
    ])).toBe(3);
  });

  it('treats a malformed answer as nothing waiting', () => {
    expect(StoreChatService.countNeedsReply(null)).toBe(0);
    expect(StoreChatService.countNeedsReply({})).toBe(0);
  });
});
