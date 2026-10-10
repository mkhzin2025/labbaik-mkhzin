import { Injectable, Logger, NotFoundException, InternalServerErrorException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationStatus } from './schemas/conversation.schema';
import { MessagingService } from '../channels/messaging.service';
import { ChannelsService } from '../channels/channels.service';
import { CustomersService } from '../customers/customers.service';
import { EventsGateway } from '../events/events.gateway';
import { BillingService } from '../billing/billing.service';
import { MetaUsageType } from '../billing/entities/pricing-rule.entity';
import { normalizePhoneNumber } from '../../common/utils/phone.util';

export type InboxView = 'active' | 'snoozed' | 'closed';
export type InboxTab = 'all' | 'unread' | 'needs_reply';
export interface InboxFilters {
  view?: InboxView;
  tab?: InboxTab;
  platform?: string;
  tag?: string;
  search?: string;
}

const INBOX_PAGE_DEFAULT = 30;
const INBOX_PAGE_MAX = 100;
const MESSAGES_PAGE_DEFAULT = 30;
const MESSAGES_PAGE_MAX = 100;

const clampLimit = (value: number | undefined, fallback: number, max: number) =>
  Number.isFinite(value) && (value as number) > 0 ? Math.min(Math.floor(value as number), max) : fallback;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Opaque keyset cursor: the (lastMessageAt, _id) of the last row on the previous page.
const encodeCursor = (lastMessageAt: Date | null | undefined, id: string) =>
  Buffer.from(JSON.stringify({ t: lastMessageAt ? new Date(lastMessageAt).toISOString() : null, id })).toString('base64url');

const decodeCursor = (cursor: string): { t: Date | null; id: Types.ObjectId } => {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const time = t === null ? null : new Date(t);
    if (time && Number.isNaN(time.getTime())) throw new Error('bad time');
    return { t: time, id: new Types.ObjectId(String(id)) };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
};

// Rows strictly after the cursor in (lastMessageAt desc, _id desc) order; rows without lastMessageAt sort last.
const afterCursor = ({ t, id }: { t: Date | null; id: Types.ObjectId }) =>
  t === null
    ? { lastMessageAt: null, _id: { $lt: id } }
    : { $or: [{ lastMessageAt: { $lt: t } }, { lastMessageAt: t, _id: { $lt: id } }, { lastMessageAt: null }] };

