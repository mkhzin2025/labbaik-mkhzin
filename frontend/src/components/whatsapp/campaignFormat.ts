import { toEnglishDigits } from '@/lib/utils';
import type { CampaignStatus } from './campaignShared';

export const num = (value: number) => toEnglishDigits(value.toLocaleString('en-US'));
/** Share as a whole percent, or an em dash when there is no base to divide by. */
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
/** Replies plus button clicks (Meta's counts, URL buttons included); replies alone when those are missing. */
export const interactionsOf = (s: { replied: number; interactions?: number }) => s.interactions ?? s.replied;
/** Interactions as a share of readers, capped at 100% since clicks are counted per press rather than per person. */
export const engagement = (s: { read: number; replied: number; interactions?: number }) => pct(Math.min(interactionsOf(s), s.read), s.read);
export const dateTime = (iso?: string | null) => (iso ? toEnglishDigits(new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn',{ dateStyle: 'medium', timeStyle: 'short' })) : '—');

export const isActive = (status: CampaignStatus) => status === 'queued' || status === 'sending';
