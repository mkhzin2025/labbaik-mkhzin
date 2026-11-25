import { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Inbox, MessageCircle, Phone } from 'lucide-react';
import { useToast } from '../components/Toast';
import { formatNumber } from '../lib/utils';
import { TRIAL_REQUESTS_CHANGED, TRIAL_STATUS, trialRequestsApi } from '../lib/trial-requests';
import type { TrialRequest, TrialRequestPage, TrialRequestStatus } from '../lib/trial-requests';

type Filter = TrialRequestStatus | 'all';
const FILTERS: [Filter, string][] = [['new', 'جديدة'], ['contacted', 'تم التواصل'], ['subscribed', 'اشتركوا'], ['closed', 'مغلقة'], ['all', 'الكل']];
const STATUS_ORDER: TrialRequestStatus[] = ['new', 'contacted', 'subscribed', 'closed'];

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** 966551234567 → 0551234567 for reading; the stored form stays international for WhatsApp links. */
const localPhone = (phone: string) => (/^9665\d{8}$/.test(phone) ? `0${phone.slice(3)}` : phone);

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Trial / subscription requests sent from the website form (شركة مخازن only). */
export default function TrialRequestsPage() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>('new');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TrialRequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: Filter, pageNo: number) => {
    setLoading(true);
    try {
      setData(await trialRequestsApi.list(status, pageNo));
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل الطلبات.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(filter, page); }, [load, filter, page]);

  const changeStatus = async (request: TrialRequest, status: TrialRequestStatus) => {
    if (status === request.status) return;
    setBusyId(request.id);
    try {
      await trialRequestsApi.setStatus(request.id, status);
      // Out of the current filter now: drop it from the list; otherwise just relabel it.
      setData((current) => current && {
        ...current,
        items: filter === 'all' ? current.items.map((r) => (r.id === request.id ? { ...r, status } : r)) : current.items.filter((r) => r.id !== request.id),
        total: filter === 'all' ? current.total : current.total - 1,
      });
      window.dispatchEvent(new Event(TRIAL_REQUESTS_CHANGED));
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحديث الطلب.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl space-y-4 pb-10" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white">طلبات الاشتراك</h1>
        <p className="mt-1 text-sm text-labbaik-text-muted">الطلبات التي تصل من نموذج «اطلب تجربة» في موقع تيل بوت.</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="حالة الطلبات">
        {FILTERS.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === key}
            key={key}
            onClick={() => { setFilter(key); setPage(1); }}
            className={`h-9 rounded-lg px-3.5 text-sm font-bold transition-colors cursor-pointer ${filter === key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'bg-labbaik-surface border border-labbaik-border text-labbaik-text-muted hover:text-labbaik-blue'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-labbaik-border bg-labbaik-surface" />)}
        </div>
      ) : !data?.items.length ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-labbaik-border bg-labbaik-surface px-6 py-14 text-center">
          <Inbox size={28} className="text-labbaik-text-muted" />
          <p className="mt-3 font-bold text-neutral-800 dark:text-neutral-100">لا توجد طلبات هنا</p>
          <p className="mt-1 text-sm text-labbaik-text-muted">ستظهر الطلبات الجديدة فور إرسالها من الموقع.</p>
        </div>
      ) : (
        <ul className={`divide-y divide-labbaik-border rounded-xl border border-labbaik-border bg-labbaik-surface transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {data.items.map((request) => (
            <li key={request.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-neutral-900 dark:text-white">{request.name}</span>
                  <span className={`h-5 rounded px-1.5 text-[11px] font-bold leading-5 ${TRIAL_STATUS[request.status].cls}`}>{TRIAL_STATUS[request.status].label}</span>
                  <span className="text-xs text-labbaik-text-muted tabular-nums">{dateLabel(request.createdAt)}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-labbaik-text-muted">
                  <span className="inline-flex items-center gap-1"><Building2 size={14} /> {request.company}</span>
                  <a href={`tel:+${request.phone}`} dir="ltr" className="inline-flex items-center gap-1 font-bold text-neutral-800 dark:text-neutral-100 hover:text-labbaik-blue">
                    <Phone size={13} /> {localPhone(request.phone)}
                  </a>
                </p>
                {request.message && <p className="mt-2 rounded-lg bg-labbaik-page px-3 py-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">{request.message}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={`https://wa.me/${request.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <MessageCircle size={15} /> واتساب
                </a>
                <select
                  aria-label="حالة الطلب"
                  value={request.status}
                  disabled={busyId === request.id}
                  onChange={(event) => void changeStatus(request, event.target.value as TrialRequestStatus)}
                  className="h-9 rounded-lg border border-labbaik-border bg-labbaik-surface px-2 text-sm font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer disabled:opacity-50"
                >
                  {STATUS_ORDER.map((status) => <option key={status} value={status}>{TRIAL_STATUS[status].label}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-labbaik-border bg-labbaik-surface px-3 text-sm font-bold disabled:opacity-40 cursor-pointer">
            <ChevronRight size={16} /> السابق
          </button>
          <span className="text-sm font-bold text-labbaik-text-muted tabular-nums">صفحة {formatNumber(page)} من {formatNumber(data.totalPages)}</span>
          <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-labbaik-border bg-labbaik-surface px-3 text-sm font-bold disabled:opacity-40 cursor-pointer">
            التالي <ChevronLeft size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
