import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  CalendarClock,
  CheckCheck,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  RotateCcw,
  Search,
  Store,
  Undo2,
} from 'lucide-react';
import CustomerAvatar from '../components/CustomerAvatar';
import Composer from '../components/conversations/Composer';
import { ReturnDetailsDialog, ShipmentDetailsDialog } from '../components/store-chat/StoreDetailsDialogs';
import { useToast } from '../components/Toast';
import { formatNumber, phoneMatches } from '@/lib/utils';
import {
  chatState,
  customerName,
  errorMessage,
  formatWait,
  fulfillmentStage,
  RETURN_STATUS_CLS,
  SHIPMENT_STATUS,
  readSavedBranch,
  saveBranch,
  scheduleInfo,
  STORE_CHAT_CHANGED,
  storeChatApi,
} from '../lib/store-chat';
import type { ChatState, ReturnsPage, Paged, StoreBranch, StoreChatCustomer, StoreChatMessage, StoreReturn, StoreShipment } from '../lib/store-chat';

const LIST_REFRESH_MS = 20_000;

type ListFilter = 'all' | ChatState;
const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'unread', label: 'غير مقروءة' },
  { id: 'needsReply', label: 'تحتاج رداً' },
  { id: 'replied', label: 'تم الرد' },
];
const THREAD_REFRESH_MS = 10_000;

const safeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, pattern, { locale: ar });
};

const listTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (isToday(date)) return safeDate(value, 'HH:mm');
  if (isYesterday(date)) return 'أمس';
  return safeDate(value, 'dd/MM');
};

const dayLabel = (value: string) => {
  const date = new Date(value);
  if (isToday(date)) return 'اليوم';
  if (isYesterday(date)) return 'أمس';
  return safeDate(value, 'd MMMM yyyy');
};

const money = (value: number) => `${formatNumber(Number(value || 0).toFixed(2))} ر.س`;

/** Visible only while the document is, so a background tab does not keep polling the store. */
function usePolling(callback: () => void, ms: number, enabled = true) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') saved.current(); }, ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

const chip = 'inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-bold whitespace-nowrap';
const clickableCard = 'w-full text-right rounded-xl border border-labbaik-border bg-labbaik-surface p-3 space-y-2 transition-colors cursor-pointer hover:border-labbaik-blue/40 hover:bg-labbaik-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-labbaik-blue/40';

/** Enter/Space open a card that is a div (it holds its own buttons, so it cannot be a <button>). */
const activateOnKey = (open: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
};
const outlineButton = 'h-9 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 cursor-pointer';

