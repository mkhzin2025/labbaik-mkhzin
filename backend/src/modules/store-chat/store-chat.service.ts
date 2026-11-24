import { BadGatewayException, ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, Method } from 'axios';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoreBranch {
  key: string;
  label: string;
  baseUrl: string;
}

export interface NeedsReplyCount { total: number; branches: Record<string, number> }

/** Shared by every viewer for this long, so many open sidebars cost one round of store calls. */
const NEEDS_REPLY_TTL_MS = 20_000;

type ChatCustomer = { unreadCount?: number; lastMessage?: { senderType?: string } | null };

/** Unread, or opened but the customer still has the last word (same rule as the store chats page). */
const needsReply = (c: ChatCustomer) => (Number(c.unreadCount) || 0) > 0 || c.lastMessage?.senderType === 'CUSTOMER';

/** Accepts the URL with or without a trailing "/admin" (the routes are appended as /admin/chat/...). */
const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/admin$/i, '');

/**
 * Proxy to the Mkhzin store chat API (/admin/chat/*). The static token lives only here (env), never in the
 * browser, and only the organizations listed in MKHZIN_STORE_ORG_IDS can reach it.
 */
@Injectable()
export class StoreChatService {
  private readonly logger = new Logger(StoreChatService.name);
  private needsReplyCache: { at: number; value: Promise<NeedsReplyCount> } | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * MKHZIN_STORE_BRANCHES = "key|label|url,key|label|url" (one token for all of them).
   * Falls back to a single branch from MKHZIN_STORE_API_URL.
   */
  get branches(): StoreBranch[] {
    const raw = (this.config.get<string>('MKHZIN_STORE_BRANCHES') || '').trim();
    if (raw) {
      return raw
        .split(',')
        .map((entry) => entry.split('|').map((part) => part.trim()))
        .filter(([key, label, url]) => key && label && /^https?:\/\//i.test(url || ''))
        .map(([key, label, url]) => ({ key, label, baseUrl: normalizeBaseUrl(url) }));
    }
    const single = normalizeBaseUrl(this.config.get<string>('MKHZIN_STORE_API_URL') || '');
    return single ? [{ key: 'main', label: 'المتجر', baseUrl: single }] : [];
  }

  /** The requested branch, or the first one when none is given. */
  branch(key?: string | null): StoreBranch {
    const list = this.branches;
    const found = key ? list.find((b) => b.key === key) : list[0];
    if (!found) throw new HttpException('الفرع غير موجود', 400);
    return found;
  }

  private get token() {
    return (this.config.get<string>('MKHZIN_STORE_API_TOKEN') || '').trim();
  }

  private get allowedOrganizations() {
    return (this.config.get<string>('MKHZIN_STORE_ORG_IDS') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  /** Configured, and the caller's organization is one of the allowed ones. */
  isEnabledFor(organizationId?: string | null) {
    return Boolean(this.branches.length && this.token && organizationId && this.allowedOrganizations.includes(organizationId));
  }

  assertEnabled(organizationId?: string | null) {
    if (!this.isEnabledFor(organizationId)) throw new ForbiddenException('محادثات المتجر غير مفعّلة لهذه المنشأة.');
  }

  static assertUuid(value: unknown, name = 'customerId'): string {
    const v = String(value ?? '').trim();
    if (!UUID.test(v)) throw new HttpException(`${name} غير صالح`, 400);
    return v;
  }

  static pageParams(query: Record<string, unknown>) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.pageSize) || 10)));
    return { page, pageSize };
  }

  async request<T = unknown>(
    branchKey: string | undefined,
    method: Method,
    path: string,
    options: { params?: Record<string, unknown>; data?: unknown } = {},
  ): Promise<T> {
    const branch = this.branch(branchKey);
    try {
      const { data } = await axios.request({
        method,
        url: `${branch.baseUrl}/admin/chat${path}`,
        params: options.params,
        data: options.data,
        headers: { 'x-api-key': this.token, Accept: 'application/json' },
        timeout: 15000,
      });
      // The store wraps every answer as { data, message, ... }
      return (data?.data ?? data) as T;
    } catch (error) {
      const err = error as AxiosError<{ message?: string }>;
      const status = err.response?.status;
      this.logger.warn(`Store chat [${branch.key}] ${method} ${path} failed: ${status ?? err.code} ${err.response?.data?.message ?? err.message}`);
      if (status && status < 500 && status !== 401 && status !== 403) {
        throw new HttpException(err.response?.data?.message || 'طلب غير صالح', status);
      }
      // 401/403 here mean the platform's token is wrong — not the user's fault
      throw new BadGatewayException(`تعذر الاتصال بخادم فرع ${branch.label}. حاول مرة أخرى بعد قليل.`);
    }
  }

  /** Chats waiting on the team in every branch; a branch that is down counts as 0 instead of failing the badge. */
  needsReplyCount(): Promise<NeedsReplyCount> {
    if (this.needsReplyCache && Date.now() - this.needsReplyCache.at < NEEDS_REPLY_TTL_MS) return this.needsReplyCache.value;
    const value = Promise.all(this.branches.map(async (branch) => {
      try {
        const list = await this.request<ChatCustomer[]>(branch.key, 'GET', '/customers-with-unread');
        return [branch.key, StoreChatService.countNeedsReply(list)] as const;
      } catch {
        return [branch.key, 0] as const;
      }
    })).then((entries) => ({ total: entries.reduce((sum, [, n]) => sum + n, 0), branches: Object.fromEntries(entries) }));
    this.needsReplyCache = { at: Date.now(), value };
    return value;
  }

  static countNeedsReply(list: unknown): number {
    return Array.isArray(list) ? list.filter((c) => c && needsReply(c as ChatCustomer)).length : 0;
  }
}
