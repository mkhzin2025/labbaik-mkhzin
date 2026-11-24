/** How often a customer may be asked to rate the team when a conversation is closed. Chosen per organization. */
export const RATING_FREQUENCIES = ['always', 'daily', 'weekly', 'monthly'] as const;
export type RatingFrequency = (typeof RATING_FREQUENCIES)[number];

/** Which closed conversations ask for a rating: every one, or only those a flow handed to the team. */
export const RATING_SCOPES = ['all', 'handoff'] as const;
export type RatingScope = (typeof RATING_SCOPES)[number];

const DAY_MS = 24 * 3600 * 1000;

/** After asking, the same customer is not asked again until this much time has passed. */
export const RATING_COOLDOWN_MS: Record<RatingFrequency, number> = {
  always: 0,
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
};

export const ratingFrequencyOf = (value: unknown): RatingFrequency =>
  (RATING_FREQUENCIES as readonly unknown[]).includes(value) ? value as RatingFrequency : 'daily';

export const ratingScopeOf = (value: unknown): RatingScope =>
  (RATING_SCOPES as readonly unknown[]).includes(value) ? value as RatingScope : 'all';
