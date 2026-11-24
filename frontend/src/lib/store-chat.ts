import api from '../api/client';

/** Mkhzin store chats, proxied by the backend (/store-chat/*); the store token never reaches the browser. */

export interface StoreChatCustomer {
  customerId: string;
  totalMessagesCount: number;
  unreadCount: number;
  hasUnread: boolean;
  lastMessageAt: string | null;
  customer: { firstName: string | null; lastName: string | null; phone: string | null } | null;
  /** Latest real message (the automatic welcome is skipped). Missing on store servers not yet updated. */
  lastMessage?: {
    senderType: 'CUSTOMER' | 'EMPLOYEE';
    content: string;
    createdAt: string;
    senderName: string | null;
  } | null;
}

export type ChatState = 'unread' | 'needsReply' | 'replied';

/**
 * unread: the customer wrote and nobody opened it yet.
 * needsReply: opened, but the last real message is still the customer's.
 * replied: the team answered last.
 */
export function chatState(c: StoreChatCustomer): ChatState {
  if (c.unreadCount > 0) return 'unread';
  if (c.lastMessage === undefined) return 'replied'; // older store server: only read/unread is known
  return c.lastMessage?.senderType === 'CUSTOMER' ? 'needsReply' : 'replied';
}

/** "5د" / "3س" / "2ي" since a date, for the waiting badge. */
export function formatWait(value: string | null | undefined, now = Date.now()) {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `${minutes}د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}س`;
  return `${Math.floor(hours / 24)}ي`;
}

export interface StoreChatMessage {
  id: string;
  customerId: string;
  senderType: 'CUSTOMER' | 'EMPLOYEE';
  content: string;
  isRead: boolean;
  createdAt: string;
  isVirtual?: boolean;
  /** Who wrote an employee message: the platform member's name, or the store employee's name. */
  senderDisplayName?: string | null;
  senderName?: string | null;
}

export interface StoreChatMessagesPage {
  messages: StoreChatMessage[];
  nextCursor: string | null;
}

export type PickingStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'COMPLETED_WITH_SHORTAGE' | 'CANCELLED';
export type CheckingStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'COMPLETED_WITH_ISSUES' | 'CANCELLED';
export type ReviewStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StoreFulfillment {
  pickingStatus: PickingStatus;
  checkingStatus: CheckingStatus;
  reviewStatus: ReviewStatus;
  isReadyForDispatch: boolean;
  unitsRequired?: number;
  unitsPicked?: number;
  shortageUnits?: number;
  mismatchCount?: number;
  pickerName?: string | null;
  checkerName?: string | null;
  activeSubstitutions?: number;
  shortageReturns?: number;
  itemsCount?: number;
}

export interface StoreShipment {
  shipmentId: string;
  orderNumber: string | null;
  status: string;
  deliveryMethod: string;
  deliveryMethodAr?: string;
  assigneeName: string | null;
  /** Internal courier's phone; external carriers have none. */
  assigneePhone?: string | null;
  createdAt: string;
  itemsCount: number;
  isScheduledOrder?: boolean;
  /** The customer's chosen delivery window; null for standard orders (missing on older store servers). */
  scheduledDelivery?: {
    date: string | null;
    startAt: string | null;
    endAt: string | null;
    label: string | null;
  } | null;
  address?: { city: string | null; district: string | null; street: string | null };
  fulfillment?: StoreFulfillment | null;
  customerFirstName?: string | null;
  customerPhone?: string | null;
  customerDeliveredOrdersCount?: number;
  /** grams */
  weight?: number;
  distanceKm?: number | null;
}

export interface StoreReturnItem { productName: string; sku: string; quantity: number; total: number }

export interface StoreReturn {
  returnRequestId: string;
  orderId?: string | null;
  orderNumber: string | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REFUND_PROCESSED' | string;
  statusAr: string;
  source?: string;
  sourceAr: string;
  reason?: string | null;
  reasonAr: string | null;
  notes?: string | null;
  reviewNotes?: string | null;
  requestedAt: string;
  createdAt?: string;
  itemsCount: number;
  totalQuantity: number;
  totalAmount: number;
  items: StoreReturnItem[];
  attachments: string[];
  deliveryReceived: boolean;
}

export interface Paged<T> {
  currentPage: number;
  totalPages: number;
  totalDocuments: number;
  data: T[];
}

