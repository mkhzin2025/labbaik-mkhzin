import { ConversationsService } from './conversations.service';

const DAY = 24 * 3600 * 1000;

describe('rating policy', () => {
  it('asks on every close, or only when a flow handed the conversation to the team', () => {
    expect(ConversationsService.ratingAllowed({ frequency: 'daily', scope: 'all' }, false)).toBe(true);
    expect(ConversationsService.ratingAllowed({ frequency: 'daily', scope: 'handoff' }, false)).toBe(false);
    expect(ConversationsService.ratingAllowed({ frequency: 'daily', scope: 'handoff' }, true)).toBe(true);
  });

  it('asks the same customer again only after the chosen period', () => {
    const now = Date.UTC(2026, 10, 24);
    const wroteJustNow = now - 1000;
    // "Always": any earlier request counts, as long as the customer wrote since.
    expect(ConversationsService.ratingCutoff('always', wroteJustNow, now).getTime()).toBe(wroteJustNow);
    expect(ConversationsService.ratingCutoff('daily', wroteJustNow, now).getTime()).toBe(now - DAY);
    expect(ConversationsService.ratingCutoff('weekly', wroteJustNow, now).getTime()).toBe(now - 7 * DAY);
    expect(ConversationsService.ratingCutoff('monthly', wroteJustNow, now).getTime()).toBe(now - 30 * DAY);
  });
});
