import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import {
  Star,
  Send,
  Sparkles,
  Loader2,
  CheckCircle2,
  Clock,
  Plus,
  Pencil,
  Store,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import CustomerAvatar from '../components/CustomerAvatar';
import { useToast } from '../components/Toast';

interface Review {
  id: string;
  reviewerName: string;
  reviewerPhotoUrl?: string;
  rating: number;
  comment: string;
  reply?: string;
  status: 'pending' | 'replied' | 'ignored';
  createdAt: string;
}

type StatusFilter = 'all' | 'pending' | 'replied';
type SortOrder = 'newest' | 'oldest' | 'lowest' | 'highest';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'بانتظار الرد' },
  { key: 'replied', label: 'تم الرد' },
];

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const relative = (date: string) => toEnglishDigits(formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar }));

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} من 5 نجوم`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600'} />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<SortOrder>('newest');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      const { data } = await api.get<Review[]>('/reviews');
      setReviews(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل التقييمات.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void fetchReviews(); }, [fetchReviews]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const pending = reviews.filter((r) => r.status === 'pending').length;
    const average = total ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => r.rating === stars).length }));
    return { total, pending, replied: total - pending, average, distribution };
  }, [reviews]);

  const visible = useMemo(() => {
    const list = reviews.filter((r) =>
      (status === 'all' || (status === 'pending' ? r.status === 'pending' : r.status === 'replied'))
      && (ratingFilter === null || r.rating === ratingFilter));
    const byDate = (r: Review) => new Date(r.createdAt).getTime();
    return list.sort((a, b) => {
      if (sort === 'oldest') return byDate(a) - byDate(b);
      if (sort === 'lowest') return a.rating - b.rating || byDate(b) - byDate(a);
      if (sort === 'highest') return b.rating - a.rating || byDate(b) - byDate(a);
      return byDate(b) - byDate(a);
    });
  }, [reviews, status, ratingFilter, sort]);

  const tabCount = (key: StatusFilter) => (key === 'all' ? stats.total : key === 'pending' ? stats.pending : stats.replied);

  const openReply = (review: Review) => {
    if (activeId === review.id) return;
    if (replyText.trim() && activeId && !window.confirm('لديك رد غير مرسل. هل تريد تجاهله؟')) return;
    setActiveId(review.id);
    setReplyText(review.reply || '');
  };

  const closeReply = () => {
    setActiveId(null);
    setReplyText('');
  };

  const getAiSuggestion = async (review: Review) => {
    setSuggesting(true);
    try {
      const { data } = await api.get(`/reviews/${review.id}/suggestion`);
      setReplyText(data?.suggestion || '');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر توليد اقتراح الرد. حاول مرة أخرى.'), 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const submitReply = async (review: Review) => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post<Review>(`/reviews/${review.id}/reply`, { reply: replyText.trim() });
      setReviews((current) => current.map((r) => (r.id === review.id ? { ...r, ...data } : r)));
      closeReply();
      showToast(`تم حفظ الرد على تقييم ${review.reviewerName}.`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حفظ الرد.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const simulateReview = async () => {
    try {
      await api.post('/reviews/simulate', {
        name: 'سالم أحمد',
        rating: 5,
        comment: 'أفضل متجر تعاملت معه، الأثاث جودته عالية جداً والتوصيل سريع.',
      });
      await fetchReviews();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إنشاء تقييم تجريبي.'), 'error');
    }
  };

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">تقييمات جوجل ماب</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">راجع ما يقوله العملاء عن متجرك، ورُد عليهم بمساعدة لبيك.</p>
        </div>
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => void simulateReview()}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-dashed border-labbaik-border text-sm font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:border-labbaik-blue/40 cursor-pointer"
            title="يظهر في بيئة التطوير فقط"
          >
            <Plus size={16} /> تقييم تجريبي
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        {/* List */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-labbaik-border bg-labbaik-surface p-2">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="حالة التقييم">
              {STATUS_TABS.map((tab) => (
                <button
                  type="button"
                  role="tab"
                  key={tab.key}
                  aria-selected={status === tab.key}
                  onClick={() => setStatus(tab.key)}
                  className={`h-8 px-3 rounded-full text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${status === tab.key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'bg-labbaik-page text-labbaik-text-muted hover:text-labbaik-blue'}`}
                >
                  {tab.label}
                  <span className={`tabular-nums text-[11px] px-1.5 rounded-full ${status === tab.key ? 'bg-white/25' : 'bg-neutral-500/10'}`}>{tabCount(tab.key)}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-labbaik-text-muted">
              <span className="sr-only sm:not-sr-only">ترتيب</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
                className="h-8 rounded-md border border-labbaik-border bg-labbaik-page px-2 text-xs font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer"
              >
                <option value="newest">الأحدث</option>
                <option value="oldest">الأقدم</option>
                <option value="lowest">الأقل تقييمًا</option>
                <option value="highest">الأعلى تقييمًا</option>
              </select>
            </label>
          </div>

          {ratingFilter !== null && (
            <button type="button" onClick={() => setRatingFilter(null)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-bold cursor-pointer">
              تقييمات {ratingFilter} نجوم فقط <span aria-hidden="true">✕</span><span className="sr-only">إزالة فلتر النجوم</span>
            </button>
          )}

          {loading ? (
            <ReviewSkeleton />
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-labbaik-border py-14 text-center">
              <Star size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
              <p className="mt-3 font-bold text-neutral-800 dark:text-neutral-100">
                {stats.total === 0 ? 'لا توجد تقييمات بعد.' : status === 'pending' ? 'لا توجد تقييمات بانتظار الرد.' : 'لا توجد تقييمات تطابق الفلتر.'}
              </p>
              {stats.total === 0 && <p className="mt-1 text-sm text-labbaik-text-muted">ستظهر تقييمات جوجل ماب هنا فور وصولها.</p>}
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((review) => {
                const active = activeId === review.id;
                const pending = review.status === 'pending';
                return (
                  <li key={review.id} className={`rounded-xl border bg-labbaik-surface transition-colors ${active ? 'border-labbaik-blue' : 'border-labbaik-border'}`}>
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CustomerAvatar name={review.reviewerName} seed={review.reviewerName} size={40} className="rounded-full" />
                          <div className="min-w-0">
                            <h3 className="font-bold text-neutral-900 dark:text-white truncate">{review.reviewerName}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Stars value={review.rating} size={13} />
                              <time dateTime={review.createdAt} title={toEnglishDigits(format(new Date(review.createdAt), 'dd MMMM yyyy', { locale: ar }))} className="text-xs text-labbaik-text-muted">
                                {relative(review.createdAt)}
                              </time>
                            </div>
                          </div>
                        </div>
                        {pending ? (
                          <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                            <Clock size={12} /> بانتظار الرد
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                            <CheckCircle2 size={12} /> تم الرد
                          </span>
                        )}
                      </div>

                      {review.comment
                        ? <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-100 whitespace-pre-line">{review.comment}</p>
                        : <p className="text-sm text-labbaik-text-muted">تقييم بالنجوم فقط، بدون تعليق.</p>}

                      {review.reply && !active && (
                        <div className="rounded-lg bg-labbaik-page px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-labbaik-blue dark:text-purple-300"><Store size={13} /> رد المتجر</p>
                          <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200 whitespace-pre-line">{review.reply}</p>
                        </div>
                      )}

                      {!active && (
                        <button
                          type="button"
                          onClick={() => openReply(review)}
                          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-bold transition-colors cursor-pointer ${pending ? 'bg-labbaik-blue text-labbaik-on-accent hover:bg-[#553174]' : 'text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10'}`}
                        >
                          {pending ? <><Send size={15} className="-scale-x-100" /> الرد على التقييم</> : <><Pencil size={14} /> تعديل الرد</>}
                        </button>
                      )}
                    </div>

                    {active && (
                      <div className="border-t border-labbaik-border bg-labbaik-page/60 p-4 space-y-3 rounded-b-xl">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor={`reply-${review.id}`} className="text-sm font-bold text-neutral-800 dark:text-neutral-100">ردك على {review.reviewerName}</label>
                          <button
                            type="button"
                            onClick={() => void getAiSuggestion(review)}
                            disabled={suggesting}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-labbaik-blue/30 text-xs font-bold text-labbaik-blue dark:text-purple-200 hover:bg-labbaik-blue/10 disabled:opacity-50 cursor-pointer"
                          >
                            {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {replyText.trim() ? 'اقتراح آخر من لبيك' : 'اقترح ردًا بلبيك'}
                          </button>
                        </div>
                        <textarea
                          id={`reply-${review.id}`}
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={4000}
                          placeholder="اكتب ردًا مهذبًا وشخصيًا، أو اطلب اقتراحًا من لبيك ثم عدّله."
                          className="w-full min-h-32 rounded-lg border border-labbaik-border bg-labbaik-surface p-3 text-sm leading-relaxed text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted resize-y"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-labbaik-text-muted tabular-nums">{replyText.length} / 4000</span>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={closeReply} className="h-9 px-3 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
                            <button
                              type="button"
                              onClick={() => void submitReply(review)}
                              disabled={submitting || !replyText.trim()}
                              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} className="-scale-x-100" />}
                              {pending ? 'إرسال الرد' : 'حفظ التعديل'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-0 rounded-xl border border-labbaik-border bg-labbaik-surface p-4 space-y-4" aria-label="ملخص التقييمات">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black tabular-nums text-neutral-900 dark:text-white">{stats.total ? stats.average.toFixed(1) : '—'}</span>
            <div>
              <Stars value={stats.average} size={16} />
              <p className="mt-1 text-xs text-labbaik-text-muted"><span className="tabular-nums">{stats.total}</span> تقييم</p>
            </div>
          </div>

          <div className="space-y-1">
            {stats.distribution.map(({ stars, count }) => {
              const share = stats.total ? (count / stats.total) * 100 : 0;
              const on = ratingFilter === stars;
              return (
                <button
                  type="button"
                  key={stars}
                  onClick={() => setRatingFilter(on ? null : stars)}
                  aria-pressed={on}
                  disabled={!count}
                  title={count ? `عرض تقييمات ${stars} نجوم فقط` : undefined}
                  className={`w-full flex items-center gap-2 h-7 px-1.5 rounded-md text-xs transition-colors disabled:cursor-default cursor-pointer ${on ? 'bg-amber-500/15' : 'enabled:hover:bg-labbaik-page'}`}
                >
                  <span className="w-3 font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{stars}</span>
                  <Star size={11} className="fill-amber-400 text-amber-400 shrink-0" />
                  <span className="flex-1 h-2 rounded-full bg-labbaik-page overflow-hidden">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${share}%` }} />
                  </span>
                  <span className="w-6 text-left tabular-nums text-labbaik-text-muted">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-labbaik-border pt-4 text-center">
            <button type="button" onClick={() => setStatus('pending')} className="rounded-lg bg-labbaik-page px-2 py-2.5 hover:bg-amber-500/10 cursor-pointer">
              <p className="text-xl font-black tabular-nums text-amber-700 dark:text-amber-300">{stats.pending}</p>
              <p className="text-xs text-labbaik-text-muted">بانتظار الرد</p>
            </button>
            <div className="rounded-lg bg-labbaik-page px-2 py-2.5">
              <p className="text-xl font-black tabular-nums text-neutral-900 dark:text-white">{stats.total ? Math.round((stats.replied / stats.total) * 100) : 0}%</p>
              <p className="text-xs text-labbaik-text-muted">نسبة الرد</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-labbaik-page animate-pulse" />
            <div className="space-y-2">
              <div className="h-3.5 w-32 rounded bg-labbaik-page animate-pulse" />
              <div className="h-3 w-24 rounded bg-labbaik-page animate-pulse" />
            </div>
            <div className="ms-auto h-6 w-20 rounded-md bg-labbaik-page animate-pulse" />
          </div>
          <div className="h-3 w-full rounded bg-labbaik-page animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-labbaik-page animate-pulse" />
        </li>
      ))}
    </ul>
  );
}
