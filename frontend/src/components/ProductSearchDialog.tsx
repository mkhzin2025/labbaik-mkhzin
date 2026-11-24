import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, PackageSearch, Search, Store, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { storeChatApi } from '../lib/store-chat';
import type { ErpStore, Product, ProductPage, ProductUnit } from '../lib/store-chat';

const STORE_KEY = 'product_search_store';
const readStore = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; } };
const saveStore = (id: string) => { try { localStorage.setItem(STORE_KEY, id); } catch { /* storage unavailable */ } };

const money = (value: number) => `${formatNumber(Number(value || 0).toFixed(2))} ر.س`;
const unitLabel = (unit: ProductUnit) => (unit.equivalent > 1 && !/\d/.test(unit.unitName) ? `${unit.unitName} (${formatNumber(unit.equivalent)})` : unit.unitName);

function stockTone(qty: number) {
  if (qty <= 0) return { text: 'نفدت الكمية', cls: 'bg-red-500/12 text-red-700 dark:text-red-300' };
  if (qty < 10) return { text: `${formatNumber(qty)} متبقٍ`, cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' };
  return { text: `${formatNumber(qty)} متوفر`, cls: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300' };
}

/**
 * Product lookup in the Mkhzin inventory for one branch: name, SKU or barcode; store quantity and price with VAT.
 * It stays mounted while hidden, so reopening keeps the branch, the search and the page, and the page underneath
 * (an open conversation, a draft reply) is never touched.
 */
export default function ProductSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stores, setStores] = useState<ErpStore[] | null>(null);
  const [storesError, setStoresError] = useState(false);
  const [storeId, setStoreId] = useState(readStore);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductPage | null>(null);
  // The request each answer belongs to: loading = the current request has not answered yet.
  const [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
  const requestKey = `${storeId}|${debounced}|${page}`;
  const loading = Boolean(storeId) && settled?.key !== requestKey;
  const error = !loading && settled ? settled.error : '';
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Branches load the first time the dialog opens.
  useEffect(() => {
    if (!open || stores) return;
    storeChatApi.productStores()
      .then((list) => {
        setStores(list);
        setStoresError(false);
        // A remembered branch that no longer has items falls back to the first available one.
        setStoreId((current) => (list.some((s) => s.id === current) ? current : list[0]?.id ?? ''));
      })
      .catch(() => setStoresError(true));
  }, [open, stores]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(id); window.removeEventListener('keydown', onKey, true); };
  }, [open, onClose]);

  useEffect(() => {
    const id = window.setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!storeId) return;
    const controller = new AbortController();
    const key = `${storeId}|${debounced}|${page}`;
    storeChatApi.products(storeId, debounced, page, controller.signal)
      .then((result) => { setData(result); setSettled({ key, error: '' }); listRef.current?.scrollTo({ top: 0 }); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSettled({ key, error: (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذر البحث. حاول مرة أخرى.' });
      });
    return () => controller.abort();
  }, [storeId, debounced, page]);

  const chooseStore = (id: string) => {
    setStoreId(id);
    saveStore(id);
    setPage(1);
    inputRef.current?.focus();
  };

  const storeName = stores?.find((s) => s.id === storeId)?.name.trim();

  return createPortal(
    <div
      className={`fixed inset-0 z-[1200] items-start justify-center bg-neutral-950/50 p-3 pt-[6vh] sm:p-6 sm:pt-[8vh] ${open ? 'flex' : 'hidden'}`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      dir="rtl"
    >
      <section role="dialog" aria-modal="true" aria-labelledby="product-search-title" className="flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]">
        <header className="space-y-3 border-b border-labbaik-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300"><PackageSearch size={19} /></span>
            <div className="min-w-0 flex-1">
              <h2 id="product-search-title" className="font-black text-neutral-900 dark:text-white">البحث عن منتج</h2>
              <p className="text-xs text-labbaik-text-muted">الكمية والسعر في الفرع المختار · الأسعار شاملة ضريبة ١٥٪</p>
            </div>
            <button type="button" onClick={onClose} aria-label="إغلاق البحث" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={18} /></button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative sm:w-56 shrink-0">
              <span className="sr-only">الفرع</span>
              <Store size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
              <select
                value={storeId}
                onChange={(event) => chooseStore(event.target.value)}
                disabled={!stores}
                className="h-10 w-full appearance-none rounded-lg border border-labbaik-border bg-labbaik-page pe-8 ps-9 text-sm font-bold text-neutral-900 focus:border-labbaik-blue focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-60 dark:text-white cursor-pointer"
                style={{ paddingRight: '2.25rem', paddingLeft: '2rem' }}
              >
                <option value="" disabled>{stores ? 'اختر الفرع' : storesError ? 'تعذر تحميل الفروع' : 'جارٍ التحميل…'}</option>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name.trim()}</option>)}
              </select>
              <ChevronLeft size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 -rotate-90 text-labbaik-text-muted" />
            </label>
            <label className="relative flex-1">
              <span className="sr-only">ابحث بالاسم أو الباركود أو رقم الصنف</span>
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={!storeId}
                placeholder={storeId ? 'اسم المنتج، الباركود أو رقم الصنف' : 'اختر الفرع أولاً'}
                className="h-10 w-full rounded-lg border border-labbaik-border bg-labbaik-page pe-3 ps-9 text-sm text-neutral-900 placeholder:text-labbaik-text-muted focus:border-labbaik-blue focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-60 dark:text-white"
                style={{ paddingRight: '2.25rem' }}
              />
              {loading && <Loader2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-labbaik-text-muted" />}
            </label>
          </div>
        </header>

        <div ref={listRef} className={`min-h-[12rem] flex-1 overflow-y-auto bg-labbaik-page/60 px-4 py-3 custom-scrollbar sm:px-5 ${loading && data ? 'opacity-60' : ''}`}>
          {!storeId ? (
            <Empty title="اختر الفرع" text="تظهر الكميات والأسعار حسب الفرع الذي تختاره." />
          ) : error ? (
            <Empty title="تعذر البحث" text={error} tone="error" />
          ) : !data ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-labbaik-surface" />)}</div>
          ) : data.result.length === 0 ? (
            <Empty title="لا توجد نتائج" text={debounced ? `لا يوجد منتج يطابق «${debounced}» في ${storeName || 'هذا الفرع'}.` : 'لا توجد منتجات في هذا الفرع.'} />
          ) : (
            <>
              <p className="mb-2 px-1 text-xs font-bold text-labbaik-text-muted">
                {formatNumber(data.total)} منتج{storeName ? ` في ${storeName}` : ''}
              </p>
              <ul className="space-y-2">
                {data.result.map((product) => <ProductCard key={product.sku} product={product} />)}
              </ul>
            </>
          )}
        </div>

        {data && data.totalPages > 1 && !error && storeId && (
          <footer className="flex items-center justify-between gap-2 border-t border-labbaik-border px-4 py-2.5 sm:px-5">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="inline-flex h-8 items-center gap-1 rounded-md border border-labbaik-border px-2.5 text-xs font-bold text-neutral-800 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-40 dark:text-neutral-100 cursor-pointer">
              <ChevronRight size={15} /> السابق
            </button>
            <span className="text-xs font-bold text-labbaik-text-muted tabular-nums">صفحة {formatNumber(page)} من {formatNumber(data.totalPages)}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages || loading} className="inline-flex h-8 items-center gap-1 rounded-md border border-labbaik-border px-2.5 text-xs font-bold text-neutral-800 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-40 dark:text-neutral-100 cursor-pointer">
              التالي <ChevronLeft size={15} />
            </button>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}

function ProductCard({ product }: { product: Product }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const lines = [product.name, ...product.units.map((u) => `${unitLabel(u)}: ${money(u.price)}`)];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <li className="rounded-xl border border-labbaik-border bg-labbaik-surface p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-relaxed text-neutral-900 dark:text-white">{product.name}</p>
          <p className="mt-0.5 text-[11px] font-bold text-labbaik-text-muted">
            <span dir="ltr" className="tabular-nums">#{product.sku}</span>
            {product.categoryName && ` · ${product.categoryName}`}
          </p>
        </div>
        <button type="button" onClick={() => void copy()} title="نسخ الاسم والأسعار" aria-label="نسخ الاسم والأسعار" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-blue cursor-pointer">
          {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        </button>
      </div>

      {product.units.length > 0 ? (
        <div className="mt-2.5 divide-y divide-labbaik-border overflow-hidden rounded-lg border border-labbaik-border">
          {product.units.map((unit) => {
            const stock = stockTone(unit.qty);
            return (
              <div key={unit.productId} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate py-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">{unitLabel(unit)}</span>
                <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-bold tabular-nums ${stock.cls}`}>{stock.text}</span>
                <span className="w-24 shrink-0 text-left text-sm font-black text-labbaik-blue tabular-nums dark:text-purple-300">{money(unit.price)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-labbaik-text-muted">لا توجد وحدات لهذا المنتج في هذا الفرع.</p>
      )}
    </li>
  );
}

function Empty({ title, text, tone }: { title: string; text: string; tone?: 'error' }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-12 text-center">
      <PackageSearch size={30} className={tone === 'error' ? 'text-red-500' : 'text-labbaik-text-muted'} />
      <p className={`text-sm font-black ${tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-neutral-900 dark:text-white'}`}>{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-labbaik-text-muted">{text}</p>
    </div>
  );
}
