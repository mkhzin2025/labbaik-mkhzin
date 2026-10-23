import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page buttons: first, last, and a window around the current page; gaps become an ellipsis. */
export default function Pagination({ page, pageCount, onChange, label = 'الصفحات' }: { page: number; pageCount: number; onChange: (page: number) => void; label?: string }) {
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
  const cell = 'h-8 min-w-8 px-2 grid place-items-center rounded-md text-xs font-black tabular-nums transition-colors';
  return (
    <nav className="flex items-center gap-1" aria-label={label}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة" className={`${cell} border border-labbaik-border text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
        <ChevronRight size={15} />
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-labbaik-text-muted">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${cell} cursor-pointer ${p === page ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-blue/10'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية" className={`${cell} border border-labbaik-border text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
        <ChevronLeft size={15} />
      </button>
    </nav>
  );
}