@Injectable()
export class ConversationsService implements OnModuleInit {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    private readonly messagingService: MessagingService,
    private readonly channelsService: ChannelsService,
    private readonly customersService: CustomersService,
    private readonly eventsGateway: EventsGateway,
    private readonly billingService: BillingService,
  ) {}

  async onModuleInit() {
    try {
      await this.mergeDuplicateWhatsAppConversations();
      // Remove the old "AI reply failed" system notes; auto-reply now stops silently instead.
      await this.conversationModel.updateMany(
        { 'messages.type': 'system_error', 'messages.text': /^تعذر توليد رد تلقائي/ },
        { $pull: { messages: { type: 'system_error', text: /^تعذر توليد رد تلقائي/ } } } as any,
      );
      const stalePreviews = await this.conversationModel.find({ lastMessage: /^تعذر توليد رد تلقائي/ }).exec();
      for (const conv of stalePreviews) {
        const last = conv.messages?.[conv.messages.length - 1];
        await this.conversationModel.updateOne({ _id: conv._id }, { $set: { lastMessage: last?.text || '' } });
      }
    } catch (error) {
      this.logger.error('Failed to merge duplicate WhatsApp conversations', error?.stack);
    }
    try {
      await this.backfillAwaitingReply();
    } catch (error) {
      this.logger.error('Failed to backfill awaitingReply', error?.stack);
    }
  }

  /** One-off for conversations stored before `awaitingReply` existed: derive it from the last message. */
  private async backfillAwaitingReply() {
    const last = { $arrayElemAt: ['$messages', -1] };
    await this.conversationModel.updateMany(
      { awaitingReply: { $exists: false } },
      [{
        $set: {
          awaitingReply: {
            $and: [
              { $gt: [{ $size: { $ifNull: ['$messages', []] } }, 0] },
              { $not: [{ $in: [{ $getField: { field: 'from', input: last } }, ['me', 'system']] }] },
              { $ne: [{ $getField: { field: 'type', input: last } }, 'system_error'] },
            ],
          },
        },
      }],
      { updatePipeline: true },
    );
  }

  private static isCustomerMessage(message: { from?: string; type?: string }) {
    return message.from !== 'me' && message.from !== 'system' && message.type !== 'system_error';
  }

  private normalizeCustomerPhone(customerPhone: string, platform: string) {
    return platform === 'whatsapp' ? normalizePhoneNumber(customerPhone) : customerPhone;
  }

  /**
   * Merges WhatsApp conversations saved under a local number format (e.g. 05XXXXXXXX)
   * into the conversation for the international number, so one number shows as one conversation.
   */
  async mergeDuplicateWhatsAppConversations() {
    const candidates = await this.conversationModel.find({ platform: 'whatsapp', customerPhone: { $not: /^9[0-9]{8,}$/ } }).exec();
    let merged = 0;
    for (const source of candidates) {
      const phone = normalizePhoneNumber(source.customerPhone);
      if (!phone || phone === source.customerPhone) continue;
      const target = await this.conversationModel.findOne({
        _id: { $ne: source._id }, platform: 'whatsapp', storeId: source.storeId, customerPhone: phone, status: source.status,
      }).exec();
      if (!target) {
        await this.conversationModel.updateOne({ _id: source._id }, { $set: { customerPhone: phone } });
        continue;
      }
      const messages = [...(target.messages || []), ...(source.messages || [])]
        .sort((a: any, b: any) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      const latest = [target, source].sort((a, b) => (new Date(b.lastMessageAt || 0).getTime()) - (new Date(a.lastMessageAt || 0).getTime()))[0];
      await this.conversationModel.updateOne({ _id: target._id }, {
        $set: {
          messages,
          unreadCount: (target.unreadCount || 0) + (source.unreadCount || 0),
          tags: Array.from(new Set([...(target.tags || []), ...(source.tags || [])])),
          lastMessage: latest.lastMessage,
          lastMessageAt: latest.lastMessageAt,
          customerId: target.customerId || source.customerId,
          metaConnectionId: target.metaConnectionId || source.metaConnectionId,
        },
      });
      await this.conversationModel.deleteOne({ _id: source._id });
      merged++;
    }
    if (merged) this.logger.log(`Merged ${merged} duplicate WhatsApp conversation(s)`);
    return merged;
  }

  async addMessage(customerPhone: string, storeId: string, platform: string, messageData: any) {
    customerPhone = this.normalizeCustomerPhone(customerPhone, platform);
    const { customerName, ...message } = messageData;
    messageData = message;
    const updateQuery: any = {
      $push: { messages: messageData },
      $set: { 
        lastMessage: messageData.text,
        lastMessageAt: new Date(),
        awaitingReply: ConversationsService.isCustomerMessage(messageData),
      }
    };

    if (messageData.sentiment) updateQuery.$set.lastSentiment = messageData.sentiment;
    if (messageData.customerId) updateQuery.$set.customerId = messageData.customerId;
    if (customerName) updateQuery.$set.customerName = customerName;
    if (messageData.metadata?.metaConnectionId) updateQuery.$set.metaConnectionId = messageData.metadata.metaConnectionId;
    if (messageData.tags && messageData.tags.length > 0) updateQuery.$addToSet = { tags: { $each: messageData.tags } };

    if (messageData.from !== 'me') updateQuery.$inc = { unreadCount: 1 };

    // A customer writing again reopens a snoozed or closed conversation.
    const fromCustomer = messageData.from !== 'me' && messageData.from !== 'system';
    if (fromCustomer) {
      updateQuery.$set.status = 'open';
      updateQuery.$set.snoozedUntil = null;
    }

    // One thread per customer: match it whatever its status, so closing never spawns a duplicate conversation.
    return this.conversationModel.findOneAndUpdate(
      { customerPhone, storeId, platform },
      updateQuery,
      { upsert: true, returnDocument: 'after', sort: { lastMessageAt: -1 } }
    );
  }

  /**
   * Moves a customer — and their conversations — to another branch. A conversation that collides with
   * one the customer already has in the target branch is merged into it, so each branch keeps one thread.
   */
  async transferCustomer(customerId: string, organizationId: string, targetStoreId: string) {
    const original = await this.customersService.findOneInOrganization(customerId, organizationId);
    const { customer, fromStoreId } = await this.customersService.transferToStore(customerId, organizationId, targetStoreId);
    const phone = normalizePhoneNumber(original.phoneNumber || original.whatsappId || '');
    const match: Record<string, unknown>[] = [{ customerId }];
    if (phone) match.push({ platform: 'whatsapp', customerPhone: phone });
    if (original.instagramId) match.push({ platform: 'instagram', customerPhone: original.instagramId });
    if (original.facebookId) match.push({ platform: 'facebook', customerPhone: original.facebookId });

    const sources = await this.conversationModel.find({ storeId: fromStoreId, $or: match }).exec();
    const moved: { from: string; to: string }[] = [];
    for (const source of sources) {
      const target = await this.conversationModel.findOne({
        _id: { $ne: source._id }, storeId: targetStoreId, platform: source.platform, customerPhone: source.customerPhone,
      }).exec();
      if (!target) {
        await this.conversationModel.updateOne({ _id: source._id }, { $set: { storeId: targetStoreId, customerId: customer.id } });
        moved.push({ from: String(source._id), to: String(source._id) });
        continue;
      }
      const messages = [...(target.messages || []), ...(source.messages || [])]
        .sort((a: any, b: any) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      const latest = [target, source].sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())[0];
      await this.conversationModel.updateOne({ _id: target._id }, {
        $set: {
          messages,
          customerId: customer.id,
          unreadCount: (target.unreadCount || 0) + (source.unreadCount || 0),
          tags: Array.from(new Set([...(target.tags || []), ...(source.tags || [])])),
          lastMessage: latest.lastMessage,
          lastMessageAt: latest.lastMessageAt,
          awaitingReply: latest.awaitingReply,
          status: latest.status,
          snoozedUntil: latest.snoozedUntil,
          metaConnectionId: target.metaConnectionId || source.metaConnectionId,
        },
      });
      await this.conversationModel.deleteOne({ _id: source._id });
      moved.push({ from: String(source._id), to: String(target._id) });
    }

    const event = { customerId: customer.id, previousCustomerId: customerId, fromStoreId, toStoreId: targetStoreId, conversations: moved };
    this.eventsGateway.server.to(`store_${fromStoreId}`).to(`store_${targetStoreId}`).emit('customer_transferred', event);
    return { customer, ...event };
  }

  /** Sets the workflow status of a conversation (open / pending / snoozed / closed). */
  async setStatus(id: string, status: ConversationStatus, snoozedUntil?: Date | null) {
    const update: Record<string, unknown> = {
      status,
      statusUpdatedAt: new Date(),
      snoozedUntil: status === 'snoozed' ? snoozedUntil : null,
    };
    if (status === 'closed') update.unreadCount = 0;
    const conversation = await this.conversationModel.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' }).lean().exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.eventsGateway.server.to(`store_${conversation.storeId}`).emit('conversation_status', {
      conversationId: String(conversation._id),
      status: conversation.status,
      snoozedUntil: conversation.snoozedUntil || null,
    });
    return { id: String(conversation._id), status: conversation.status, snoozedUntil: conversation.snoozedUntil || null };
  }

  /** Snoozes are lazy: anything past its wake-up time is reopened before a list is read. */
  private async wakeSnoozed(storeIds: string[]) {
    if (!storeIds.length) return;
    await this.conversationModel.updateMany(
      { storeId: { $in: storeIds }, status: 'snoozed', snoozedUntil: { $lte: new Date() } },
      { $set: { status: 'open', snoozedUntil: null, statusUpdatedAt: new Date() } },
    );
  }


  async hasWhatsAppMessage(storeId: string, whatsappMessageId: string) {
    if (!whatsappMessageId) return false;
    const count = await this.conversationModel.countDocuments({
      storeId,
      platform: 'whatsapp',
      'messages.metadata.whatsappMessageId': whatsappMessageId,
    });
    return count > 0;
  }

  async hasWhatsAppMessageInStores(storeIds: string[], whatsappMessageId: string) {
    if (!whatsappMessageId || !storeIds.length) return false;
    const count = await this.conversationModel.countDocuments({
      storeId: { $in: storeIds },
      platform: 'whatsapp',
      'messages.metadata.whatsappMessageId': whatsappMessageId,
    });
    return count > 0;
  }

  async updateWhatsAppMessageStatusInStores(storeIds: string[], whatsappMessageId: string, status: string, timestamp?: number, errors?: any[]) {
    if (!whatsappMessageId || !storeIds.length) return null;
    const set: Record<string, any> = {
      'messages.$.metadata.status': status,
      'messages.$.metadata.statusUpdatedAt': timestamp || Date.now(),
    };
    if (errors?.length) set['messages.$.metadata.statusErrors'] = errors;
    return this.conversationModel.findOneAndUpdate(
      { storeId: { $in: storeIds }, platform: 'whatsapp', 'messages.metadata.whatsappMessageId': whatsappMessageId },
      { $set: set },
      { returnDocument: 'after' },
    );
  }

  async updateWhatsAppMessageStatus(storeId: string, whatsappMessageId: string, status: string, timestamp?: number, errors?: any[]) {
    if (!whatsappMessageId) return null;
    const set: Record<string, any> = {
      'messages.$.metadata.status': status,
      'messages.$.metadata.statusUpdatedAt': timestamp || Date.now(),
    };
    if (errors?.length) set['messages.$.metadata.statusErrors'] = errors;
    return this.conversationModel.findOneAndUpdate(
      { storeId, platform: 'whatsapp', 'messages.metadata.whatsappMessageId': whatsappMessageId },
      { $set: set },
      { returnDocument: 'after' },
    );
  }

  async markAsRead(id: string) {
    return this.conversationModel.findByIdAndUpdate(id, { unreadCount: 0 }, { returnDocument: 'after' });
  }

  /**
   * One inbox page, newest activity first. Rows carry only their last message (for the preview/ticks);
   * the thread itself is paged separately through findMessages.
   */
  async findPage(storeIds: string[], filters: InboxFilters, options: { limit?: number; cursor?: string } = {}) {
    if (!storeIds.length) return { items: [], nextCursor: null };
    const limit = clampLimit(options.limit, INBOX_PAGE_DEFAULT, INBOX_PAGE_MAX);
    if (!options.cursor) await this.wakeSnoozed(storeIds);

    const query = this.inboxQuery(storeIds, filters);
    if (options.cursor) (query.$and ||= []).push(afterCursor(decodeCursor(options.cursor)));

    const rows = await this.conversationModel
      .find(query, { messages: { $slice: -1 } })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items: await this.withCustomerNames(items),
      nextCursor: rows.length > limit && last ? encodeCursor(last.lastMessageAt, String(last._id)) : null,
    };
  }

  /** Badge counts for the status tabs, plus unread / needs-reply inside the selected status tab. */
  async countInbox(storeIds: string[], filters: InboxFilters) {
    if (!storeIds.length) return { active: 0, snoozed: 0, closed: 0, unread: 0, needsReply: 0 };
    await this.wakeSnoozed(storeIds);
    const base = { ...filters, tab: undefined };
    const count = (query: Record<string, any>) => this.conversationModel.countDocuments(query).exec();
    const current = this.inboxQuery(storeIds, { ...base, view: filters.view || 'active' });
    const [active, snoozed, closed, unread, needsReply] = await Promise.all([
      count(this.inboxQuery(storeIds, { ...base, view: 'active' })),
      count(this.inboxQuery(storeIds, { ...base, view: 'snoozed' })),
      count(this.inboxQuery(storeIds, { ...base, view: 'closed' })),
      count({ ...current, unreadCount: { $gt: 0 } }),
      count({ ...current, awaitingReply: true }),
    ]);
    return { active, snoozed, closed, unread, needsReply };
  }

  /**
   * A window of a conversation's messages, read from the end. `before` is the `start` of the previously
   * loaded window (exclusive); omit it for the latest messages. Messages are only ever appended, so indexes stay stable.
   */
  async findMessages(id: string, storeId: string, options: { limit?: number; before?: number } = {}) {
    const limit = clampLimit(options.limit, MESSAGES_PAGE_DEFAULT, MESSAGES_PAGE_MAX);
    const [meta] = await this.conversationModel.aggregate<{ total: number }>([
      { $match: { _id: new Types.ObjectId(id), storeId } },
      { $project: { total: { $size: { $ifNull: ['$messages', []] } } } },
    ]);
    if (!meta) throw new NotFoundException('Conversation not found');
    const end = options.before === undefined ? meta.total : Math.min(Math.max(options.before, 0), meta.total);
    const start = Math.max(0, end - limit);
    if (end === start) return { messages: [], total: meta.total, start, hasMore: start > 0 };
    const doc = await this.conversationModel
      .findOne({ _id: id, storeId }, { storeId: 1, messages: { $slice: [start, end - start] } })
      .lean()
      .exec();
    return { messages: doc?.messages || [], total: meta.total, start, hasMore: start > 0 };
  }

  private inboxQuery(storeIds: string[], filters: InboxFilters) {
    const query: Record<string, any> = { storeId: storeIds.length === 1 ? storeIds[0] : { $in: storeIds } };
    if (filters.platform) query.platform = filters.platform;
    if (filters.tag) query.tags = filters.tag;
    if (filters.view === 'active') query.status = { $nin: ['snoozed', 'closed'] };
    else if (filters.view) query.status = filters.view;
    if (filters.tab === 'unread') query.unreadCount = { $gt: 0 };
    else if (filters.tab === 'needs_reply') query.awaitingReply = true;
    const search = filters.search?.trim();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      query.$and = [{ $or: [{ customerName: pattern }, { customerPhone: pattern }, { lastMessage: pattern }] }];
    }
    return query;
  }

  /** Inbox row for a single conversation: no messages, customer name and CRM labels resolved. */
  async withCustomerName<T extends { customerId?: string; customerName?: string }>(conversation: T) {
    const [row] = await this.withCustomerNames([conversation]);
    return row;
  }

  // A name saved on the customer record (possibly edited by the team) wins over the WhatsApp profile name.
  // Enriches inbox rows with the CRM view of the customer: saved name plus their categories and tags.
  private async withCustomerNames<T extends { customerId?: string; customerName?: string }>(conversations: T[]) {
    try {
      const ids = conversations.map((conv) => conv.customerId || '');
      const [names, labels] = await Promise.all([
        this.customersService.findNamesByIds(ids),
        this.customersService.findLabelsByIds(ids).catch((error) => {
          this.logger.warn(`Could not load customer labels: ${error?.message}`);
          return new Map();
        }),
      ]);
      return conversations.map((conv) => {
        const label = conv.customerId ? labels.get(conv.customerId) : undefined;
        return {
          ...conv,
          customerName: (conv.customerId && names.get(conv.customerId)) || conv.customerName || null,
          customerCategories: label?.categories || [],
          customerTags: label?.tags || [],
        };
      });
    } catch (error) {
      this.logger.warn(`Could not load customer names: ${error?.message}`);
      return conversations;
    }
  }

  /** The conversation without its messages (use findMessages for those). */
  async findOne(id: string) {
    const conversation = await this.conversationModel.findById(id).select('-messages').lean().exec();

    // Auto-Repair: Link customer if missing
    if (conversation && !conversation.customerId) {
      try {
        const store = await this.channelsService.getStoreContext(conversation.storeId);
        const customer = await this.customersService.findOrCreate(store, conversation.customerPhone, {
          fullName: `عميل ${conversation.customerPhone}`,
          phoneNumber: conversation.platform === 'whatsapp' ? conversation.customerPhone : undefined,
          instagramId: conversation.platform === 'instagram' ? conversation.customerPhone : undefined,
          facebookId: conversation.platform === 'facebook' ? conversation.customerPhone : undefined,
        }, conversation.platform);
        await this.conversationModel.updateOne({ _id: conversation._id }, { $set: { customerId: customer.id } });
        conversation.customerId = customer.id;
      } catch (e) {}
    }
    
    return conversation;
  }

  /**
   * Reporting for the analytics page. Everything is measured from stored messages; nothing is estimated.
   * `tzOffsetMinutes` (minutes east of UTC) buckets days and hours in the viewer's local time.
   */
  async getAnalytics(storeIds: string[], days: number, tzOffsetMinutes: number) {
    const DAY = 86_400_000;
    const shift = tzOffsetMinutes * 60_000;
    const now = Date.now();
    // Period = the last `days` local calendar days including today; the previous period is the same length before it.
    const todayStartLocal = Math.floor((now + shift) / DAY) * DAY;
    const periodStart = todayStartLocal - (days - 1) * DAY - shift;
    const prevStart = periodStart - days * DAY;

    const empty = {
      period: { days, from: new Date(periodStart).toISOString(), to: new Date(now).toISOString() },
      totals: { activeConversations: 0, newConversations: 0, incoming: 0, autoReplies: 0, teamReplies: 0, unclassifiedReplies: 0, waitingNow: 0 },
      previous: { activeConversations: 0, incoming: 0 },
      responseTime: { medianSeconds: null as number | null, within5MinShare: null as number | null, samples: 0 },
      daily: [] as { date: string; incoming: number; auto: number; team: number }[],
      hourly: Array.from({ length: 7 }, () => Array(24).fill(0)) as number[][],
      platforms: [] as { platform: string; conversations: number }[],
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      manualTrackingSince: null as string | null,
    };
    if (!storeIds.length) return empty;

    const conversations = await this.conversationModel
      .find(
        { storeId: { $in: storeIds }, $or: [{ lastMessageAt: { $gte: new Date(prevStart) } }, { lastMessageAt: { $exists: false } }] },
        { platform: 1, lastSentiment: 1, 'messages.from': 1, 'messages.type': 1, 'messages.timestamp': 1, 'messages.isManual': 1 },
      )
      .lean()
      .exec();

    const dayKey = (t: number) => new Date(Math.floor((t + shift) / DAY) * DAY).toISOString().slice(0, 10);
    const daily = new Map<string, { date: string; incoming: number; auto: number; team: number }>();
    for (let i = 0; i < days; i++) {
      const key = dayKey(periodStart + i * DAY);
      daily.set(key, { date: key, incoming: 0, auto: 0, team: 0 });
    }

    const result = empty;
    const responseSeconds: number[] = [];
    const platformCount = new Map<string, number>();
    let firstManualAt: number | null = null;
    const isCustomer = (m: any) => m.from !== 'me' && m.from !== 'system' && m.type !== 'system_error';
    const time = (m: any) => new Date(m.timestamp).getTime();

    for (const conv of conversations as any[]) {
      const messages = (conv.messages || []).filter((m: any) => Number.isFinite(time(m)));
      if (!messages.length) continue;
      const firstAt = time(messages[0]);
      let activeNow = false;
      let activePrev = false;

      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const t = time(m);
        if (m.from === 'me' && m.isManual === true && (firstManualAt === null || t < firstManualAt)) firstManualAt = t;
        if (t >= prevStart && t < periodStart) {
          activePrev = true;
          if (isCustomer(m)) result.previous.incoming++;
          continue;
        }
        if (t < periodStart) continue;
        activeNow = true;
        const bucket = daily.get(dayKey(t));
        if (isCustomer(m)) {
          result.totals.incoming++;
          if (bucket) bucket.incoming++;
          const local = new Date(t + shift);
          result.hourly[local.getUTCDay()][local.getUTCHours()]++;
          // Response time: from a customer message that follows a non-customer message (start of a wait) to the next reply.
          const startsWait = i === 0 || !isCustomer(messages[i - 1]);
          if (startsWait) {
            const reply = messages.slice(i + 1).find((n: any) => n.from === 'me');
            if (reply) {
              const seconds = (time(reply) - t) / 1000;
              if (seconds >= 0 && seconds < 86_400) responseSeconds.push(seconds);
            }
          }
        } else if (m.from === 'me') {
          if (m.isManual === true) { result.totals.teamReplies++; if (bucket) bucket.team++; }
          else if (m.isManual === false) { result.totals.autoReplies++; if (bucket) bucket.auto++; }
          else { result.totals.unclassifiedReplies++; if (bucket) bucket.auto++; }
        }
      }

      if (activeNow) {
        result.totals.activeConversations++;
        platformCount.set(conv.platform, (platformCount.get(conv.platform) || 0) + 1);
        const s = conv.lastSentiment as 'positive' | 'neutral' | 'negative';
        if (s in result.sentiment) result.sentiment[s]++;
        else result.sentiment.neutral++;
      }
      if (activePrev) result.previous.activeConversations++;
      if (firstAt >= periodStart) result.totals.newConversations++;
      if (isCustomer(messages[messages.length - 1])) result.totals.waitingNow++;
    }

    responseSeconds.sort((a, b) => a - b);
    if (responseSeconds.length) {
      const mid = Math.floor(responseSeconds.length / 2);
      result.responseTime = {
        medianSeconds: Math.round(responseSeconds.length % 2 ? responseSeconds[mid] : (responseSeconds[mid - 1] + responseSeconds[mid]) / 2),
        within5MinShare: responseSeconds.filter((s) => s <= 300).length / responseSeconds.length,
        samples: responseSeconds.length,
      };
    }
    result.daily = [...daily.values()];
    result.platforms = [...platformCount.entries()].map(([platform, conversations]) => ({ platform, conversations })).sort((a, b) => b.conversations - a.conversations);
    result.manualTrackingSince = firstManualAt ? new Date(firstManualAt).toISOString() : null;
    return result;
  }

  async getStats(storeId: string) {
    const conversations = await this.conversationModel.find({ storeId }).exec();
    const connectedChannels = await this.channelsService.findAllByStore(storeId);
    
    let totalMessages = 0;
    let aiReplies = 0;
    let totalAiChars = 0;
    let totalHumanResponseTime = 0;
    let humanResponseCount = 0;
    const platformCount: any = { whatsapp: 0, instagram: 0, facebook: 0, google_maps: 0 };
    const sentiments: any = { positive: 0, neutral: 0, negative: 0 };

    const last7Days: string[] = [];
    const timelineData: any = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last7Days.push(dateStr);
      timelineData[dateStr] = 0;
    }

    conversations.forEach(conv => {
      totalMessages += conv.messages.length;
      const convMessages = conv.messages;
      for (let i = 0; i < convMessages.length; i++) {
        const msg = convMessages[i];
        if (msg.from === 'me' && (msg as any).isManual !== true) {
          aiReplies++;
          totalAiChars += (msg.text || '').length;
        }
        if (msg.from !== 'me' && i < convMessages.length - 1) {
          const nextMsg = convMessages[i+1];
          if ((nextMsg as any).from === 'me' && (nextMsg as any).isManual === true) {
            const diff = (new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) / 1000;
            if (diff > 0 && diff < 86400) { totalHumanResponseTime += diff; humanResponseCount++; }
          }
        }
        const mDate = new Date(msg.timestamp).toISOString().split('T')[0];
        if (timelineData.hasOwnProperty(mDate)) timelineData[mDate]++;
      }
      if (platformCount.hasOwnProperty(conv.platform)) platformCount[conv.platform]++;
      const sent = conv.lastSentiment || 'neutral';
      if (sentiments.hasOwnProperty(sent)) sentiments[sent]++;
    });

    const wordsPerMinute = 40;
    const charsPerWord = 5;
    const estimatedMinutesSaved = (totalAiChars / charsPerWord) / wordsPerMinute;
    const avgHumanSpeedSeconds = humanResponseCount > 0 ? totalHumanResponseTime / humanResponseCount : 600;

    return {
      totalConversations: conversations.length,
      totalMessages,
      aiReplies,
      activeChannels: connectedChannels.length,
      hoursSaved: Math.round((estimatedMinutesSaved / 60) * 10) / 10,
      avgHumanSpeed: Math.round(avgHumanSpeedSeconds / 60),
      aiSpeed: 0.05,
      platformStats: Object.entries(platformCount).map(([name, value]) => ({ name, value })),
      sentimentStats: [
        { name: 'إيجابي', value: sentiments.positive, color: '#22c55e' },
        { name: 'محايد', value: sentiments.neutral, color: '#94a3b8' },
        { name: 'سلبي', value: sentiments.negative, color: '#ef4444' }
      ],
      timelineData: last7Days.map(date => ({ date: date.split('-').slice(1).join('/'), messages: timelineData[date] }))
    };
  }

  async isAiEnabled(customerPhone: string, storeId: string, platform: string): Promise<boolean> {
    customerPhone = this.normalizeCustomerPhone(customerPhone, platform);
    const conversation = await this.conversationModel.findOne({ customerPhone, storeId, platform }).sort({ lastMessageAt: -1 });
    if (!conversation) return true;
    if (conversation.aiEnabled === false && conversation.aiDisabledUntil) {
      const now = new Date();
      if (now < conversation.aiDisabledUntil) return false;
    }
    return true;
  }

  async toggleAi(conversationId: string, enabled: boolean) {
    return this.conversationModel.findByIdAndUpdate(conversationId, { 
      aiEnabled: enabled, aiDisabledUntil: enabled ? null : new Date(Date.now() + 24 * 60 * 60 * 1000)
    }, { returnDocument: 'after' });
  }

  async updateFlowState(id: string, flowId: string | null, nodeId: string | null) {
    return this.conversationModel.findByIdAndUpdate(id, {
      currentFlowId: flowId,
      currentFlowNodeId: nodeId
    });
  }

  async updateTags(conversationId: string, tags: string[]) {
    return this.conversationModel.findByIdAndUpdate(conversationId, { tags: Array.from(new Set(tags)) }, { returnDocument: 'after' });
  }

  async sendMessage(conversationId: string, storeId: string, text: string) {
    const conversation = await this.conversationModel.findOne({ _id: conversationId, storeId });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const channels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
    const channel = channels.find(c => c.type === conversation.platform && (!conversation.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
      || channels.find(c => c.type === conversation.platform);
    if (!channel) throw new NotFoundException(`No linked ${conversation.platform} channel found.`);

    let providerResponse: any = null;
    let walletCharge: any = null;
    if (conversation.platform === 'whatsapp') {
      walletCharge = await this.billingService.chargeMetaUsageForStore(storeId, MetaUsageType.SESSION_TEXT, {
        referenceId: conversationId,
        source: 'manual_agent_reply',
      });
      try {
        providerResponse = await this.messagingService.sendWhatsAppMessage(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, conversation.customerPhone, text);
      } catch (error) {
        if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'Manual WhatsApp send failed');
        const errorText = this.getSendErrorText(error);
        await this.addSystemError(conversation.customerPhone, storeId, conversation.platform, errorText, error);
        throw new InternalServerErrorException(errorText);
      }
    } else if (conversation.platform === 'instagram') {
      providerResponse = await this.messagingService.sendInstagramMessage(channel.credentials!.accessToken, conversation.customerPhone, text);
    } else if (conversation.platform === 'facebook') {
      providerResponse = await this.messagingService.sendFacebookMessage(channel.credentials!.accessToken, conversation.customerPhone, text);
    }

    const whatsappMessageId = conversation.platform === 'whatsapp'
      ? (providerResponse?.messages?.[0]?.id || providerResponse?.message_id)
      : undefined;
    const messageData = {
      from: 'me',
      text,
      type: 'text',
      isManual: true,
      timestamp: Date.now(),
      metadata: whatsappMessageId ? { whatsappMessageId, status: 'accepted', walletTransactionId: walletCharge?.id || null, metaConnectionId: channel.credentials?.metaConnectionId || conversation.metaConnectionId || null } : {},
    };
    await this.addMessage(conversation.customerPhone, storeId, conversation.platform, messageData);
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
    await this.conversationModel.findByIdAndUpdate(conversationId, { aiEnabled: false, aiDisabledUntil: thirtyMinutesFromNow });
    const store = await this.channelsService.getStoreContext(storeId);
    const ownerId = store.owner?.id || (typeof store.owner === 'string' ? store.owner : null);
    if (ownerId) this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', { ...messageData, customerPhone: conversation.customerPhone, platform: conversation.platform, storeId });
    return { status: 'sent', message: messageData };
  }

  async addSystemError(customerPhone: string, storeId: string, platform: string, text: string, error?: any) {
    const messageData = {
      from: 'system',
      text,
      type: 'system_error',
      timestamp: Date.now(),
      metadata: {
        error: error?.response?.data?.error || { message: error?.message || text },
      },
    };

    await this.addMessage(customerPhone, storeId, platform, messageData);
    const store = await this.channelsService.getStoreContext(storeId);
    const ownerId = store.owner?.id || (typeof store.owner === 'string' ? store.owner : null);
    if (ownerId) this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', {
      ...messageData,
      customerPhone,
      platform,
      storeId,
    });
  }

  private getSendErrorText(error: any) {
    const metaError = error?.response?.data?.error;
    if (metaError?.message) {
      return `فشل إرسال رسالة واتساب: ${metaError.message}${metaError.code ? ` (code ${metaError.code})` : ''}${metaError.error_subcode ? ` (subcode ${metaError.error_subcode})` : ''}`;
    }
    return error?.message || 'فشل إرسال رسالة واتساب.';
  }
}
