import api from '../api/client';

export type TrialRequestStatus = 'new' | 'contacted' | 'subscribed' | 'closed';
export interface TrialRequest {
  id: string;
  name: string;
  phone: string;
  company: string;
  message: string | null;
  status: TrialRequestStatus;
  createdAt: string;
}
export interface TrialRequestPage { items: TrialRequest[]; total: number; page: number; totalPages: number }

export const TRIAL_STATUS: Record<TrialRequestStatus, { label: string; cls: string }> = {
  new: { label: 'جديد', cls: 'bg-labbaik-blue text-labbaik-on-accent' },
  contacted: { label: 'تم التواصل', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  subscribed: { label: 'اشترك', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  closed: { label: 'مغلق', cls: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300' },
};

/** Fired after a request's status changes, so the sidebar badge updates at once. */
export const TRIAL_REQUESTS_CHANGED = 'trial-requests:changed';

/** Website trial / subscription requests (the platform owner's organization only). */
export const trialRequestsApi = {
  submit: (body: { name: string; phone: string; company: string; message?: string; website?: string }) =>
    api.post<{ ok: boolean }>('/organizations/trial-requests', body).then((r) => r.data),
  summary: () =>
    api.get<{ enabled: boolean; newCount: number }>('/organizations/trial-requests/summary')
      .then((r) => ({ enabled: Boolean(r.data?.enabled), newCount: Number(r.data?.newCount) || 0 })),
  list: (status: TrialRequestStatus | 'all', page: number) =>
    api.get<TrialRequestPage>('/organizations/trial-requests', { params: { status: status === 'all' ? undefined : status, page } }).then((r) => r.data),
  setStatus: (id: string, status: TrialRequestStatus) =>
    api.patch(`/organizations/trial-requests/${id}`, { status }).then((r) => r.data),
};