export default function StoreChatsPage() {
  const { showToast } = useToast();

  // ── Branches (each is its own store server) ─────────────────────────────
  const [branches, setBranches] = useState<StoreBranch[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branchUnread, setBranchUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    storeChatApi.status()
      .then(({ branches: list }) => {
        setBranches(list);
        const saved = readSavedBranch();
        setBranch(list.some((b) => b.key === saved) ? saved : list[0]?.key ?? null);
      })
      .catch(() => setBranches([]));
  }, []);

  // Unread badges for every branch, so a message in another branch is not missed.
  const loadBranchUnread = useCallback(async () => {
    if (!branches?.length) return;
    const counts = await Promise.all(branches.map((b) => storeChatApi.unreadTotal(b.key).then((n) => [b.key, n] as const).catch(() => [b.key, -1] as const)));
    setBranchUnread(Object.fromEntries(counts.filter(([, n]) => n >= 0)));
  }, [branches]);
  useEffect(() => { void loadBranchUnread(); }, [loadBranchUnread]);
  usePolling(() => void loadBranchUnread(), LIST_REFRESH_MS, Boolean(branches?.length));

  const switchBranch = (key: string) => {
    if (key === branch) return;
    saveBranch(key);
    setBranch(key);
    setSelectedId(null);
    setCustomers(null);
    setListError(false);
  };

  // ── Customers list ──────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<StoreChatCustomer[] | null>(null);
  const [listError, setListError] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  // Clock for the "waiting since" badges; advances with every list refresh.
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const branchRef = useRef(branch);
  useEffect(() => { branchRef.current = branch; }, [branch]);

  const loadCustomers = useCallback(async () => {
    if (!branch) return;
    const requested = branch;
    try {
      const [list, total] = await Promise.all([storeChatApi.customers(requested), storeChatApi.unreadTotal(requested)]);
      if (requested !== branchRef.current) return; // the user switched branch meanwhile
      setCustomers(list);
      setNow(Date.now());
      setUnreadTotal(total);
      setBranchUnread((counts) => ({ ...counts, [requested]: total }));
      setListError(false);
      window.dispatchEvent(new Event(STORE_CHAT_CHANGED));
    } catch {
      if (requested === branchRef.current) setListError(true);
    }
  }, [branch]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);
  usePolling(() => void loadCustomers(), LIST_REFRESH_MS, Boolean(branch));

  const visibleCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customers || []).filter((c) => {
      if (filter !== 'all' && chatState(c) !== filter) return false;
      if (!q) return true;
      return customerName(c).toLowerCase().includes(q) || phoneMatches(c.customer?.phone, q);
    });
  }, [customers, search, filter]);

  const stateCounts = useMemo(() => {
    const counts: Record<ChatState, number> = { unread: 0, needsReply: 0, replied: 0 };
    for (const c of customers || []) counts[chatState(c)] += 1;
    return counts;
  }, [customers]);

  const selected = useMemo(() => customers?.find((c) => c.customerId === selectedId) || null, [customers, selectedId]);

  // ── Thread ──────────────────────────────────────────────────────────────
  // Kept oldest → newest; the API pages newest first.
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const scrollToBottom = () => requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const openThread = useCallback(async (customerId: string) => {
    if (!branch) return;
    setThreadLoading(true);
    setThreadError(false);
    setMessages([]);
    setCursor(null);
    try {
      const page = await storeChatApi.messages(branch, customerId);
      setMessages([...page.messages].reverse());
      setCursor(page.nextCursor);
      stickToBottom.current = true;
      scrollToBottom();
      // Opening a thread marks the customer's messages read on the store
      setCustomers((list) => list?.map((c) => (c.customerId === customerId ? { ...c, unreadCount: 0, hasUnread: false } : c)) || list);
      void storeChatApi.unreadTotal(branch).then((n) => {
        setUnreadTotal(n);
        setBranchUnread((counts) => ({ ...counts, [branch]: n }));
      }).catch(() => {});
    } catch {
      setThreadError(true);
    } finally {
      setThreadLoading(false);
    }
  }, [branch]);

  useEffect(() => { if (selectedId) void openThread(selectedId); }, [selectedId, openThread]);

  // Pick up new messages: refetch the newest page and merge by id.
  const refreshThread = useCallback(async () => {
    if (!selectedId || !branch) return;
    try {
      const page = await storeChatApi.messages(branch, selectedId);
      setMessages((current) => {
        const known = new Set(current.map((m) => m.id));
        const fresh = [...page.messages].reverse().filter((m) => !known.has(m.id));
        if (!fresh.length) return current;
        if (stickToBottom.current) scrollToBottom();
        return [...current, ...fresh];
      });
    } catch { /* the next tick retries */ }
  }, [selectedId, branch]);
  usePolling(() => void refreshThread(), THREAD_REFRESH_MS, Boolean(selectedId));

  const loadOlder = async () => {
    if (!selectedId || !branch || !cursor || loadingOlder) return;
    const el = scrollRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const page = await storeChatApi.messages(branch, selectedId, cursor);
      setMessages((current) => {
        const known = new Set(current.map((m) => m.id));
        return [...[...page.messages].reverse().filter((m) => !known.has(m.id)), ...current];
      });
      setCursor(page.nextCursor);
      // Keep the reader where they were instead of jumping to the top
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - previousHeight; });
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل الرسائل الأقدم'), 'error');
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (text: string) => {
    if (!selectedId || !branch) return;
    try {
      const created = await storeChatApi.send(branch, selectedId, text);
      if (created?.id) {
        setMessages((current) => (current.some((m) => m.id === created.id) ? current : [...current, created]));
      }
      // The team answered last → "تم الرد" right away, before the next list refresh
      const sentAt = created?.createdAt || new Date().toISOString();
      setCustomers((list) => list?.map((c) => (c.customerId === selectedId
        ? { ...c, unreadCount: 0, hasUnread: false, lastMessageAt: sentAt, lastMessage: { senderType: 'EMPLOYEE', content: text.slice(0, 120), createdAt: sentAt, senderName: null } }
        : c)) || list);
      stickToBottom.current = true;
      scrollToBottom();
      void refreshThread();
      void loadCustomers();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إرسال الرسالة'), 'error');
      throw error; // keeps the text in the composer
    }
  };

  // ── Customer panel (orders / returns) ───────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<'orders' | 'returns'>('orders');

  const realMessages = messages.filter((m) => !m.isVirtual || m.content);

  return (
    <div className="h-full min-h-0 flex bg-labbaik-surface" dir="rtl">
      {/* ── Customers ─────────────────────────────────────────────────── */}
      <aside className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 xl:w-[340px] shrink-0 flex-col border-l border-labbaik-border min-h-0`}>
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-labbaik-border">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-black text-neutral-900 dark:text-white">
              <Store size={18} className="text-labbaik-blue dark:text-purple-300" /> محادثات المتجر
            </h2>
            {unreadTotal > 0 && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-labbaik-blue text-labbaik-on-accent tabular-nums">{formatNumber(unreadTotal)} جديدة</span>
            )}
          </div>
          {branches && branches.length > 1 && (
            <div className="flex gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="tablist" aria-label="الفرع">
              {branches.map((b) => {
                const active = b.key === branch;
                const count = branchUnread[b.key] ?? 0;
                return (
                  <button
                    key={b.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchBranch(b.key)}
                    className={`flex-1 min-w-0 h-8 px-2 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-black transition-colors cursor-pointer ${active ? 'bg-labbaik-blue text-labbaik-on-accent shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
                  >
                    <span className="truncate">{b.label}</span>
                    {count > 0 && (
                      <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-black leading-4 tabular-nums ${active ? 'bg-white/25 text-white' : 'bg-labbaik-blue text-labbaik-on-accent'}`}>{count > 99 ? '99+' : count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الجوال"
              aria-label="بحث في محادثات المتجر"
              className="w-full h-10 bg-labbaik-page border border-labbaik-border rounded-lg pr-10 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue transition-colors font-medium placeholder:text-labbaik-text-muted"
            />
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="tablist" aria-label="تصفية المحادثات">
            {LIST_FILTERS.map((option) => {
              const active = filter === option.id;
              const count = option.id === 'all' ? null : stateCounts[option.id];
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(option.id)}
                  className={`h-9 px-1 flex flex-col items-center justify-center rounded-md text-[11px] leading-tight font-black transition-colors cursor-pointer ${active ? 'bg-labbaik-surface text-labbaik-blue dark:text-white shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
                >
                  <span className="truncate max-w-full">{option.label}</span>
                  {count !== null && (
                    <span className={`tabular-nums text-[10px] ${count > 0 && option.id === 'unread' ? 'text-labbaik-blue dark:text-purple-300' : count > 0 && option.id === 'needsReply' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{formatNumber(count)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {customers === null && !listError ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-labbaik-border">
                <div className="h-11 w-11 rounded-full bg-labbaik-page animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-labbaik-page animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-labbaik-page animate-pulse" />
                </div>
              </div>
            ))
          ) : listError && !customers ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">تعذر تحميل محادثات المتجر</p>
              <button type="button" onClick={() => void loadCustomers()} className={outlineButton}>إعادة المحاولة</button>
            </div>
          ) : !visibleCustomers.length ? (
            <div className="p-8 flex flex-col items-center text-center gap-2 text-labbaik-text-muted">
              <Inbox size={32} />
              <p className="text-sm font-bold">{search || filter !== 'all' ? 'لا توجد نتائج' : 'لا توجد محادثات حالياً'}</p>
              <p className="text-xs">محادثات المتجر تبقى 3 أيام ثم تُحذف تلقائياً.</p>
            </div>
          ) : (
            visibleCustomers.map((c) => {
              const active = c.customerId === selectedId;
              const name = customerName(c);
              const state = chatState(c);
              const unread = state === 'unread';
              const last = c.lastMessage;
              const preview = last
                ? `${last.senderType === 'EMPLOYEE' ? `${last.senderName || 'الفريق'}: ` : ''}${last.content}`
                : c.customer?.phone || '—';
              return (
                <button
                  key={c.customerId}
                  type="button"
                  onClick={() => setSelectedId(c.customerId)}
                  aria-current={active ? 'true' : undefined}
                  title={c.customer?.phone || undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors border-b border-labbaik-border cursor-pointer ${active ? 'bg-labbaik-blue/12 dark:bg-labbaik-blue/25' : unread ? 'bg-labbaik-blue/5 dark:bg-labbaik-blue/10 hover:bg-labbaik-blue/10' : 'hover:bg-labbaik-page'}`}
                >
                  <CustomerAvatar name={name} seed={c.customer?.phone || c.customerId} size={44} className="rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-sm truncate ${unread ? 'font-black text-neutral-900 dark:text-white' : 'font-bold text-neutral-800 dark:text-neutral-100'}`}>{name}</h4>
                      <time className={`text-[11px] shrink-0 tabular-nums ${unread ? 'text-labbaik-blue dark:text-purple-300 font-black' : 'text-labbaik-text-muted font-bold'}`}>{listTime(c.lastMessageAt)}</time>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-xs truncate flex items-center gap-1 ${unread ? 'text-neutral-800 dark:text-neutral-100 font-bold' : 'text-labbaik-text-muted font-medium'}`}>
                        {state === 'replied' && last && <CheckCheck size={14} className="shrink-0" />}
                        <span className="truncate" dir={last ? 'auto' : 'ltr'}>{preview}</span>
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {state === 'needsReply' && (
                          <span title={`العميل ينتظر الرد منذ ${formatWait(last?.createdAt, now)}`} className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-black tabular-nums">
                            <Clock size={11} /> بانتظار الرد · {formatWait(last?.createdAt, now)}
                          </span>
                        )}
                        {state === 'replied' && last && (
                          <span className="h-5 px-1.5 rounded-md bg-labbaik-page text-[11px] font-bold leading-5 text-labbaik-text-muted">تم الرد</span>
                        )}
                        {unread && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-labbaik-blue text-labbaik-on-accent text-[11px] font-black flex items-center justify-center tabular-nums">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Thread ────────────────────────────────────────────────────── */}
      <section className={`${selectedId ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col min-h-0 bg-labbaik-chat`}>
        {!selected ? (
          <div className="flex-1 grid place-items-center p-8 text-center">
            <div className="space-y-3 text-labbaik-text-muted">
              <MessageCircle size={44} className="mx-auto text-labbaik-blue/40" />
              <p className="text-base font-black text-neutral-800 dark:text-neutral-100">اختر محادثة</p>
              <p className="text-sm">اختر عميلاً من القائمة لعرض رسائله وطلباته ومرتجعاته.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-16 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 border-b border-labbaik-border bg-labbaik-surface">
              <div className="flex items-center gap-3 min-w-0">
                <button type="button" onClick={() => setSelectedId(null)} className="lg:hidden grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-labbaik-blue cursor-pointer" aria-label="رجوع للقائمة">
                  <ChevronRight size={20} />
                </button>
                <CustomerAvatar name={customerName(selected)} seed={selected.customer?.phone || selected.customerId} size={40} className="rounded-full" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-neutral-900 dark:text-white truncate">{customerName(selected)}</p>
                  {selected.customer?.phone && <p className="text-xs text-labbaik-text-muted tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{selected.customer.phone}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                aria-expanded={panelOpen}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-labbaik-border text-xs font-black text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 cursor-pointer"
              >
                {panelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                <span className="hidden sm:inline">الطلبات والمرتجعات</span>
              </button>
            </div>

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4 space-y-2"
            >
              {threadLoading ? (
                <div className="h-full grid place-items-center"><Loader2 size={26} className="animate-spin text-labbaik-blue" /></div>
              ) : threadError ? (
                <div className="h-full grid place-items-center text-center space-y-3">
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">تعذر تحميل الرسائل</p>
                    <button type="button" onClick={() => selectedId && void openThread(selectedId)} className={outlineButton}>إعادة المحاولة</button>
                  </div>
                </div>
              ) : (
                <>
                  {cursor && (
                    <div className="flex justify-center pb-2">
                      <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-labbaik-border bg-labbaik-surface text-xs font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 disabled:opacity-60 cursor-pointer">
                        {loadingOlder ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} الرسائل الأقدم
                      </button>
                    </div>
                  )}
                  {!realMessages.length && <p className="text-center text-sm text-labbaik-text-muted py-10">لا توجد رسائل في هذه المحادثة.</p>}
                  {realMessages.map((msg, idx) => {
                    const mine = msg.senderType === 'EMPLOYEE';
                    const previous = realMessages[idx - 1];
                    const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                    return (
                      <Fragment key={msg.id}>
                        {newDay && (
                          <div className="sticky top-0 z-10 flex justify-center py-1 pointer-events-none">
                            <span className="rounded-lg bg-labbaik-surface/95 px-3 py-1 text-[11px] font-bold text-labbaik-text-muted shadow-[0_1px_2px_rgba(15,10,30,0.08)]">{dayLabel(msg.createdAt)}</span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] lg:max-w-[65%] px-3.5 py-2.5 rounded-2xl ${mine ? 'bg-labbaik-blue text-labbaik-on-accent rounded-tl-sm' : 'bg-labbaik-surface text-neutral-900 dark:text-white rounded-tr-sm'}`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">{msg.content}</p>
                            <div className={`flex items-center gap-2 mt-1 ${mine ? 'justify-end text-white/80' : 'justify-start text-labbaik-text-muted'}`}>
                              {mine && msg.senderDisplayName && (
                                <span className="text-[11px] font-bold truncate max-w-32" title={msg.senderName ? 'أُرسلت من تيل بوت' : 'أُرسلت من لوحة المتجر'}>{msg.senderDisplayName}</span>
                              )}
                              <span className="text-[11px] font-bold tabular-nums">{safeDate(msg.createdAt, 'HH:mm')}</span>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </>
              )}
            </div>

            <div className="px-4 lg:px-6 py-3 border-t border-labbaik-border bg-labbaik-surface">
              <Composer key={selected.customerId} onSend={send} disabled={threadLoading || threadError} />
              <p className="mt-1.5 text-[11px] text-labbaik-text-muted">تصل الرسالة للعميل في تطبيق المتجر باسم "فريق الدعم"، واسمك يظهر لفريقكم فقط.</p>
            </div>
          </>
        )}
      </section>

      {/* ── Orders & returns ──────────────────────────────────────────── */}
      {selected && panelOpen && (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setPanelOpen(false)} aria-label="إغلاق اللوحة" />
          <aside className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-sm xl:static xl:z-auto xl:w-80 2xl:w-96 shrink-0 flex flex-col min-h-0 border-r border-labbaik-border bg-labbaik-surface">
            <div className="p-3 border-b border-labbaik-border">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="tablist" aria-label="بيانات العميل">
                {([['orders', 'الطلبات', Package], ['returns', 'المرتجعات', Undo2]] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-black transition-colors cursor-pointer ${tab === id ? 'bg-labbaik-surface text-labbaik-blue dark:text-white shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
              {branch && (tab === 'orders'
                ? <CustomerOrders branch={branch} customerId={selected.customerId} />
                : <CustomerReturns branch={branch} customerId={selected.customerId} />)}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// ─── Side panel sections ─────────────────────────────────────────────────────

function usePaged<T>(load: (page: number) => Promise<T>, key: string) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setPage(1); }, [key]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    load(page)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  return { page, setPage, data, error, loading };
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = 'h-8 px-3 rounded-lg border border-labbaik-border text-xs font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  return (
    <div className="flex items-center justify-between pt-2">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>السابق</button>
      <span className="text-xs font-bold text-labbaik-text-muted tabular-nums">{formatNumber(page)} / {formatNumber(totalPages)}</span>
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>التالي</button>
    </div>
  );
}

const PanelSkeleton = () => (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-labbaik-page animate-pulse" />)}
  </div>
);

/** A status chip with its kind written before it, so shipping and preparation are told apart at a glance. */
const LabeledChip = ({ label, text, cls }: { label: string; text: string; cls: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className="text-[11px] font-bold text-labbaik-text-muted">{label}:</span>
    <span className={`${chip} ${cls}`}>{text}</span>
  </span>
);

const PanelEmpty = ({ icon: Icon, text }: { icon: typeof Package; text: string }) => (
  <div className="py-10 flex flex-col items-center gap-2 text-labbaik-text-muted">
    <Icon size={30} />
    <p className="text-sm font-bold">{text}</p>
  </div>
);

function CustomerOrders({ branch, customerId }: { branch: string; customerId: string }) {
  const { page, setPage, data, error, loading } = usePaged<Paged<StoreShipment>>((p) => storeChatApi.shipments(branch, customerId, p), `${branch}:${customerId}`);
  const [opened, setOpened] = useState<StoreShipment | null>(null);

  if (loading && !data) return <PanelSkeleton />;
  if (error) return <p className="py-8 text-center text-sm font-bold text-red-700 dark:text-red-300">تعذر تحميل الطلبات</p>;
  if (!data?.data.length) return <PanelEmpty icon={Package} text="لا توجد طلبات لهذا العميل" />;

  return (
    <div className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
      <p className="px-1 text-xs font-bold text-labbaik-text-muted">{formatNumber(data.totalDocuments)} طلب</p>
      {data.data.map((s) => {
        const status = SHIPMENT_STATUS[s.status] || { label: s.status, cls: 'bg-labbaik-page text-labbaik-text-muted' };
        const stage = fulfillmentStage(s.fulfillment);
        const schedule = scheduleInfo(s);
        const address = [s.address?.city, s.address?.district].filter(Boolean).join('، ');
        return (
          <button key={s.shipmentId} type="button" onClick={() => setOpened(s)} title="عرض تفاصيل الطلب" className={clickableCard}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-labbaik-blue dark:text-purple-300 tabular-nums" dir="ltr">{s.orderNumber || '—'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <LabeledChip label="الشحن" text={status.label} cls={status.cls} />
              <LabeledChip label="التجهيز" text={stage.label} cls={stage.cls} />
              {schedule && (
                <span title={[schedule.fullDate, schedule.timeRange].filter(Boolean).join(' · ') || 'طلب مجدول'} className={`${chip} gap-1 bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200 ring-1 ring-inset ring-labbaik-blue/25`}>
                  <CalendarClock size={12} className="shrink-0" />
                  مجدول{schedule.relative ? ` · ${schedule.relative}` : ''}{schedule.timeRange ? ` ${schedule.timeRange}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2 text-[11px] font-bold text-labbaik-text-muted">
              <div className="min-w-0">
                <p className="truncate">{s.deliveryMethodAr || s.deliveryMethod}{s.assigneeName ? ` · ${s.assigneeName}` : ''}</p>
                {s.assigneePhone && (
                  <p className="mt-0.5 inline-flex items-center gap-1 tabular-nums" title="جوال المندوب">
                    <Phone size={11} className="shrink-0" />
                    <span dir="ltr">{s.assigneePhone}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 tabular-nums">{safeDate(s.createdAt, 'dd/MM/yyyy')}</span>
            </div>
            {(address || s.itemsCount > 0) && (
              <p className="text-[11px] text-labbaik-text-muted truncate">
                {s.itemsCount > 0 && `${formatNumber(s.itemsCount)} قطعة`}{address && s.itemsCount > 0 ? ' · ' : ''}{address}
              </p>
            )}
          </button>
        );
      })}
      <Pager page={page} totalPages={data.totalPages} onChange={setPage} />
      {opened && <ShipmentDetailsDialog shipment={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

function CustomerReturns({ branch, customerId }: { branch: string; customerId: string }) {
  const { page, setPage, data, error, loading } = usePaged<ReturnsPage>((p) => storeChatApi.returns(branch, customerId, p), `${branch}:${customerId}`);
  const [preview, setPreview] = useState<string | null>(null);
  const [opened, setOpened] = useState<StoreReturn | null>(null);

  if (loading && !data) return <PanelSkeleton />;
  if (error) return <p className="py-8 text-center text-sm font-bold text-red-700 dark:text-red-300">تعذر تحميل المرتجعات</p>;
  if (!data?.data.length) return <PanelEmpty icon={Undo2} text="لا توجد مرتجعات لهذا العميل" />;

  return (
    <div className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-labbaik-page p-3">
          <p className="text-[11px] font-bold text-labbaik-text-muted">عدد المرتجعات</p>
          <p className="text-lg font-black text-neutral-900 dark:text-white tabular-nums">{formatNumber(data.summary.totalReturns)}</p>
        </div>
        <div className="rounded-xl bg-labbaik-page p-3">
          <p className="text-[11px] font-bold text-labbaik-text-muted">إجمالي المرتجع</p>
          <p className="text-lg font-black text-neutral-900 dark:text-white tabular-nums">{money(data.summary.totalAmount)}</p>
        </div>
      </div>

      {data.data.map((r) => (
        <div
          key={r.returnRequestId}
          role="button"
          tabIndex={0}
          title="عرض تفاصيل المرتجع"
          onClick={() => setOpened(r)}
          onKeyDown={activateOnKey(() => setOpened(r))}
          className={clickableCard}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-labbaik-blue dark:text-purple-300 tabular-nums" dir="ltr">{r.orderNumber || '—'}</span>
            <span className={`${chip} ${RETURN_STATUS_CLS[r.status] || 'bg-labbaik-page text-labbaik-text-muted'}`}>{r.statusAr}</span>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-labbaik-text-muted">{formatNumber(r.itemsCount)} صنف · {formatNumber(r.totalQuantity)} قطعة</span>
            <span className="font-black text-neutral-900 dark:text-white tabular-nums">{money(r.totalAmount)}</span>
          </div>

          {r.items.length > 0 && (
            <ul className="space-y-0.5">
              {r.items.slice(0, 3).map((item, i) => (
                <li key={`${item.sku}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-neutral-700 dark:text-neutral-200">
                  <span className="truncate">{item.productName}</span>
                  <span className="shrink-0 font-bold tabular-nums text-labbaik-text-muted">×{formatNumber(item.quantity)}</span>
                </li>
              ))}
              {r.items.length > 3 && <li className="text-[11px] font-bold text-labbaik-text-muted">+{formatNumber(r.items.length - 3)} أصناف أخرى</li>}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {r.reasonAr && <span className={`${chip} bg-labbaik-page text-labbaik-text-muted`}>{r.reasonAr}</span>}
            <span className={`${chip} bg-labbaik-page text-labbaik-text-muted`}>{r.sourceAr}</span>
            {r.deliveryReceived && <span className={`${chip} bg-emerald-500/15 text-emerald-800 dark:text-emerald-300`}>تم الاسترداد بنجاح</span>}
          </div>

          {r.attachments.length > 0 && (
            <div className="flex gap-2">
              {r.attachments.map((url) => (
                <button key={url} type="button" onClick={(e) => { e.stopPropagation(); setPreview(url); }} className="h-14 w-14 overflow-hidden rounded-lg border border-labbaik-border cursor-zoom-in" aria-label="عرض صورة المرتجع">
                  <img src={url} alt="صورة المرتجع" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] font-bold text-labbaik-text-muted tabular-nums">{safeDate(r.requestedAt, 'dd/MM/yyyy HH:mm')}</p>
        </div>
      ))}
      <Pager page={page} totalPages={data.totalPages} onChange={setPage} />

      {opened && <ReturnDetailsDialog item={opened} onClose={() => setOpened(null)} onPreview={setPreview} />}

      {preview && createPortal(
        <div role="dialog" aria-modal="true" aria-label="صورة المرتجع" className="fixed inset-0 z-[200] grid place-items-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="صورة المرتجع" className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
            <a href={preview} target="_blank" rel="noreferrer" className="absolute top-2 left-2 inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-black/60 text-xs font-bold text-white hover:bg-black/75">
              <ExternalLink size={13} /> فتح
            </a>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
