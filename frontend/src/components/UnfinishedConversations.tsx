import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CheckCircle2, Loader2, LogOut, MessageSquareWarning, X } from 'lucide-react';
import api from '../api/client';
import { toEnglishDigits } from '@/lib/utils';
import type { UnfinishedConversation } from '../lib/unfinished';

const errorMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذر إغلاق المحادثة.';

/**
 * Lists the conversations a member still owes an answer. Opened when signing out (`onSignOut` set: signing out
 * waits until the list is empty) or from the home page.
 */
export default function UnfinishedConversationsDialog({ items, onChange, onClose, onSignOut }: {
  items: UnfinishedConversation[];
  onChange: (items: UnfinishedConversation[]) => void;
  onClose: () => void;
  onSignOut?: () => void;
}) {
  const navigate = useNavigate();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = (id: string) => {
    onClose();
    navigate(`/dashboard/conversations?c=${id}`);
  };

  const close = async (id: string) => {
    setClosingId(id);
    setError('');
    try {
      await api.patch(`/conversations/${id}/status`, { status: 'closed' });
      onChange(items.filter((item) => item.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClosingId(null);
    }
  };

  const done = items.length === 0;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} dir="rtl">
      <section role="dialog" aria-modal="true" aria-labelledby="unfinished-title" className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]">
        <header className="flex items-start gap-3 border-b border-labbaik-border px-5 py-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${done ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
            {done ? <CheckCircle2 size={20} /> : <MessageSquareWarning size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 ref={titleRef} tabIndex={-1} id="unfinished-title" className="text-lg font-black text-neutral-900 outline-none dark:text-white">
              {done ? 'لا توجد محادثات معلّقة عليك' : `${items.length === 1 ? 'محادثة تنتظر ردك' : `${toEnglishDigits(String(items.length))} محادثات تنتظر ردك`}`}
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-labbaik-text-muted">
              {done
                ? (onSignOut ? 'أغلقت كل محادثاتك، ويمكنك تسجيل الخروج الآن.' : 'كل محادثاتك مكتملة.')
                : 'هذه محادثات تتابعها أنت، رد فيها العميل ولم ترد عليه. لا يمكنك تسجيل الخروج حتى ترد عليها أو تغلقها.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={17} /></button>
        </header>

        {!done && (
          <ul className="min-h-0 flex-1 divide-y divide-labbaik-border overflow-y-auto custom-scrollbar">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{item.customerName || <span dir="ltr">{item.customerPhone}</span>}</p>
                  <p className="truncate text-xs text-labbaik-text-muted" dir="auto">{item.lastMessage || '—'}</p>
                  {item.lastMessageAt && (
                    <p className="text-[11px] text-labbaik-text-muted">{toEnglishDigits(formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true, locale: ar }))}</p>
                  )}
                </div>
                <button type="button" onClick={() => open(item.id)} className="h-8 shrink-0 rounded-md border border-labbaik-border px-2.5 text-xs font-bold text-neutral-800 hover:border-labbaik-blue/40 hover:text-labbaik-blue dark:text-neutral-100 cursor-pointer">فتح</button>
                <button type="button" onClick={() => void close(item.id)} disabled={closingId === item.id} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-labbaik-blue px-2.5 text-xs font-black text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-50 cursor-pointer">
                  {closingId === item.id && <Loader2 size={13} className="animate-spin" />} إغلاق
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="px-5 pt-3 text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}

        <footer className="flex justify-end gap-2 border-t border-labbaik-border px-5 py-3">
          {onSignOut && done ? (
            <button type="button" onClick={onSignOut} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700 cursor-pointer">
              <LogOut size={15} className="-scale-x-100" /> تسجيل الخروج
            </button>
          ) : (
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-bold text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">رجوع</button>
          )}
        </footer>
      </section>
    </div>
  );
}
