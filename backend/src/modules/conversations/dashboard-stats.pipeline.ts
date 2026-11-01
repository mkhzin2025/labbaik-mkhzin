/**
 * The home page totals as one MongoDB aggregation: a single pass over the threads, grouped twice with $facet
 * (per platform, and the last 7 days' messages per UTC day). Only a few rows come back to the app.
 * Message times are stored as epoch ms, but older rows may hold a date or string; those are converted only
 * where a time is actually needed.
 */
export function dashboardStatsPipeline(storeIds: string[], since: Date) {
  const sinceMs = since.getTime();
  const toMs = (value: string) => ({ $cond: [{ $isNumber: value }, value, { $toLong: { $convert: { input: value, to: 'date', onError: null, onNull: null } } }] });
  const isAuto = (m: string) => ({ $and: [{ $eq: [`${m}.from`, 'me'] }, { $ne: [`${m}.isManual`, true] }] });
  return [
    { $match: { storeId: { $in: storeIds } } },
    { $project: { _id: 0, platform: 1, rating: 1, lastMessageAt: 1, messages: { $ifNull: ['$messages', []] } } },
    {
      $project: {
        platform: 1,
        rating: 1,
        n: { $size: '$messages' },
        auto: { $filter: { input: '$messages', as: 'm', cond: isAuto('$$m') } },
        // The team's reply times: a customer message directly followed by a team member's reply (under 24h).
        human: {
          $reduce: {
            input: '$messages',
            initialValue: { sum: 0, count: 0, prevCustomer: false, prevT: null },
            in: {
              $let: {
                vars: {
                  gap: {
                    $cond: [
                      { $and: ['$$value.prevCustomer', { $eq: ['$$this.from', 'me'] }, { $eq: ['$$this.isManual', true] }] },
                      { $subtract: [toMs('$$this.timestamp'), toMs('$$value.prevT')] },
                      null,
                    ],
                  },
                },
                in: {
                  $let: {
                    vars: { ok: { $and: [{ $gt: ['$$gap', 0] }, { $lt: ['$$gap', 86_400_000] }] } },
                    in: {
                      sum: { $add: ['$$value.sum', { $cond: ['$$ok', '$$gap', 0] }] },
                      count: { $add: ['$$value.count', { $cond: ['$$ok', 1, 0] }] },
                      prevCustomer: { $ne: ['$$this.from', 'me'] },
                      prevT: '$$this.timestamp',
                    },
                  },
                },
              },
            },
          },
        },
        // Times of this week's messages, read only for threads active this week.
        recent: {
          $cond: [
            { $gte: ['$lastMessageAt', since] },
            { $filter: { input: { $map: { input: '$messages', as: 'm', in: toMs('$$m.timestamp') } }, as: 't', cond: { $gte: ['$$t', sinceMs] } } },
            [],
          ],
        },
      },
    },
    {
      $facet: {
        platforms: [
          {
            $group: {
              _id: '$platform',
              conversations: { $sum: 1 },
              messages: { $sum: '$n' },
              aiReplies: { $sum: { $size: '$auto' } },
              aiChars: { $sum: { $reduce: { input: '$auto', initialValue: 0, in: { $add: ['$$value', { $cond: [{ $eq: [{ $type: '$$this.text' }, 'string'] }, { $strLenCP: '$$this.text' }, 0] }] } } } },
              humanMs: { $sum: '$human.sum' },
              humanCount: { $sum: '$human.count' },
              positive: { $sum: { $cond: [{ $eq: ['$rating', 'positive'] }, 1, 0] } },
              neutral: { $sum: { $cond: [{ $eq: ['$rating', 'neutral'] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$rating', 'negative'] }, 1, 0] } },
            },
          },
        ],
        days: [
          { $match: { 'recent.0': { $exists: true } } },
          { $unwind: '$recent' },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$recent' } } }, count: { $sum: 1 } } },
        ],
      },
    },
  ];
}

export type DashboardStatsRow = {
  platforms: { _id: string; conversations: number; messages: number; aiReplies: number; aiChars: number; humanMs: number; humanCount: number; positive: number; neutral: number; negative: number }[];
  days: { _id: string; count: number }[];
};
