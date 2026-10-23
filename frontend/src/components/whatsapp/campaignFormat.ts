import { toEnglishDigits } from '@/lib/utils';
import type { CampaignStatus } from './campaignShared';

export const num = (value: number) => toEnglishDigits(value.toLocaleString('en-US'));
/** Share as a whole percent, or an em dash when there is no base to divide by. */
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
export const dateTime = (iso?: string | null) => (iso ? toEnglishDigits(new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn',{ dateStyle: 'medium', timeStyle: 'short' })) : '—');

export const isActive = (status: CampaignStatus) => status === 'queued' || status === 'sending';
