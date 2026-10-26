import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Megaphone, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import Pagination from '../ui/Pagination';
import { AudienceChips, CampaignStatusBadge, type Campaign } from './campaignShared';
import { dateTime, isActive, num, pct } from './campaignFormat';

const PAGE_SIZE = 15;

export default function CampaignsList({ templateId, onClearTemplate }: { templateId?: string; onClearTemplate?: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [status, templateId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (quiet = false) => {
      const id = ++request.current;
      if (!quiet) setLoading(true);
      try {
        const { data } = await api.get('/integrations/meta/whatsapp/campaigns', {
          params: { page, limit: PAGE_SIZE, status: status || undefined, search: query || undefined, templateId: templateId || undefined },
        });
        if (id !== request.current) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setFailed(false);
        // Keep progress fresh while any listed campaign is still sending.
        if ((data.items || []).some((c: Campaign) => isActive(c.status))) timer = setTimeout(() => void load(true), 5000);
      } catch {
        if (id === request.current) setFailed(true);
      } finally {
        if (id === request.current) setLoading(false);
      }
    };
    void load();
    return () => { if (timer) clearTimeout(timer); };
  }, [page, status, query, templateId]);

  return (
    <section className="rounded-xl border border-labbaik-border bg-labbaik-surface">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-labbaik-border">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الحملة أو القالب..." aria-label="بحث في الحملات"
            className="w-full h-9 rounded-lg border border-labbaik-border bg-labbaik-page pr-9 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 placeholder:text-labbaik-text-muted" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="حالة الحملة" className="h-9 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer">
          <option value="">كل الحالات</option>
          <option value="scheduled">مجدولة</option>
          <option value="sending">جارٍ الإرسال</option>
          <option value="completed">اكتملت</option>
          <option value="failed">توقفت</option>
          <option value="cancelled">أُلغيت</option>
        </select>
        {templateId && onClearTemplate && (
          <button type="button" onClick={onClearTemplate} className="h-9 px-3 rounded-lg bg-labbaik-blue/10 text-xs font-bold text-labbaik-blue dark:text-purple-300 cursor-pointer">قالب واحد فقط ✕</button>
        )}
      </div>

      {loading && !items.length ? (
        <div className="py-16 grid place-items-center"><Loader2 size={22} className="animate-spin text-labbaik-blue" /></div>
      ) : failed ? (
        <p className="py-16 text-center text-sm text-labbaik-text-muted">تعذر تحميل الحملات.</p>
      ) : !items.length ? (
        <div className="py-16 text-center">
          <Megaphone size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
          <p className="mt-2 text-sm font-bold text-labbaik-text-muted">{query || status ? 'لا توجد حملات تطابق البحث.' : 'لم تُرسل أي حملة بعد. كل إرسال جماعي يُحفظ هنا بتفاصيله.'}</p>
        </div>
      ) : (
        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-xs text-labbaik-text-muted">
              <tr className="border-b border-labbaik-border">
                <th className="text-right font-bold px-4 py-2.5">الحملة</th>
                <th className="text-right font-bold px-2">الجمهور</th>
                <th className="text-right font-bold px-2">المستلمون</th>
                <th className="text-right font-bold px-2">وصلت</th>
                <th className="text-right font-bold px-2">قُرئت</th>
                <th className="text-right font-bold px-2">ردّوا</th>
                <th className="text-right font-bold px-2">الحالة</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const progress = c.stats.total ? (c.stats.total - c.stats.pending) / c.stats.total : 0;
                return (
                  <tr key={c.id} onClick={() => navigate(`/dashboard/whatsapp-campaigns/${c.id}`)} className="group border-b border-labbaik-border last:border-b-0 hover:bg-labbaik-page cursor-pointer">
                    <td className="px-4 py-3 align-top">
                      <Link to={`/dashboard/whatsapp-campaigns/${c.id}`} onClick={(e) => e.stopPropagation()} className="block font-bold text-neutral-900 dark:text-white hover:text-labbaik-blue truncate max-w-64">{c.name}</Link>
                      <span className="block text-xs text-labbaik-text-muted"><span dir="ltr">{c.templateName}</span> · {dateTime(c.createdAt)}</span>
                    </td>
                    <td className="px-2 py-3 align-top max-w-72"><AudienceChips audience={c.audience} compact /></td>
                    <td className="px-2 py-3 align-top tabular-nums font-bold text-neutral-900 dark:text-white">{num(c.stats.total)}</td>
                    <td className="px-2 py-3 align-top tabular-nums">{pct(c.stats.delivered, c.stats.accepted)}</td>
                    <td className="px-2 py-3 align-top tabular-nums">{pct(c.stats.read, c.stats.delivered)}</td>
                    <td className="px-2 py-3 align-top tabular-nums">{pct(c.stats.replied, c.stats.delivered)}</td>
                    <td className="px-2 py-3 align-top">
                      <CampaignStatusBadge status={c.status} />
                      {isActive(c.status) && (
                        <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-labbaik-page overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <span className="block h-full bg-[var(--viz-1)]" style={{ width: `${progress * 100}%` }} />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 align-top text-labbaik-text-muted group-hover:text-labbaik-blue"><ChevronLeft size={16} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-labbaik-border">
        <span className="text-xs text-labbaik-text-muted tabular-nums">{num(total)} حملة</span>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} onChange={setPage} label="صفحات الحملات" />
      </div>
    </section>
  );
}
