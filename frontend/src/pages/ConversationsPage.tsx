import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import CustomerAvatar from '../components/CustomerAvatar';
import api from '../api/client';
import { getApiBaseUrl } from '../api/baseUrl';
import CustomerProfile from '../components/CustomerProfile';
import { useToast } from '../components/Toast';
import {
  Search, 
  CheckCheck,
  MessageCircle,
  ChevronRight,
  Filter,
  Tag,
  Plus,
  X as CloseIcon,
  Hash,
  Layers,
  Check,
  Share2,
  Contact,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  MapPin,
  Music,
  Video,
  Download,
  Frown,
  Smile,
  Bot,
  Clock,
  Inbox,
  ChevronDown,
  Loader2,
  Building2,
  FolderOpen
} from 'lucide-react';
import { 
  FaWhatsapp, 
  FaInstagram, 
  FaFacebook, 
  FaMapMarkerAlt 
} from 'react-icons/fa';
import { format, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import Composer from '../components/conversations/Composer';

interface Message {
  _id?: string;
  from: string;
  text: string;
  type: string;
  attachments?: Attachment[];
  metadata?: Record<string, any>;
  sentiment?: string;
  timestamp: any;
}

interface Attachment {
  id?: string;
  type: string;
  mimeType?: string;
  filename: string;
  originalFilename?: string;
  caption?: string;
  url: string;
  downloadError?: boolean;
}

interface Conversation {
  _id: string;
  customerPhone: string;
  storeId: string;
  platform: string;
  customerId?: string; // Link to Postgres
  customerName?: string | null;
  lastMessage: string;
  lastMessageAt: string;
  // Inbox rows carry only their last message (for the preview); the thread is paged in separately.
  messages?: Message[];
  awaitingReply?: boolean;
  status: ConvStatus | string;
  snoozedUntil?: string | null;
  // CRM labels of the linked customer (from the customers module), distinct from conversation topic tags.
  customerCategories?: CustomerLabel[];
  customerTags?: CustomerLabel[];
  unreadCount?: number;
  aiEnabled?: boolean;
  lastSentiment?: string;
  tags?: string[];
}

interface CustomerLabel { id: string; name: string; color: string }

interface InboxCounts { active: number; snoozed: number; closed: number; unread: number; needsReply: number }
interface InboxPage { items: Conversation[]; nextCursor: string | null }
interface MessagesPage { messages: Message[]; total: number; start: number; hasMore: boolean }

const LIST_PAGE_SIZE = 30;
const MESSAGES_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_COUNTS: InboxCounts = { active: 0, snoozed: 0, closed: 0, unread: 0, needsReply: 0 };

const fetchListPage = (params: Record<string, string | undefined>, cursor?: string) =>
  api.get<InboxPage>('/conversations', { params: { ...params, limit: LIST_PAGE_SIZE, cursor } }).then(({ data }) => data);

// Appends rows not already present; `head` wins when the same conversation is in both.
const mergeUnique = (head: Conversation[], tail: Conversation[]) => {
  const ids = new Set(head.map((c) => c._id));
  return [...head, ...tail.filter((c) => !ids.has(c._id))];
};

// Same visual language as the customers page: categories are squared chips, tags are "#" pills; text stays neutral.
function CustomerLabelChip({ label, kind, size = 'sm' }: { label: CustomerLabel; kind: 'category' | 'tag'; size?: 'sm' | 'md' }) {
  return (
    <span
      title={`${kind === 'category' ? 'فئة العميل' : 'تاق العميل'}: ${label.name}`}
      className={`inline-flex items-center gap-1 shrink-0 border font-bold text-neutral-800 dark:text-neutral-100 whitespace-nowrap ${size === 'md' ? 'h-6 px-2 text-xs' : 'h-5 px-1.5 text-[11px]'} ${kind === 'category' ? 'rounded-md' : 'rounded-full'}`}
      style={{ borderColor: `${label.color}66`, backgroundColor: `${label.color}14` }}
    >
      <span className={`h-1.5 w-1.5 shrink-0 ${kind === 'category' ? 'rounded-[2px]' : 'rounded-full'}`} style={{ backgroundColor: label.color }} />
      {kind === 'tag' && '#'}{label.name}
    </span>
  );
}

type ConvStatus = 'open' | 'pending' | 'snoozed' | 'closed';
type StatusView = 'active' | 'snoozed' | 'closed';

// open/pending stay in the main inbox; snoozed hides until snoozedUntil; closed is done. A new customer message reopens either.
const STATUS_META: Record<ConvStatus, { label: string; dot: string; chip: string; hint: string }> = {
  open: { label: 'مفتوحة', dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300', hint: 'تحتاج متابعة الفريق' },
  pending: { label: 'معلّقة', dot: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', hint: 'بانتظار العميل أو جهة أخرى' },
  snoozed: { label: 'مؤجلة', dot: 'bg-sky-500', chip: 'bg-sky-500/15 text-sky-800 dark:text-sky-300', hint: 'تختفي حتى الوقت المحدد ثم تعود مفتوحة' },
  closed: { label: 'مغلقة', dot: 'bg-neutral-400', chip: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300', hint: 'انتهت؛ تُفتح تلقائيًا إذا راسل العميل' },
};

const normalizeStatus = (c: { status?: string; snoozedUntil?: string | null }, now: number): ConvStatus => {
  if (c.status === 'snoozed' && c.snoozedUntil && new Date(c.snoozedUntil).getTime() <= now) return 'open';
  return c.status === 'pending' || c.status === 'snoozed' || c.status === 'closed' ? c.status : 'open';
};

const snoozeOptions = (now: Date) => {
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
  const nextSunday = at((7 - now.getDay()) % 7 || 7, 9);
  return [
    { label: 'ساعة', until: new Date(now.getTime() + 3_600_000) },
    { label: '3 ساعات', until: new Date(now.getTime() + 3 * 3_600_000) },
    { label: 'غدًا 9 صباحًا', until: at(1, 9) },
    { label: 'الأحد القادم 9 صباحًا', until: nextSunday },
  ];
};

const formatSnoozeUntil = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return toEnglishDigits(format(d, sameDay ? 'HH:mm' : 'EEEE HH:mm', { locale: ar }));
};

function StatusMenu({ status, snoozedUntil, busy, onChange }: { status: ConvStatus; snoozedUntil?: string | null; busy: boolean; onChange: (status: ConvStatus, until?: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) { setOpen(false); setShowSnooze(false); } };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setShowSnooze(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const meta = STATUS_META[status];
  const pick = (next: ConvStatus, until?: Date) => { setOpen(false); setShowSnooze(false); onChange(next, until); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`حالة المحادثة: ${meta.label}`}
        className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-labbaik-border text-xs font-black text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 disabled:opacity-60 transition-colors cursor-pointer"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <span className={`h-2 w-2 rounded-full ${meta.dot}`} />}
        <span>{meta.label}</span>
        {status === 'snoozed' && snoozedUntil && <span className="hidden md:inline font-bold text-labbaik-text-muted">حتى {formatSnoozeUntil(snoozedUntil)}</span>}
        <ChevronDown size={14} className={`text-labbaik-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 mt-1 w-64 rounded-xl border border-labbaik-border bg-labbaik-surface p-1 shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-50 animate-fade-in">
          {(['open', 'pending', 'snoozed', 'closed'] as const).map((key) => {
            const item = STATUS_META[key];
            const current = key === status;
            if (key === 'snoozed') {
              return (
                <div key={key}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={showSnooze}
                    onClick={() => setShowSnooze(!showSnooze)}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-right transition-colors cursor-pointer ${current ? 'bg-labbaik-blue/8' : 'hover:bg-labbaik-page'}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-neutral-900 dark:text-white">{item.label}{current && snoozedUntil ? ` · حتى ${formatSnoozeUntil(snoozedUntil)}` : ''}</span>
                      <span className="block text-[11px] text-labbaik-text-muted">{item.hint}</span>
                    </span>
                    <ChevronDown size={14} className={`mt-1 text-labbaik-text-muted transition-transform ${showSnooze ? 'rotate-180' : ''}`} />
                  </button>
                  {showSnooze && (
                    <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                      {snoozeOptions(new Date()).map((option) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={option.label}
                          onClick={() => pick('snoozed', option.until)}
                          className="h-8 px-2 rounded-md border border-labbaik-border text-xs font-bold text-neutral-800 dark:text-neutral-100 hover:border-sky-500/50 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={current}
                key={key}
                onClick={() => pick(key)}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-right transition-colors cursor-pointer ${current ? 'bg-labbaik-blue/8' : 'hover:bg-labbaik-page'}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-neutral-900 dark:text-white">{item.label}</span>
                  <span className="block text-[11px] text-labbaik-text-muted">{item.hint}</span>
                </span>
                {current && <Check size={15} className="mt-1 text-labbaik-blue dark:text-purple-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Arabic counted noun: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular with the number.
const arabicCount = (n: number, [one, two, few, many]: [string, string, string, string]) => {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n <= 10 ? few : many}`;
};
const MINUTES: [string, string, string, string] = ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'];
const HOURS: [string, string, string, string] = ['ساعة', 'ساعتين', 'ساعات', 'ساعة'];
const DAYS: [string, string, string, string] = ['يوم', 'يومين', 'أيام', 'يومًا'];

const toTime = (date?: string | number | Date) => {
  if (!date) return NaN;
  return new Date(date).getTime();
};

// "الآن" / "منذ 5 دقائق" / "منذ ساعتين" / "أمس" / "منذ 3 أيام", then a plain date after a week.
const formatRelativeTime = (date: string | number | Date | undefined, now: number) => {
  const time = toTime(date);
  if (isNaN(time)) return '';
  const diff = Math.max(0, now - time);
  if (diff < MINUTE) return 'الآن';
  if (diff < HOUR) return `منذ ${arabicCount(Math.floor(diff / MINUTE), MINUTES)}`;
  if (diff < DAY) return `منذ ${arabicCount(Math.floor(diff / HOUR), HOURS)}`;
  if (isYesterday(time)) return 'أمس';
  if (diff < 7 * DAY) return `منذ ${arabicCount(Math.floor(diff / DAY), DAYS)}`;
  return toEnglishDigits(format(time, 'dd/MM/yy'));
};

// Compact wait duration for the "awaiting reply" chip: 5د · 2س · 3ي.
const formatWait = (date: string | number | Date | undefined, now: number) => {
  const time = toTime(date);
  if (isNaN(time)) return '';
  const diff = Math.max(0, now - time);
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))}د`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}س`;
  return `${Math.floor(diff / DAY)}ي`;
};

const isCustomerMessage = (msg?: Message) =>
  Boolean(msg) && msg!.from !== 'me' && msg!.from !== 'system' && msg!.type !== 'system_error';

// Mirrors a real conversation row (avatar, name + time, preview + badge) so nothing jumps when data arrives.
function ConversationListSkeleton() {
  const widths = [['w-32', 'w-48'], ['w-24', 'w-40'], ['w-36', 'w-52'], ['w-28', 'w-36'], ['w-32', 'w-44'], ['w-20', 'w-48'], ['w-28', 'w-40'], ['w-36', 'w-32']];
  return (
    <div aria-hidden="true">
      {widths.map(([name, preview], i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-labbaik-border">
          <div className="h-11 w-11 shrink-0 rounded-full bg-labbaik-page animate-pulse" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className={`h-3.5 ${name} max-w-full rounded bg-labbaik-page animate-pulse`} />
              <div className="h-2.5 w-12 shrink-0 rounded bg-labbaik-page animate-pulse" />
            </div>
            <div className={`h-3 ${preview} max-w-full rounded bg-labbaik-page animate-pulse`} />
          </div>
        </div>
      ))}
      <span className="sr-only">جاري تحميل المحادثات...</span>
    </div>
  );
}

function SecureAttachment({ attachment }: { attachment: Attachment }) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const typeIcon = attachment.type === 'image' || attachment.type === 'sticker'
    ? <ImageIcon size={18} />
    : attachment.type === 'video'
      ? <Video size={18} />
      : attachment.type === 'audio'
        ? <Music size={18} />
        : <FileText size={18} />;

  useEffect(() => {
    let active = true;
    let createdUrl = '';

    if (!attachment.url || attachment.downloadError) return;

    api.get(attachment.url, { responseType: 'blob' }).then(({ data }) => {
      if (!active) return;
      createdUrl = URL.createObjectURL(data);
      setObjectUrl(createdUrl);
    }).catch(() => {});

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.url, attachment.downloadError]);

  if (attachment.downloadError) {
    return <div className="mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-700 dark:text-red-200">تعذر تنزيل المرفق من واتساب.</div>;
  }

  if (!objectUrl) {
    return <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-current/15 bg-current/5 px-3 py-2.5 text-xs font-bold opacity-80">{typeIcon} جاري تحميل المرفق...</div>;
  }

  if (attachment.type === 'image' || attachment.type === 'sticker') {
    return <img src={objectUrl} alt={attachment.caption || attachment.originalFilename || 'مرفق واتساب'} className="mt-2 max-h-80 rounded-xl object-contain" />;
  }

  if (attachment.type === 'video') {
    return <video controls src={objectUrl} className="mt-2 max-h-80 rounded-xl" />;
  }

  if (attachment.type === 'audio') {
    return <audio controls src={objectUrl} className="mt-2 w-full" />;
  }

  return (
    <a href={objectUrl} download={attachment.originalFilename || attachment.filename} className="mt-2 flex items-center gap-2.5 rounded-xl border border-current/15 bg-current/5 px-3 py-2.5 text-xs font-bold hover:bg-current/10 transition-colors">
      {typeIcon}
      <span className="min-w-0 flex-1 truncate">{attachment.originalFilename || attachment.filename || 'WhatsApp file'}</span>
      <Download size={16} />
    </a>
  );
}

function MessageExtras({ msg }: { msg: Message }) {
  const attachments = msg.attachments || [];
  const location = msg.metadata?.location;
  const contacts = msg.metadata?.contacts;

  return (
    <div className="space-y-2">
      {attachments.map((attachment, index) => (
        <SecureAttachment key={`${attachment.id || attachment.filename}-${index}`} attachment={attachment} />
      ))}
      {location && (
        <div className="mt-2 rounded-xl border border-current/15 bg-current/5 px-3 py-2.5 text-xs font-bold">
          <div className="mb-1 flex items-center gap-2"><MapPin size={16} /> {location.name || 'موقع واتساب'}</div>
          <div className="opacity-75">{location.address || `${location.latitude}, ${location.longitude}`}</div>
        </div>
      )}
      {Array.isArray(contacts) && contacts.map((contact: any, index: number) => (
        <div key={index} className="mt-2 rounded-xl border border-current/15 bg-current/5 px-3 py-2.5 text-xs font-bold">
          <div>{contact.name?.formatted_name || contact.name?.first_name || 'جهة اتصال'}</div>
          <div className="mt-1 opacity-75" dir="ltr">{contact.phones?.map((phone: any) => phone.phone).join(', ')}</div>
        </div>
      ))}
    </div>
  );
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileList, setShowMobileList] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [listTab, setListTab] = useState<'all' | 'unread' | 'needs_reply'>('all');
  const [statusView, setStatusView] = useState<StatusView>('active');
  const [statusBusy, setStatusBusy] = useState(false);
  // Ticks once a minute so relative times ("منذ 5 دقائق") stay current without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);
  
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<'first' | 'more' | null>(null);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [counts, setCounts] = useState<InboxCounts>(EMPTY_COUNTS);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // The open thread: a window [messagesStart, end) of the stored messages, grown upwards on scroll.
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesStart, setMessagesStart] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const selectedChatRef = useRef<Conversation | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listSentinelRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  // Bumped on every new list / thread load so late responses from an older one are dropped.
  const listRequestRef = useRef(0);
  const countsRequestRef = useRef(0);
  const chatRequestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const scrollIntentRef = useRef<{ kind: 'bottom'; smooth: boolean } | { kind: 'keep'; height: number; top: number } | null>(null);
  const realtimeSyncRef = useRef<{ timer?: number; head: boolean }>({ head: false });
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const { showToast } = useToast();

  // Everything the server filters on. Changing any of it reloads the list from the first page.
  const listParams = useMemo(() => ({
    scope: 'organization' as const,
    view: statusView,
    tab: listTab,
    platform: selectedPlatform || undefined,
    tag: selectedTag || undefined,
    storeId: selectedStoreId === 'all' ? undefined : selectedStoreId,
    search: debouncedSearch || undefined,
  }), [statusView, listTab, selectedPlatform, selectedTag, selectedStoreId, debouncedSearch]);
  const listParamsRef = useRef(listParams);
  listParamsRef.current = listParams;
  
  const defaultTags = ['طلب_جديد', 'استفسار_سعر', 'شكوى', 'موقع_المحل', 'سؤال_عام'];
  const platforms = [
    { id: 'whatsapp', name: 'واتساب', icon: <FaWhatsapp className="text-green-500" /> },
    { id: 'instagram', name: 'إنستغرام', icon: <FaInstagram className="text-pink-500" /> },
    { id: 'facebook', name: 'فيسبوك', icon: <FaFacebook className="text-blue-600" /> }
  ];

  const safeFormatDate = (date: any, formatStr: string) => {
    try {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return toEnglishDigits(format(d, formatStr, { locale: ar }));
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    selectedChatRef.current = selectedChat;
    if (selectedChat) {
      setShowMobileList(false);
      if (!selectedChat.customerId) {
        api.get(`/conversations/${selectedChat._id}`).then(({ data }) => {
          setSelectedChat(prev => prev && prev._id === data._id ? { ...prev, customerId: data.customerId } : prev);
          setConversations(prev => prev.map(c => c._id === data._id ? { ...c, customerId: data.customerId } : c));
        });
      }
    }
  }, [selectedChat?._id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const loadCounts = useCallback(() => {
    const request = ++countsRequestRef.current;
    // Counts cover every tab of the current status view, so the tab itself is not sent.
    const filters = { ...listParamsRef.current, tab: undefined };
    api.get<InboxCounts>('/conversations/counts', { params: filters })
      .then(({ data }) => { if (request === countsRequestRef.current) setCounts(data); })
      .catch(() => { /* badges keep their last values */ });
  }, []);

  useEffect(() => {
    const request = ++listRequestRef.current;
    setLoading(true);
    setListError(null);
    fetchListPage(listParams)
      .then((page) => {
        if (request !== listRequestRef.current) return;
        setConversations(page.items);
        setNextCursor(page.nextCursor);
        listScrollRef.current?.scrollTo({ top: 0 });
      })
      .catch(() => { if (request === listRequestRef.current) setListError('first'); })
      .finally(() => { if (request === listRequestRef.current) setLoading(false); });
    loadCounts();
  }, [listParams, listReloadKey, loadCounts]);

  const loadMore = async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    const request = listRequestRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setListError(null);
    try {
      const page = await fetchListPage(listParamsRef.current, nextCursor);
      if (request !== listRequestRef.current) return;
      setConversations((prev) => mergeUnique(prev, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      if (request === listRequestRef.current) setListError('more');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Infinite scroll: fetch the next page as the end of the list comes into view.
  useEffect(() => {
    const sentinel = listSentinelRef.current;
    if (!sentinel || !nextCursor || loading || listError) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadMoreRef.current(); },
      { root: listScrollRef.current, rootMargin: '300px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loading, listError]);

  // Realtime events are coalesced: counts refresh, and an unknown conversation pulls the first page back in.
  const scheduleRealtimeSync = (needsHead: boolean) => {
    const sync = realtimeSyncRef.current;
    sync.head ||= needsHead;
    window.clearTimeout(sync.timer);
    sync.timer = window.setTimeout(() => {
      const refreshHead = sync.head;
      sync.head = false;
      loadCounts();
      if (!refreshHead) return;
      const request = listRequestRef.current;
      fetchListPage(listParamsRef.current)
        .then((page) => { if (request === listRequestRef.current) setConversations((prev) => mergeUnique(page.items, prev)); })
        .catch(() => {});
    }, 400);
  };
  useEffect(() => () => window.clearTimeout(realtimeSyncRef.current.timer), []);

  // Open a conversation → load its latest messages.
  useEffect(() => {
    const id = selectedChat?._id;
    const request = ++chatRequestRef.current;
    setMessages([]);
    setMessagesStart(0);
    setHasOlderMessages(false);
    setMessagesError(false);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    if (!id || id.startsWith('temp')) { setMessagesLoading(false); return; }
    setMessagesLoading(true);
    api.get<MessagesPage>(`/conversations/${id}/messages`, { params: { limit: MESSAGES_PAGE_SIZE } })
      .then(({ data }) => {
        if (request !== chatRequestRef.current) return;
        scrollIntentRef.current = { kind: 'bottom', smooth: false };
        setMessages(data.messages);
        setMessagesStart(data.start);
        setHasOlderMessages(data.hasMore);
      })
      .catch(() => { if (request === chatRequestRef.current) setMessagesError(true); })
      .finally(() => { if (request === chatRequestRef.current) setMessagesLoading(false); });
  }, [selectedChat?._id]);

  const loadOlderMessages = async () => {
    const id = selectedChatRef.current?._id;
    if (!id || !hasOlderMessages || loadingOlderRef.current) return;
    const request = chatRequestRef.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { data } = await api.get<MessagesPage>(`/conversations/${id}/messages`, { params: { limit: MESSAGES_PAGE_SIZE, before: messagesStart } });
      if (request !== chatRequestRef.current) return;
      const el = messagesScrollRef.current;
      if (el) scrollIntentRef.current = { kind: 'keep', height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => [...data.messages, ...prev]);
      setMessagesStart(data.start);
      setHasOlderMessages(data.hasMore);
    } catch {
      if (request === chatRequestRef.current) showToast('تعذر تحميل الرسائل الأقدم.', 'error');
    } finally {
      if (request === chatRequestRef.current) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    }
  };
  const loadOlderRef = useRef(loadOlderMessages);
  loadOlderRef.current = loadOlderMessages;

  // Applied before paint: jump to the bottom on open, follow new messages, or keep position when older ones are prepended.
  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    const intent = scrollIntentRef.current;
    if (!el || !intent) return;
    scrollIntentRef.current = null;
    if (intent.kind === 'keep') el.scrollTop = el.scrollHeight - intent.height + intent.top;
    else el.scrollTo({ top: el.scrollHeight, behavior: intent.smooth ? 'smooth' : 'auto' });
  }, [messages]);

  // A short first page may not overflow, so there is nothing to scroll up from: keep loading until it does.
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el && hasOlderMessages && !messagesLoading && !loadingOlder && el.scrollHeight <= el.clientHeight + 40) void loadOlderRef.current();
  }, [messages, hasOlderMessages, messagesLoading, loadingOlder]);

  const isNearBottom = () => {
    const el = messagesScrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };

  useEffect(() => {
    fetchStores();
    fetchStoreTags();
    setupSocket();
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, []);

  const fetchStores = async () => {
    try {
      const { data } = await api.get('/stores');
      setStores(Array.isArray(data) ? data : (data?.stores || []));
    } catch (e) {
      setStores([]);
    }
  };

  const getStoreName = (storeId?: string) => stores.find((store) => store.id === storeId)?.name || 'فرع غير معروف';

  const fetchStoreTags = async () => {
    try {
      const { data } = await api.get('/stores/me');
      setCustomTags(data.customTags || []);
    } catch (e) {}
  };

  // Socket listeners are bound once; they call through this ref so they always see the current render.
  const socketHandlersRef = useRef<Record<'message' | 'status' | 'convStatus', (payload: unknown) => void>>(null!);

  const setupSocket = () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    socketRef.current = io(getApiBaseUrl(), {
      auth: { token },
      query: { token }
    });
    socketRef.current.on('new_message', (payload) => socketHandlersRef.current.message(payload));
    socketRef.current.on('message_status', (payload) => socketHandlersRef.current.status(payload));
    // Another teammate (or another tab) changed a conversation's status.
    socketRef.current.on('conversation_status', (payload) => socketHandlersRef.current.convStatus(payload));
  };

  const handleConversationStatus = (payload: { conversationId?: string; status?: string; snoozedUntil?: string | null } | null) => {
    if (!payload?.conversationId) return;
    const id = payload.conversationId;
    const patch = { status: payload.status || 'open', snoozedUntil: payload.snoozedUntil || null };
    setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, ...patch } : c)));
    setSelectedChat((current) => (current && current._id === id ? { ...current, ...patch } : current));
    scheduleRealtimeSync(false);
  };

  const changeStatus = async (next: ConvStatus, until?: Date) => {
    if (!selectedChat || selectedChat._id.startsWith('temp')) return;
    const id = selectedChat._id;
    setStatusBusy(true);
    try {
      const { data } = await api.patch(`/conversations/${id}/status`, { status: next, snoozedUntil: until?.toISOString() });
      const patch = { status: data.status, snoozedUntil: data.snoozedUntil || null, ...(next === 'closed' ? { unreadCount: 0 } : {}) };
      setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, ...patch } : c)));
      setSelectedChat((current) => (current && current._id === id ? { ...current, ...patch } : current));
      loadCounts();
      const notices: Record<ConvStatus, string> = {
        open: 'أُعيد فتح المحادثة.',
        pending: 'المحادثة معلّقة.',
        snoozed: `أُجّلت المحادثة حتى ${formatSnoozeUntil(data.snoozedUntil)}.`,
        closed: 'أُغلقت المحادثة. ستُفتح تلقائيًا إذا راسل العميل.',
      };
      showToast(notices[next], 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر تغيير حالة المحادثة.', 'error');
    } finally {
      setStatusBusy(false);
    }
  };

  const handleMessageStatus = (payload: any) => {
    if (!payload?.whatsappMessageId || !payload?.status) return;
    const updateMessages = (messages: Message[] = []) => messages.map((message) => {
      if (message.metadata?.whatsappMessageId !== payload.whatsappMessageId) return message;
      return {
        ...message,
        metadata: {
          ...(message.metadata || {}),
          status: payload.status,
          statusUpdatedAt: payload.timestamp || Date.now(),
          statusErrors: payload.errors || [],
        },
      };
    });

    setConversations((prev) => prev.map((conversation) => ({
      ...conversation,
      messages: updateMessages(conversation.messages || []),
    })));
    setMessages(updateMessages);
  };

  const handleIncomingRealtimeMessage = (payload: any) => {
    if (!payload) return;
    const isOwnOrSystem = payload.from === 'me' || payload.from === 'system';
    const targetPhone = isOwnOrSystem ? payload.customerPhone : payload.from;
    const targetStoreId = payload.storeId as string | undefined;
    if (!targetPhone) return;

    const newMessage: Message = {
      from: payload.from,
      text: payload.text || '',
      type: payload.type || 'text',
      attachments: payload.attachments || [],
      metadata: payload.metadata || {},
      sentiment: payload.sentiment,
      timestamp: payload.timestamp || Date.now()
    };

    if (newMessage.type === 'system_error') {
      showToast(newMessage.text || 'حدث خطأ في إرسال الرسالة', 'error');
    }

    const isTarget = (c: Conversation | null) => Boolean(c) && c!.customerPhone === targetPhone && (!targetStoreId || c!.storeId === targetStoreId);
    const isCurrentlyOpen = isTarget(selectedChatRef.current);
    // Mirrors the server: a customer message reopens a snoozed/closed conversation.
    const reopen = !isOwnOrSystem ? { status: 'open', snoozedUntil: null } : {};

    // Only rows already loaded are patched; a conversation outside the loaded pages comes back
    // through a first-page refetch, so it shows up only if it matches the current filters.
    const known = conversationsRef.current.some(isTarget);
    if (known) {
      setConversations(prev => {
        const idx = prev.findIndex(isTarget);
        if (idx === -1) return prev;
        const current = prev[idx];
        const updatedConv: Conversation = {
          ...current,
          lastMessage: payload.text || `[${payload.type || 'message'}]`,
          lastMessageAt: new Date().toISOString(),
          lastSentiment: payload.sentiment || current.lastSentiment,
          customerId: payload.customerId || current.customerId,
          customerName: current.customerName || payload.customerName,
          tags: Array.from(new Set([...(current.tags || []), ...(payload.tags || [])])),
          messages: [newMessage],
          awaitingReply: isCustomerMessage(newMessage),
          unreadCount: (!isOwnOrSystem && !isCurrentlyOpen) ? (current.unreadCount || 0) + 1 : (current.unreadCount || 0),
          ...reopen,
        };
        return [updatedConv, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    }
    scheduleRealtimeSync(!known);

    if (isCurrentlyOpen) {
      if (newMessage.from === 'me' || isNearBottom()) scrollIntentRef.current = { kind: 'bottom', smooth: true };
      setMessages(prev => [...prev, newMessage]);
      setSelectedChat(prev => (prev ? { ...prev, ...reopen } : prev));
    }
  };

  socketHandlersRef.current = {
    message: handleIncomingRealtimeMessage,
    status: handleMessageStatus,
    convStatus: (payload) => handleConversationStatus(payload as Parameters<typeof handleConversationStatus>[0]),
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedChat({ ...conv, unreadCount: 0 });
    setShowTagEditor(false);
    if (Number(conv.unreadCount) > 0) setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    setConversations(prev => prev.map(c => c._id === conv._id ? { ...c, unreadCount: 0 } : c));
    try { if (conv._id && !conv._id.startsWith('temp')) await api.patch(`/conversations/${conv._id}/read`); } catch (e) {}
  };

  const toggleAi = async () => {
    if (!selectedChat) return;
    const newStatus = !selectedChat.aiEnabled;
    try {
      await api.patch(`/conversations/${selectedChat._id}/toggle-ai`, { enabled: newStatus });
      setSelectedChat({ ...selectedChat, aiEnabled: newStatus });
      setConversations(prev => prev.map(c => c._id === selectedChat._id ? { ...c, aiEnabled: newStatus } : c));
    } catch (error) {}
  };

  const handleToggleTag = async (tag: string) => {
    if (!selectedChat) return;
    const currentTags = selectedChat.tags || [];
    const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
    
    try {
      await api.patch(`/conversations/${selectedChat._id}/tags`, { tags: newTags });
      setSelectedChat({ ...selectedChat, tags: newTags });
      setConversations(prev => prev.map(c => c._id === selectedChat._id ? { ...c, tags: newTags } : c));
    } catch (e) {}
  };

  const handleAddNewTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim() || !selectedChat) return;
    const tag = newTagInput.trim().replace(/\s+/g, '_');
    if (!allTags.includes(tag)) {
      const updatedCustom = [...customTags, tag];
      setCustomTags(updatedCustom);
      await api.patch('/stores/me', { customTags: updatedCustom });
    }
    await handleToggleTag(tag);
    setNewTagInput('');
  };

  // After editing a customer in the profile drawer, pull fresh CRM labels without touching loaded messages.
  const refreshCustomerLabels = async () => {
    const id = selectedChatRef.current?._id;
    if (!id) return;
    try {
      const { data } = await api.get<Conversation>(`/conversations/${id}`);
      const patch = { customerName: data.customerName, customerCategories: data.customerCategories, customerTags: data.customerTags };
      // The same customer can have threads on other channels or branches; refresh them all.
      const sameCustomer = (c: Conversation) => c._id === data._id || (Boolean(data.customerId) && c.customerId === data.customerId);
      setConversations((prev) => prev.map((c) => (sameCustomer(c) ? { ...c, ...patch } : c)));
      setSelectedChat((current) => (current && sameCustomer(current) ? { ...current, ...patch } : current));
    } catch {
      /* labels stay as they were */
    }
  };

  // Rethrows on failure so the composer can put the unsent text back.
  const sendText = async (text: string) => {
    if (!selectedChat) return;
    try {
      await api.post(`/conversations/${selectedChat._id}/messages`, { text });
    } catch (error: any) {
      showToast(error.response?.data?.message || error.message || 'فشل إرسال الرسالة', 'error');
      throw error;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return <FaWhatsapp size={14} className="text-green-500" />;
      case 'instagram': return <FaInstagram size={14} className="text-pink-500" />;
      case 'facebook': return <FaFacebook size={14} className="text-blue-600" />;
      case 'google_maps': return <FaMapMarkerAlt size={14} className="text-red-500" />;
      default: return <MessageCircle size={14} />;
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return <span title="عميل راضٍ" className="text-emerald-600 dark:text-emerald-400"><Smile size={16} /></span>;
      case 'negative': return <span title="عميل منزعج" className="text-red-600 dark:text-red-400"><Frown size={16} /></span>;
      default: return null;
    }
  };

  const renderMessageStatus = (msg: Message) => {
    if (msg.from !== 'me') return null;
    const status = msg.metadata?.status;
    if (status === 'failed') return <span className="flex items-center gap-1 text-[11px] font-bold text-red-100"><AlertTriangle size={13} /> فشل الإرسال</span>;
    if (status === 'read') return <span className="flex items-center gap-1 text-[11px]"><CheckCheck size={14} className="text-sky-300" /> مقروءة</span>;
    if (status === 'delivered') return <span className="flex items-center gap-1 text-[11px]"><CheckCheck size={14} /> وصلت</span>;
    if (status === 'sent') return <span className="flex items-center gap-1 text-[11px]"><Check size={13} /> أُرسلت</span>;
    return <span className="flex items-center gap-1 text-[11px]"><Check size={13} /> قيد الإرسال</span>;
  };

  const formatTag = (tag: string) => tag.replace(/_/g, ' ');

  const getTagColor = (tag: string) => {
    const map: any = {
      'استفسار_سعر': 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
      'طلب_جديد': 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
      'شكوى': 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
      'موقع_المحل': 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20',
      'سؤال_عام': 'bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 border-neutral-500/20',
      'VIP': 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 border-yellow-500/25'
    };
    return map[tag] || 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20';
  };

  const viewOf = (c: Conversation): StatusView => {
    const s = normalizeStatus(c, now);
    return s === 'snoozed' ? 'snoozed' : s === 'closed' ? 'closed' : 'active';
  };
  const needsReply = (c: Conversation) => c.awaitingReply ?? isCustomerMessage(c.messages?.[c.messages.length - 1]);
  // The server already filtered every loaded row; this only drops rows that local changes
  // (status change, read, realtime update) moved out of the current view. Search stays server-side.
  const filteredConversations = conversations.filter((c) =>
    viewOf(c) === statusView
    && (!selectedTag || Boolean(c.tags?.includes(selectedTag)))
    && (!selectedPlatform || c.platform === selectedPlatform)
    && (selectedStoreId === 'all' || c.storeId === selectedStoreId)
    && (listTab !== 'unread' || Number(c.unreadCount) > 0)
    && (listTab !== 'needs_reply' || needsReply(c)));
  const statusCounts: Record<StatusView, number> = { active: counts.active, snoozed: counts.snoozed, closed: counts.closed };
  const unreadTotal = counts.unread;
  const needsReplyTotal = counts.needsReply;

  const allTags = Array.from(new Set([...defaultTags, ...customTags]));

  const hasActiveFilters = Boolean(selectedTag || selectedPlatform || selectedStoreId !== 'all');
  const aiOn = selectedChat?.aiEnabled !== false;
  const filterOption = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 h-9 px-3 rounded-lg text-sm font-bold transition-colors cursor-pointer ${active ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-blue/10'}`;
  const filterHeading = 'text-xs font-black text-labbaik-text-muted flex items-center gap-2 mb-2';

  return (
    <div className="h-full min-h-0 flex bg-labbaik-surface overflow-hidden relative" dir="rtl">

      {/* Conversation list */}
      <div className={`${showMobileList ? 'flex' : 'hidden'} lg:flex w-full lg:w-[380px] border-l border-labbaik-border flex-col`}>
        <div className="px-4 pt-4 pb-3 border-b border-labbaik-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
              المحادثات
              {unreadTotal > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-labbaik-blue text-labbaik-on-accent tabular-nums">{unreadTotal} جديدة</span>}
            </h2>
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                aria-label="تصفية المحادثات"
                aria-expanded={showFilterDropdown}
                className={`relative grid h-10 w-10 place-items-center rounded-lg border transition-colors cursor-pointer ${hasActiveFilters ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue hover:border-labbaik-blue/40'}`}
              >
                <Filter size={18} />
                {hasActiveFilters && <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-labbaik-surface" />}
              </button>
              {showFilterDropdown && (
                <div className="absolute left-0 mt-2 w-72 bg-labbaik-surface border border-labbaik-border rounded-xl shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-[100] overflow-hidden animate-slide-up">
                  <div className="px-4 py-3 border-b border-labbaik-border flex justify-between items-center">
                    <span className="text-sm font-black text-neutral-800 dark:text-neutral-100">تصفية النتائج</span>
                    {hasActiveFilters && (
                      <button type="button" onClick={() => { setSelectedTag(null); setSelectedPlatform(null); setSelectedStoreId('all'); setShowFilterDropdown(false); }} className="text-xs font-black text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">مسح الكل</button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-3 space-y-4">
                    <div>
                      <span className={filterHeading}><Share2 size={13} /> القنوات</span>
                      <div className="space-y-0.5">
                        {platforms.map(p => (
                          <button type="button" key={p.id} onClick={() => setSelectedPlatform(selectedPlatform === p.id ? null : p.id)} aria-pressed={selectedPlatform === p.id} className={filterOption(selectedPlatform === p.id)}>
                            <span className="flex items-center gap-2">{p.icon} {p.name}</span>
                            {selectedPlatform === p.id && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className={filterHeading}><Layers size={13} /> الفروع</span>
                      <div className="space-y-0.5">
                        <button type="button" onClick={() => setSelectedStoreId('all')} aria-pressed={selectedStoreId === 'all'} className={filterOption(selectedStoreId === 'all')}>
                          جميع الفروع{selectedStoreId === 'all' && <Check size={14} />}
                        </button>
                        {stores.map(store => (
                          <button type="button" key={store.id} onClick={() => setSelectedStoreId(store.id)} aria-pressed={selectedStoreId === store.id} className={filterOption(selectedStoreId === store.id)}>
                            {store.name}{selectedStoreId === store.id && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className={filterHeading}><Tag size={13} /> الوسوم</span>
                      <div className="space-y-0.5">
                        {allTags.map(tag => (
                          <button type="button" key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} aria-pressed={selectedTag === tag} className={filterOption(selectedTag === tag)}>
                            {formatTag(tag)}{selectedTag === tag && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted group-focus-within:text-labbaik-blue transition-colors" size={16} />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم أو نص الرسالة..."
              aria-label="بحث في المحادثات"
              className="w-full h-10 bg-labbaik-page border border-labbaik-border rounded-lg pr-10 pl-9 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue transition-colors font-medium placeholder:text-labbaik-text-muted"
            />
            {searchText && (
              <button type="button" onClick={() => setSearchText('')} aria-label="مسح البحث" className="absolute left-1 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">
                <CloseIcon size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-labbaik-border bg-labbaik-page p-0.5" role="tablist" aria-label="حالة المحادثات">
            {([['active', 'المفتوحة'], ['snoozed', 'المؤجلة'], ['closed', 'المغلقة']] as const).map(([key, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={statusView === key}
                key={key}
                onClick={() => setStatusView(key)}
                className={`h-8 rounded-md text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${statusView === key ? 'bg-labbaik-surface text-labbaik-blue dark:text-purple-200 shadow-sm' : 'text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
              >
                {label}<span className="tabular-nums text-[11px] text-labbaik-text-muted">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="عرض المحادثات">
            {([['all', 'الكل', statusCounts[statusView]], ['unread', 'غير مقروءة', unreadTotal], ['needs_reply', 'تحتاج رداً', needsReplyTotal]] as const).map(([key, label, count]) => (
              <button
                type="button"
                role="tab"
                aria-selected={listTab === key}
                key={key}
                onClick={() => setListTab(key)}
                className={`h-8 px-3 rounded-full text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${listTab === key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'bg-labbaik-page text-labbaik-text-muted hover:text-labbaik-blue'}`}
              >
                {label}
                <span className={`tabular-nums text-[11px] px-1.5 rounded-full ${listTab === key ? 'bg-white/25' : 'bg-neutral-500/10'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div ref={listScrollRef} aria-busy={loading || loadingMore} className={`flex-1 overflow-y-auto custom-scrollbar transition-opacity ${loading && conversations.length > 0 ? 'opacity-60' : ''}`}>
          {loading && conversations.length === 0 ? <ConversationListSkeleton /> : listError === 'first' ? (
            <div className="p-10 text-center space-y-3">
              <AlertTriangle size={28} className="mx-auto text-labbaik-text-muted" />
              <p className="text-labbaik-text-muted font-bold text-sm">تعذر تحميل المحادثات.</p>
              <button type="button" onClick={() => setListReloadKey((k) => k + 1)} className="h-9 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 cursor-pointer">إعادة المحاولة</button>
            </div>
          ) : filteredConversations.length === 0 && !nextCursor ? (
            <div className="p-10 text-center space-y-3">
              <MessageCircle size={32} className="mx-auto text-labbaik-text-muted" />
              <p className="text-labbaik-text-muted font-bold text-sm">
                {statusView === 'snoozed' && listTab === 'all' ? 'لا توجد محادثات مؤجلة.' : statusView === 'closed' && listTab === 'all' ? 'لا توجد محادثات مغلقة.' : listTab === 'unread' ? 'لا توجد محادثات غير مقروءة.' : listTab === 'needs_reply' ? 'لا توجد محادثات تنتظر رداً.' : searchText || hasActiveFilters ? 'لا توجد محادثات تطابق البحث أو التصفية.' : 'لا توجد محادثات بعد.'}
              </p>
            </div>
          ) : filteredConversations.map((conv) => {
            const unread = Number(conv.unreadCount) > 0;
            const selected = selectedChat?._id === conv._id;
            const lastMsg = conv.messages?.[conv.messages.length - 1];
            const lastFromMe = lastMsg?.from === 'me';
            const waiting = needsReply(conv);
            return (
              <button
                type="button"
                key={conv._id}
                onClick={() => selectConversation(conv)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors border-b border-labbaik-border cursor-pointer
                  ${selected ? 'bg-labbaik-blue/12 dark:bg-labbaik-blue/25' : unread ? 'bg-labbaik-blue/5 dark:bg-labbaik-blue/10 hover:bg-labbaik-blue/10' : 'hover:bg-labbaik-page'}`}
              >
                <div className="relative shrink-0">
                  <CustomerAvatar name={conv.customerName} seed={conv.customerPhone} size={44} className="rounded-full" />
                  <span className="absolute -bottom-0.5 -left-0.5 bg-labbaik-surface rounded-full p-[3px] ring-1 ring-labbaik-border">{getPlatformIcon(conv.platform)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-sm truncate ${unread ? 'font-black text-neutral-900 dark:text-white' : 'font-bold text-neutral-800 dark:text-neutral-100'}`}>
                      {conv.customerName || <span dir="ltr" className="tabular-nums">{conv.customerPhone}</span>}
                    </h4>
                    <time
                      dateTime={conv.lastMessageAt}
                      title={safeFormatDate(conv.lastMessageAt, 'dd/MM/yyyy HH:mm')}
                      className={`text-[11px] shrink-0 tabular-nums ${unread ? 'text-labbaik-blue dark:text-purple-300 font-black' : 'text-labbaik-text-muted font-bold'}`}
                    >
                      {formatRelativeTime(conv.lastMessageAt, now)}
                    </time>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-xs truncate flex items-center gap-1 ${unread ? 'text-neutral-800 dark:text-neutral-100 font-bold' : 'text-labbaik-text-muted font-medium'}`}>
                      {lastFromMe && <span className={`shrink-0 ${lastMsg?.metadata?.status === 'read' ? 'text-sky-600 dark:text-sky-400' : lastMsg?.metadata?.status === 'failed' ? 'text-red-600 dark:text-red-400' : ''}`}>{lastMsg?.metadata?.status === 'failed' ? <AlertTriangle size={13} /> : ['delivered', 'read'].includes(lastMsg?.metadata?.status) ? <CheckCheck size={14} /> : <Check size={13} />}</span>}
                      <span className="truncate">{conv.lastMessage || '—'}</span>
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {normalizeStatus(conv, now) === 'pending' && <span className={`h-5 px-1.5 rounded-md text-[11px] font-bold leading-5 ${STATUS_META.pending.chip}`}>معلّقة</span>}
                      {normalizeStatus(conv, now) === 'snoozed' && <span title={`مؤجلة حتى ${formatSnoozeUntil(conv.snoozedUntil)}`} className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md text-[11px] font-bold tabular-nums ${STATUS_META.snoozed.chip}`}><Clock size={11} />{formatSnoozeUntil(conv.snoozedUntil)}</span>}
                      {waiting && statusView === 'active' && (
                        <span
                          title={`العميل ينتظر الرد ${formatRelativeTime(lastMsg?.timestamp || conv.lastMessageAt, now)}`}
                          className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-black tabular-nums"
                        >
                          <Clock size={11} />
                          {formatWait(lastMsg?.timestamp || conv.lastMessageAt, now)}
                        </span>
                      )}
                      {conv.lastSentiment === 'negative' && <span title="عميل منزعج" className="text-red-600 dark:text-red-400"><Frown size={14} /></span>}
                      {conv.aiEnabled === false && <span title="الرد الآلي متوقف" className="text-amber-600 dark:text-amber-400"><Bot size={14} /></span>}
                      {unread && <span className="min-w-5 h-5 px-1.5 rounded-full bg-labbaik-blue text-labbaik-on-accent text-[11px] font-black flex items-center justify-center tabular-nums">{Number(conv.unreadCount) > 99 ? '99+' : conv.unreadCount}</span>}
                    </div>
                  </div>

                  {(() => {
                    // Who the customer is, at a glance: branch → primary category → one tag → "+N" for the rest.
                    const cats = conv.customerCategories || [];
                    const ctags = conv.customerTags || [];
                    const shownCat = cats[0];
                    const shownTag = ctags[0];
                    const hidden = Math.max(0, cats.length - 1) + Math.max(0, ctags.length - 1);
                    const hiddenNames = [...cats.slice(1).map((c) => c.name), ...ctags.slice(1).map((t) => `#${t.name}`)].join('، ');
                    const hasRow = stores.length > 1 || shownCat || shownTag || (conv.tags?.length || 0) > 0;
                    if (!hasRow) return null;
                    return (
                      <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                        {stores.length > 1 && (
                          <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-labbaik-page text-[11px] font-bold text-labbaik-text-muted shrink-0 max-w-28 truncate" title={`الفرع: ${getStoreName(conv.storeId)}`}>
                            <Building2 size={11} className="shrink-0" /><span className="truncate">{getStoreName(conv.storeId)}</span>
                          </span>
                        )}
                        {shownCat && <CustomerLabelChip label={shownCat} kind="category" />}
                        {shownTag && <CustomerLabelChip label={shownTag} kind="tag" />}
                        {hidden > 0 && <span className="text-[11px] font-bold text-labbaik-text-muted shrink-0" title={hiddenNames}>+{hidden}</span>}
                        {conv.tags?.slice(0, 1).map(tag => <span key={tag} title="وسم المحادثة" className={`h-5 px-1.5 rounded text-[11px] font-bold leading-5 shrink-0 ${getTagColor(tag)}`}>{formatTag(tag)}</span>)}
                      </div>
                    );
                  })()}
                </div>
              </button>
            );
          })}
          {nextCursor && listError !== 'first' && (
            <div ref={listSentinelRef} className="flex flex-col items-center gap-2 px-4 py-4">
              {listError === 'more' ? (
                <>
                  <p className="text-xs font-bold text-labbaik-text-muted">تعذر تحميل المزيد.</p>
                  <button type="button" onClick={() => void loadMore()} className="h-8 px-3 rounded-lg border border-labbaik-border text-xs font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 cursor-pointer">إعادة المحاولة</button>
                </>
              ) : loadingMore ? (
                <span className="flex items-center gap-2 text-xs font-bold text-labbaik-text-muted"><Loader2 size={14} className="animate-spin" /> جاري تحميل المزيد...</span>
              ) : (
                <button type="button" onClick={() => void loadMore()} className="h-8 px-3 rounded-lg text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer">تحميل المزيد</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat pane */}
      <div className={`${!showMobileList ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 flex-col bg-labbaik-chat`}>
        {selectedChat ? (
          <>
            <div className="min-h-16 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 border-b border-labbaik-border bg-labbaik-surface">
              <div className="flex items-center gap-3 min-w-0">
                <button type="button" onClick={() => setShowMobileList(true)} aria-label="العودة إلى المحادثات" className="lg:hidden grid h-10 w-10 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><ChevronRight size={22} /></button>
                <CustomerAvatar name={selectedChat.customerName} seed={selectedChat.customerPhone} size={42} className="rounded-full" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-black text-sm text-neutral-900 dark:text-white truncate">{selectedChat.customerName || <span dir="ltr" className="tabular-nums">{selectedChat.customerPhone}</span>}</h3>
                    {selectedChat.customerName && <span className="hidden sm:inline text-xs font-bold text-labbaik-text-muted tabular-nums" dir="ltr">{selectedChat.customerPhone}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* Customer profile: branch, categories, tags. Clicking opens the profile to change them. */}
                    {stores.length > 1 && (
                      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-labbaik-page text-xs font-bold text-labbaik-text-muted" title="فرع العميل">
                        <Building2 size={12} />{getStoreName(selectedChat.storeId)}
                      </span>
                    )}
                    {selectedChat.customerId ? (
                      <button
                        type="button"
                        onClick={() => setShowProfile(true)}
                        title="فئات العميل وتاقاته، اضغط للتعديل"
                        className="inline-flex items-center gap-1 flex-wrap rounded-md p-0.5 -m-0.5 hover:bg-labbaik-blue/10 transition-colors cursor-pointer"
                      >
                        {(selectedChat.customerCategories || []).map((c) => <CustomerLabelChip key={c.id} label={c} kind="category" size="md" />)}
                        {(selectedChat.customerTags || []).map((t) => <CustomerLabelChip key={t.id} label={t} kind="tag" size="md" />)}
                        {!(selectedChat.customerCategories?.length || selectedChat.customerTags?.length) && (
                          <span className="inline-flex items-center gap-1 h-6 px-1.5 text-xs font-bold text-labbaik-text-muted"><FolderOpen size={12} /> تصنيف العميل</span>
                        )}
                      </button>
                    ) : null}
                    <span className="mx-0.5 h-4 w-px bg-labbaik-border" aria-hidden="true" />
                    {selectedChat.tags?.map(tag => (<span key={tag} title="وسم المحادثة" className={`h-6 px-1.5 rounded text-[11px] font-bold leading-6 ${getTagColor(tag)}`}>{formatTag(tag)}</span>))}
                    <button type="button" onClick={() => setShowTagEditor(true)} aria-label="وسوم المحادثة" title="وسوم المحادثة" className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 transition-colors cursor-pointer">
                      <Plus size={12} />{!selectedChat.tags?.length && 'وسم المحادثة'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusMenu status={normalizeStatus(selectedChat, now)} snoozedUntil={selectedChat.snoozedUntil} busy={statusBusy} onChange={(next, until) => void changeStatus(next, until)} />
                <button
                  type="button"
                  onClick={toggleAi}
                  aria-pressed={aiOn}
                  title={aiOn ? 'إيقاف الرد الآلي لهذه المحادثة' : 'تشغيل الرد الآلي لهذه المحادثة'}
                  className={`inline-flex items-center gap-2 h-10 px-3 rounded-lg border text-xs font-black transition-colors cursor-pointer ${aiOn ? 'bg-labbaik-blue/10 border-labbaik-blue/30 text-labbaik-blue dark:text-purple-200' : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${aiOn ? 'bg-labbaik-blue dark:bg-purple-300' : 'bg-red-500'}`} />
                  <span className="hidden sm:inline">{aiOn ? 'الرد الآلي يعمل' : 'الرد الآلي متوقف'}</span>
                </button>
                {selectedChat.customerId && (
                  <button
                    type="button"
                    onClick={() => setShowProfile(!showProfile)}
                    aria-label="ملف العميل"
                    aria-pressed={showProfile}
                    title="ملف العميل"
                    className={`grid h-10 w-10 place-items-center rounded-lg border transition-colors cursor-pointer ${showProfile ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue hover:border-labbaik-blue/40'}`}
                  >
                    <Contact size={18} />
                  </button>
                )}
              </div>
            </div>
            <div
              ref={messagesScrollRef}
              onScroll={(e) => { if (e.currentTarget.scrollTop < 120) void loadOlderRef.current(); }}
              aria-busy={messagesLoading || loadingOlder}
              className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-2.5 custom-scrollbar"
            >
              {hasOlderMessages && (
                <div className="flex justify-center pb-1">
                  {loadingOlder ? (
                    <span className="flex items-center gap-2 text-xs font-bold text-labbaik-text-muted"><Loader2 size={14} className="animate-spin" /> جاري تحميل الرسائل الأقدم...</span>
                  ) : (
                    <button type="button" onClick={() => void loadOlderMessages()} className="h-8 px-3 rounded-full bg-labbaik-surface text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue cursor-pointer">تحميل رسائل أقدم</button>
                  )}
                </div>
              )}
              {messagesLoading && (
                <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-labbaik-text-muted" /><span className="sr-only">جاري تحميل الرسائل...</span></div>
              )}
              {messagesError && (
                <div className="py-10 text-center text-sm font-bold text-labbaik-text-muted">تعذر تحميل الرسائل. أعد فتح المحادثة للمحاولة مجددًا.</div>
              )}
              {messages.map((msg, idx) => (
                msg.type === 'system_error' ? (
                  <div key={msg._id || `live-${msg.timestamp}-${idx}`} className="flex justify-center py-1">
                    <div role="alert" className="max-w-[90%] rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-red-800 dark:text-red-200">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <div className="space-y-0.5 text-right">
                          <p className="text-xs font-black">تنبيه إرسال واتساب</p>
                          <p className="text-xs font-medium leading-6">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                <div key={msg._id || `live-${msg.timestamp}-${idx}`} className={`flex ${msg.from === 'me' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] lg:max-w-[65%] px-3.5 py-2.5 rounded-2xl ${msg.from === 'me' ? 'bg-labbaik-blue text-labbaik-on-accent rounded-tr-sm' : 'bg-labbaik-surface text-neutral-900 dark:text-white rounded-tl-sm'}`}>
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                      {msg.from !== 'me' && getSentimentIcon(msg.sentiment)}
                    </div>
                    <MessageExtras msg={msg} />
                    <div className={`flex items-center gap-2 mt-1 ${msg.from === 'me' ? 'justify-start text-white/80' : 'justify-end text-labbaik-text-muted'}`}>
                      <span className="text-[11px] font-bold tabular-nums">{safeFormatDate(msg.timestamp || Date.now(), 'HH:mm')}</span>
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                </div>
                )
              ))}
            </div>
            <div className="px-4 lg:px-6 py-3 border-t border-labbaik-border bg-labbaik-surface">
              <Composer key={selectedChat._id} onSend={sendText} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <Inbox size={44} strokeWidth={1.5} className="text-labbaik-text-muted mb-3" />
            <p className="text-sm font-bold text-labbaik-text-muted">اختر محادثة من القائمة</p>
          </div>
        )}
      </div>

      {selectedChat && showProfile && selectedChat.customerId && (
        <CustomerProfile
          customerId={selectedChat.customerId}
          onClose={() => setShowProfile(false)}
          onUpdated={() => void refreshCustomerLabels()}
        />
      )}

      {showTagEditor && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tag-editor-title" onKeyDown={(e) => { if (e.key === 'Escape') setShowTagEditor(false); }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTagEditor(false)} />
          <div className="relative bg-labbaik-surface border border-labbaik-border p-6 rounded-2xl shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] w-full max-w-lg animate-slide-up space-y-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h4 id="tag-editor-title" className="text-lg font-black text-neutral-900 dark:text-white">وسوم المحادثة</h4>
                <p className="text-labbaik-text-muted text-sm mt-1">اختر وسمًا لتفعيله أو إلغائه، أو أنشئ وسمًا جديدًا.</p>
              </div>
              <button type="button" onClick={() => setShowTagEditor(false)} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white hover:bg-labbaik-page transition-colors cursor-pointer"><CloseIcon size={20} /></button>
            </div>
            <form onSubmit={handleAddNewTag} className="space-y-2">
              <label htmlFor="new-tag" className="text-sm font-bold text-neutral-700 dark:text-neutral-200">وسم جديد</label>
              <div className="relative group">
                <Hash className="absolute right-3.5 top-1/2 -translate-y-1/2 text-labbaik-text-muted group-focus-within:text-labbaik-blue transition-colors" size={16} />
                <input id="new-tag" autoFocus type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="اكتب اسم الوسم ثم اضغط Enter" className="w-full h-11 bg-labbaik-page border border-labbaik-border rounded-lg pr-10 pl-4 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/40 focus:border-labbaik-blue transition-colors font-medium placeholder:text-labbaik-text-muted" />
              </div>
            </form>
            <div className="space-y-2">
              <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">الوسوم المتوفرة</span>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                {allTags.map(tag => {
                  const active = Boolean(selectedChat?.tags?.includes(tag));
                  return (
                    <button type="button" key={tag} onClick={() => handleToggleTag(tag)} aria-pressed={active} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-bold transition-colors cursor-pointer ${active ? 'border-labbaik-blue bg-labbaik-blue text-labbaik-on-accent' : 'border-labbaik-border text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40'}`}>
                      {active && <Check size={14} />} {formatTag(tag)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
