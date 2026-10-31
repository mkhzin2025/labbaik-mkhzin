import { ConversationsService } from './conversations.service';

describe('ConversationsService.isAcknowledgement', () => {
  it.each(['شكرا', 'شكراً لك', 'مشكوور'.replace('وو', 'و'), 'يعطيك العافية', 'تمام 👍', 'OK', '👍', '🙏🌹', 'جزاك الله خير', 'العفو'])(
    'treats "%s" as needing no reply',
    (text) => expect(ConversationsService.isAcknowledgement(text)).toBe(true),
  );

  it.each(['شكرا، متى يوصل الطلب؟', 'ابي الملف', 'كم سعر الرز', 'السلام عليكم', '', 'تمام بس ما وصلني شي'])(
    'keeps "%s" waiting for a reply',
    (text) => expect(ConversationsService.isAcknowledgement(text)).toBe(false),
  );
});