export interface ReturnsPage extends Paged<StoreReturn> {
  summary: { totalReturns: number; totalAmount: number; byStatus: Record<string, number> };
}

export interface StoreBranch { key: string; label: string }
export interface StoreChatStatus { enabled: boolean; branches: StoreBranch[] }

/** Every call names the branch (store server) it goes to; the backend holds each branch's URL. */
export const storeChatApi = {
  status: () =>
    api.get<StoreChatStatus>('/store-chat/status').then((r) => ({ enabled: Boolean(r.data?.enabled), branches: Array.isArray(r.data?.branches) ? r.data.branches : [] })),
  unreadTotal: (branch: string) =>
    api.get<{ unreadTotalCount: number }>('/store-chat/unread-total-count', { params: { branch } }).then((r) => r.data.unreadTotalCount ?? 0),
  customers: (branch: string) =>
    api.get<StoreChatCustomer[]>('/store-chat/customers', { params: { branch } }).then((r) => (Array.isArray(r.data) ? r.data : [])),
  messages: (branch: string, customerId: string, cursor?: string) =>
    api.get<StoreChatMessagesPage>('/store-chat/messages', { params: { branch, customerId, cursor, limit: 30 } }).then((r) => r.data),
  send: (branch: string, customerId: string, content: string) =>
    api.post<StoreChatMessage>('/store-chat/messages', { branch, customerId, content }).then((r) => r.data),
  shipments: (branch: string, customerId: string, page = 1) =>
    api.get<Paged<StoreShipment>>('/store-chat/customer-shipments', { params: { branch, customerId, page, pageSize: 10 } }).then((r) => r.data),
  returns: (branch: string, customerId: string, page = 1) =>
    api.get<ReturnsPage>('/store-chat/customer-returns', { params: { branch, customerId, page, pageSize: 10 } }).then((r) => r.data),
};

const BRANCH_KEY = 'store_chat_branch';
export const readSavedBranch = () => { try { return localStorage.getItem(BRANCH_KEY); } catch { return null; } };
export const saveBranch = (key: string) => { try { localStorage.setItem(BRANCH_KEY, key); } catch { /* storage unavailable */ } };

export const customerName = (c: StoreChatCustomer) =>
  [c.customer?.firstName, c.customer?.lastName].filter(Boolean).join(' ').trim() || c.customer?.phone || 'عميل بدون اسم';

export const SHIPMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'قيد الانتظار', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  ASSIGNED: { label: 'تم التعيين', cls: 'bg-sky-500/12 text-sky-800 dark:text-sky-300' },
  IN_TRANSIT: { label: 'جارٍ الشحن', cls: 'bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200' },
  OUT_FOR_DELIVERY: { label: 'في الطريق', cls: 'bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200' },
  DELIVERED: { label: 'تم التسليم', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
  FAILED_ATTEMPT: { label: 'محاولة فاشلة', cls: 'bg-red-500/15 text-red-800 dark:text-red-300' },
  CANCELLED: { label: 'ملغي', cls: 'bg-red-500/15 text-red-800 dark:text-red-300' },
};

export const RETURN_STATUS_CLS: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  APPROVED: 'bg-sky-500/12 text-sky-800 dark:text-sky-300',
  REFUND_PROCESSED: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  REJECTED: 'bg-red-500/15 text-red-800 dark:text-red-300',
};

const PICK_DONE: PickingStatus[] = ['COMPLETED', 'COMPLETED_WITH_SHORTAGE'];

