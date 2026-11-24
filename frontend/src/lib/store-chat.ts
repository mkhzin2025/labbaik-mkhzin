import api from '../api/client';

/** Mkhzin store chats, proxied by the backend (/store-chat/*); the store token never reaches the browser. */

export interface StoreChatCustomer {
  customerId: string;
  totalMessagesCount: number;
  unreadCount: number;
  hasUnread: boolean;
  lastMessageAt: string | null;
  customer: { firstName: string | null; lastName: string | null; phone: string | null } | null;
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
}

export interface StoreShipment {
  shipmentId: string;
  orderNumber: string | null;
  status: string;
  deliveryMethod: string;
  deliveryMethodAr?: string;
  assigneeName: string | null;
  createdAt: string;
  itemsCount: number;
  isScheduledOrder?: boolean;
  address?: { city: string | null; district: string | null; street: string | null };
  fulfillment?: StoreFulfillment | null;
}

export interface StoreReturnItem { productName: string; sku: string; quantity: number; total: number }

export interface StoreReturn {
  returnRequestId: string;
  orderNumber: string | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REFUND_PROCESSED' | string;
  statusAr: string;
  sourceAr: string;
  reasonAr: string | null;
  requestedAt: string;
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

/** Axios error → the server's Arabic message when there is one. */
export const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: unknown } } })?.response?.data;
  const message = Array.isArray(data?.message) ? data?.message[0] : data?.message;
  return typeof message === 'string' && message ? message : fallback;
};
