import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Building2, Check, FolderOpen, Loader2, Search, X } from 'lucide-react';
import api from '../../api/client';

type Branch = { id: string; name: string };
type Category = { id: string; name: string; isActive: boolean; scope?: string };

type PlanItem = { customerId: string; storeId: string; merge: boolean };
type BranchRow = { storeId: string; name: string; total: number; move: number; merge: number; byMenu: number; byName: number; byOffers: number };
type Plan = { sourceCustomers: number; withConversation: number; transfer: number; staying: number; perBranch: BranchRow[]; items: PlanItem[] };
type Outcome = { moved: number; merged: number; skipped: number; failed: number; linked: number | null };

interface Props {
  branches: Branch[];
  onClose: () => void;
  /** Called after customers were moved, so the page reloads its list. */
  onDistributed: () => void;
}

const BATCH = 25;
const DEFAULT_CATEGORY = 'tael-bot';
const n = (value: number) => value.toLocaleString('en');

/** Moves customers of a branch (usually the main one) to the branch they picked in the WhatsApp bot. */
export default function BranchDistributionDialog({ branches, onClose, onDistributed }: Props) {
  const mainBranch = branches.find((branch) => branch.name.includes('رئيسي'));
  const [sourceId, setSourceId] = useState(mainBranch?.id || branches[0]?.id || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  // Only organization-wide categories survive a change of branch.
  useEffect(() => {
    void api.get('/customers/taxonomy').then(({ data }) => {
      const list: Category[] = (data?.categories || []).filter((item: Category) => item.isActive && (!item.scope || item.scope === 'organization'));
      setCategories(list);
      setCategoryId(list.find((item) => item.name.trim() === DEFAULT_CATEGORY)?.id || '');
    }).catch(() => setCategories([]));
  }, []);

  useEffect(() => { setPlan(null); setOutcome(null); setError(''); }, [sourceId]);

  const preview = async () => {
    setLoading(true); setError(''); setOutcome(null);
    try {
      const { data } = await api.get<Plan>('/conversations/branch-distribution/preview', { params: { sourceStoreId: sourceId } });
      setPlan(data);
    } catch {
      setError('تعذر تحميل المعاينة. حاول مرة أخرى.');
    } finally { setLoading(false); }
  };

  const apply = async () => {
    if (!plan) return;
    setRunning(true); setDone(0); setError('');
    const total: Outcome = { moved: 0, merged: 0, skipped: 0, failed: 0, linked: null };
    try {
      for (let offset = 0; offset < plan.items.length; offset += BATCH) {
        const items = plan.items.slice(offset, offset + BATCH).map(({ customerId, storeId }) => ({ customerId, storeId }));
        const { data } = await api.post('/conversations/branch-distribution/apply', { sourceStoreId: sourceId, items, categoryId: categoryId || undefined });
        total.moved += data.moved; total.merged += data.merged; total.skipped += data.skipped; total.failed += data.failed;
        setDone(offset + items.length);
      }
      if (categoryId) {
        const { data } = await api.post('/conversations/branch-distribution/link-category', { sourceStoreId: sourceId, categoryId });
        total.linked = data.newlyLinked;
      }
      setOutcome(total);
      onDistributed();
    } catch {
      setOutcome(total);
      setError('توقف التوزيع قبل أن يكتمل. ما تم نقله محفوظ؛ أعد المعاينة ثم التوزيع لإكمال الباقي.');
      onDistributed();
    } finally { setRunning(false); }
  };

  const progress = plan?.items.length ? Math.round((done / plan.items.length) * 100) : 0;
  const categoryName = categories.find((item) => item.id === categoryId)?.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="distribution-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]" dir="rtl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-labbaik-border bg-labbaik-surface px-5 py-4 sm:px-6">
          <div>
            <h2 ref={titleRef} tabIndex={-1} id="distribution-title" className="text-xl font-black text-neutral-900 outline-none dark:text-white">توزيع العملاء على الفروع</h2>
            <p className="mt-1 text-sm text-labbaik-text-muted">ينقل كل عميل إلى الفرع الذي اختاره في بوت واتساب، مع محادثاته.</p>
          </div>
          <button type="button" onClick={onClose} disabled={running} aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted transition-colors hover:bg-labbaik-page hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:hover:text-white"><X size={19} /></button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Building2 size={16} className="text-labbaik-blue" /> سحب العملاء من</span>
              <select value={sourceId} disabled={running || loading} onChange={(e) => setSourceId(e.target.value)} className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 disabled:opacity-50 dark:text-white">
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><FolderOpen size={16} className="text-labbaik-blue" /> ربطهم بفئة <span className="font-medium text-labbaik-text-muted">(اختياري)</span></span>
              <select value={categoryId} disabled={running} onChange={(e) => setCategoryId(e.target.value)} className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 disabled:opacity-50 dark:text-white">
                <option value="">بدون فئة</option>
                {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-xl bg-labbaik-page p-4 text-xs leading-6 text-labbaik-text-muted">
            يُحدَّد الفرع من آخر اختيار للعميل في البوت: «فرع X» من القائمة، أو اسم الفرع وحده، أو «عروض تبوك / القصيم / حفر الباطن». ذكر مدينة داخل كلام عادي لا يُحسب.
            إذا كان للعميل سجل في الفرع الهدف يُدمج معه بدون تكرار. {categoryName ? <>تُضاف فئة <b className="text-neutral-800 dark:text-neutral-100">{categoryName}</b> للمنقولين ولمن يبقى من عملاء واتساب.</> : null}
          </div>

          {!plan && !outcome && (
            <button type="button" onClick={() => void preview()} disabled={!sourceId || loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-labbaik-blue/25 bg-labbaik-surface px-4 text-sm font-black text-labbaik-blue transition-colors hover:border-labbaik-blue hover:bg-labbaik-blue/5 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {loading ? 'جاري قراءة المحادثات...' : 'معاينة التوزيع'}
            </button>
          )}

          {plan && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['عملاء الفرع', plan.sourceCustomers],
                  ['لهم محادثة واتساب', plan.withConversation],
                  ['سيُنقلون', plan.transfer],
                  ['يبقون (لم يختاروا فرعاً)', plan.staying],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-labbaik-border p-3">
                    <p className="text-[11px] font-bold text-labbaik-text-muted">{label}</p>
                    <p className="mt-1 tabular-nums text-lg font-black text-neutral-900 dark:text-white">{n(value as number)}</p>
                  </div>
                ))}
              </div>

              {plan.perBranch.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-labbaik-border">
                  <table className="w-full text-sm">
                    <thead className="bg-labbaik-page text-xs text-labbaik-text-muted">
                      <tr>
                        <th className="px-3 py-2 text-right font-bold">الفرع</th>
                        <th className="px-3 py-2 text-right font-bold">المجموع</th>
                        <th className="px-3 py-2 text-right font-bold" title="ليس لهم سجل في الفرع">جديد</th>
                        <th className="px-3 py-2 text-right font-bold" title="لهم سجل في الفرع وسيُدمجون معه">دمج</th>
                        <th className="px-3 py-2 text-right font-bold">من القائمة / الاسم / العروض</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.perBranch.map((row) => (
                        <tr key={row.storeId} className="border-t border-labbaik-border">
                          <td className="px-3 py-2 font-black text-neutral-900 dark:text-white">{row.name}</td>
                          <td className="px-3 py-2 tabular-nums font-bold">{n(row.total)}</td>
                          <td className="px-3 py-2 tabular-nums">{n(row.move)}</td>
                          <td className="px-3 py-2 tabular-nums">{n(row.merge)}</td>
                          <td className="px-3 py-2 tabular-nums text-labbaik-text-muted">{n(row.byMenu)} / {n(row.byName)} / {n(row.byOffers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl bg-labbaik-page p-4 text-center text-sm font-bold text-labbaik-text-muted">لا يوجد عملاء اختاروا فرعاً. لا شيء لنقله.</p>
              )}
            </div>
          )}

          {running && (
            <div className="space-y-3 rounded-xl bg-labbaik-blue/5 p-4" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2"><Loader2 size={17} className="animate-spin text-labbaik-blue" /><span className="text-sm font-black text-neutral-900 dark:text-white">جاري نقل العملاء</span></div>
                <b className="tabular-nums text-sm text-labbaik-blue">{progress}%</b>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-labbaik-blue/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="تقدم التوزيع">
                <div className="h-full rounded-full bg-labbaik-blue transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-labbaik-text-muted"><span className="tabular-nums font-bold">{n(done)}</span> من <span className="tabular-nums font-bold">{n(plan?.items.length || 0)}</span> عميل. لا تغلق الصفحة.</p>
            </div>
          )}

          {outcome && (
            <div className="space-y-1 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200" role="status">
              <p className="flex items-center gap-2 font-black"><Check size={17} /> تم التوزيع</p>
              <p>نُقل <b className="tabular-nums">{n(outcome.moved)}</b> عميل جديد على فرعه، ودُمج <b className="tabular-nums">{n(outcome.merged)}</b> مع سجلاتهم في فروعهم.</p>
              {outcome.skipped > 0 && <p>تم تخطي <b className="tabular-nums">{n(outcome.skipped)}</b> (نُقلوا مسبقاً أو لم يعودوا في الفرع).</p>}
              {outcome.failed > 0 && <p className="text-red-700 dark:text-red-300">تعذر نقل <b className="tabular-nums">{n(outcome.failed)}</b>. أعد المعاينة والتوزيع لمحاولة نقلهم مجدداً.</p>}
              {outcome.linked !== null && <p>رُبط <b className="tabular-nums">{n(outcome.linked)}</b> عميل جديد بفئة {categoryName}.</p>}
            </div>
          )}

          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950/20 dark:text-red-300"><AlertTriangle size={17} className="mt-0.5 shrink-0" /> {error}</p>}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-labbaik-border bg-labbaik-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {outcome ? (
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-6 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30"><Check size={17} /> عرض قائمة العملاء</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={running} className="h-10 rounded-lg border border-labbaik-border px-5 text-sm font-black text-neutral-700 transition-colors hover:bg-labbaik-page focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:text-neutral-200">إلغاء</button>
              <button type="button" onClick={() => void apply()} disabled={!plan || running || (!plan.transfer && !categoryId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-5 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">
                {running ? <Loader2 size={17} className="animate-spin" /> : <ArrowLeftRight size={17} />}
                {running ? 'جاري التوزيع...' : plan?.transfer ? `توزيع ${n(plan.transfer)} عميل` : 'ربط الفئة فقط'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
