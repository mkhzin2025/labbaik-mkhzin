import api from '../api/client';

export type Rating = 'positive' | 'neutral' | 'negative';

export const RATING_LABELS: Record<Rating, { label: string; emoji: string; cls: string }> = {
  positive: { label: 'راضٍ', emoji: '👍', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
  neutral: { label: 'عادي', emoji: '😐', cls: 'bg-labbaik-page text-neutral-700 dark:text-neutral-200' },
  negative: { label: 'غير راضٍ', emoji: '👎', cls: 'bg-red-500/15 text-red-800 dark:text-red-300' },
};

/** GET /conversations/team/:userId/activity */
export interface MemberActivity {
  member: { userId: string; fullName: string; email: string; role: string };
  period: { from: string; to: string };
  totals: { replies: number; conversations: number; closed: number; positive: number; neutral: number; negative: number; rated: number; satisfaction: number | null };
  responseTime: { medianSeconds: number | null; within5MinShare: number | null; samples: number };
  daily: { date: string; replies: number; closed: number; positive: number; neutral: number; negative: number }[];
  conversations: { id: string; customerName: string | null; customerPhone: string; storeId: string; platform: string; status: string; replies: number; closed: number; rating: Rating | null; lastActivityAt: string | null }[];
  conversationsTotal: number;
}

/** The signed-in user as saved at login. */
export function currentUser(): { id?: string; fullName?: string; email?: string } {
  try { return JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch { return {}; }
}

/** yyyy-mm-dd in the viewer's time zone. */
export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "45 ث"، "12 د"، "2.5 س". */
export function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  return `${(seconds / 3600).toFixed(1)} س`;
}

/** Downloads a PDF from the API; rejects with the server's message (as text) on failure. */
export async function downloadPdf(path: string, params: Record<string, unknown>, filename: string) {
  try {
    const response = await api.get(path, { params, responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (requestError) {
    const data = (requestError as { response?: { data?: Blob } }).response?.data;
    let message = 'تعذر إنشاء التقرير. حاول مرة أخرى.';
    if (data instanceof Blob) {
      try { message = (JSON.parse(await data.text()) as { message?: string }).message || message; } catch { /* not JSON */ }
    }
    throw message;
  }
}