/** One label for picking + checking + review, in the order the store's own dashboard shows them. */
export function fulfillmentStage(f?: StoreFulfillment | null): { label: string; cls: string } {
  const neutral = 'bg-labbaik-page text-labbaik-text-muted';
  if (!f) return { label: 'لم يبدأ التجهيز', cls: neutral };
  const issues = f.pickingStatus === 'COMPLETED_WITH_SHORTAGE' || f.checkingStatus === 'COMPLETED_WITH_ISSUES' || (f.shortageUnits ?? 0) > 0 || (f.mismatchCount ?? 0) > 0;
  const substitutes = (f.activeSubstitutions ?? 0) > 0;
  if (f.pickingStatus === 'CANCELLED') return { label: 'التجهيز ملغي', cls: 'bg-red-500/15 text-red-800 dark:text-red-300' };
  if (f.reviewStatus === 'REJECTED') return { label: 'أُعيد للمجهز', cls: 'bg-red-500/15 text-red-800 dark:text-red-300' };
  if (f.pickingStatus === 'IN_PROGRESS' && substitutes) return { label: 'قيد تجهيز البديل', cls: 'bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200' };
  if (f.isReadyForDispatch) {
    const extras = [issues && 'نواقص معتمدة', substitutes && 'ببديل'].filter(Boolean);
    return { label: extras.length ? `جاهز للشحن · ${extras.join(' · ')}` : 'جاهز للشحن', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' };
  }
  if (f.checkingStatus === 'IN_PROGRESS') return { label: 'قيد التشييك', cls: 'bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200' };
  if (f.reviewStatus === 'PENDING') return { label: 'بانتظار مراجعة النواقص', cls: 'bg-orange-500/15 text-orange-800 dark:text-orange-300' };
  if (PICK_DONE.includes(f.pickingStatus)) return { label: issues ? 'بانتظار التشييك · نواقص' : 'بانتظار التشييك', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' };
  if (f.pickingStatus === 'IN_PROGRESS') {
    const progress = f.unitsRequired ? ` ${f.unitsPicked ?? 0}/${f.unitsRequired}` : '';
    return { label: `قيد التجهيز${progress}`, cls: 'bg-sky-500/12 text-sky-800 dark:text-sky-300' };
  }
  return { label: 'بانتظار التجهيز', cls: neutral };
}

// Store times are Saudi time whatever the viewer's device says.
const STORE_TZ = 'Asia/Riyadh';
const LOCALE = 'ar-u-ca-gregory-nu-latn';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ }).format(d);
const timeOf = (d: Date) => new Intl.DateTimeFormat(LOCALE, { timeZone: STORE_TZ, hour: 'numeric', minute: '2-digit' }).format(d);
const valid = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * A scheduled order's delivery window, ready to show:
 * relative ("اليوم" / "غداً" / "أمس" / weekday + date), the full date, and the time range.
 */
export function scheduleInfo(s: StoreShipment, now = new Date()) {
  const sd = s.scheduledDelivery;
  if (!s.isScheduledOrder && !sd) return null;
  const start = valid(sd?.startAt) || valid(sd?.date);
  const end = valid(sd?.endAt);
  if (!start) return { relative: null, fullDate: null, timeRange: sd?.label || null, label: sd?.label || null, isPast: false };

  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 3600 * 1000));
  const yesterday = dayKey(new Date(now.getTime() - 24 * 3600 * 1000));
  const key = dayKey(start);
  const fullDate = new Intl.DateTimeFormat(LOCALE, { timeZone: STORE_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(start);
  const shortDate = new Intl.DateTimeFormat(LOCALE, { timeZone: STORE_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(start);
  const relative = key === today ? 'اليوم' : key === tomorrow ? 'غداً' : key === yesterday ? 'أمس' : shortDate;
  const hasTime = Boolean(sd?.startAt);
  const timeRange = hasTime ? (end ? `${timeOf(start)} – ${timeOf(end)}` : timeOf(start)) : sd?.label || null;

  return { relative, fullDate, timeRange, label: sd?.label || null, isPast: (end || start).getTime() < now.getTime() };
}

export const PICKING_LABELS: Record<PickingStatus, string> = {
  PENDING: 'بانتظار التجهيز',
  IN_PROGRESS: 'قيد التجهيز',
  COMPLETED: 'مكتمل',
  COMPLETED_WITH_SHORTAGE: 'مكتمل مع نواقص',
  CANCELLED: 'ملغي',
};

export const CHECKING_LABELS: Record<CheckingStatus, string> = {
  PENDING: 'بانتظار التشييك',
  IN_PROGRESS: 'قيد التشييك',
  COMPLETED: 'مكتمل',
  COMPLETED_WITH_ISSUES: 'مكتمل مع ملاحظات',
  CANCELLED: 'ملغي',
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  NOT_REQUIRED: 'لا تحتاج مراجعة',
  PENDING: 'بانتظار المراجعة',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
};

/** Axios error → the server's Arabic message when there is one. */
export const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: unknown } } })?.response?.data;
  const message = Array.isArray(data?.message) ? data?.message[0] : data?.message;
  return typeof message === 'string' && message ? message : fallback;
};
