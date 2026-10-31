import { Injectable, Logger, NotFoundException, InternalServerErrorException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CONVERSATION_RATINGS, Conversation, ConversationRating, ConversationStatus } from './schemas/conversation.schema';
import { MessagingService } from '../channels/messaging.service';
import { ChannelsService } from '../channels/channels.service';
import { CustomersService } from '../customers/customers.service';
import { EventsGateway } from '../events/events.gateway';
import { BillingService } from '../billing/billing.service';
import { MetaUsageType } from '../billing/entities/pricing-rule.entity';
import { normalizePhoneNumber } from '../../common/utils/phone.util';
import { WHATSAPP_MEDIA_TYPES, WHATSAPP_MEDIA_UNSUPPORTED } from '../../common/utils/whatsapp-media-types';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { TtlCache } from '../../common/utils/ttl-cache';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/** Multer's in-memory file, typed locally because @types/multer is not installed. */
export type UploadedChatFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

export type InboxView = 'active' | 'snoozed' | 'closed';
export type InboxTab = 'all' | 'unread' | 'needs_reply' | 'pending';
export interface InboxFilters {
  view?: InboxView;
  tab?: InboxTab;
  platform?: string;
  tag?: string;
  search?: string;
  rating?: ConversationRating;
}
export interface InboxCounts { active: number; snoozed: number; closed: number; unread: number; needsReply: number; pending: number }

/** Sent when the team closes a WhatsApp conversation; the reply button ids carry the rating. */
const RATING_PROMPT = 'قيّم تجربتك معنا 🙏';
const RATING_REPLY_PREFIX = 'rating:';
const RATING_OPTIONS: { value: ConversationRating; label: string }[] = [
  { value: 'positive', label: 'راضٍ 👍' },
  { value: 'neutral', label: 'عادي 😐' },
  { value: 'negative', label: 'غير راضٍ 👎' },
];
/** Free-form (non-template) messages reach a customer only within 24h of their last message; keep a margin. */
const RATING_WINDOW_MS = 23.5 * 3600 * 1000;
/** Closing messages that need no reply, normalized as in isAcknowledgement (no diacritics, ة→ه, أ/إ/آ→ا). */
const ACKNOWLEDGEMENTS = new Set([
  'شكرا', 'مشكور', 'مشكورين', 'مشكوره', 'تسلم', 'تسلمي', 'تسلمون', 'يسلمو', 'يعطيك العافيه', 'الله يعطيك العافيه',
  'يعطيكم العافيه', 'جزاك الله خير', 'جزاكم الله خير', 'الله يجزاك خير', 'الله يسعدك', 'تمام', 'طيب', 'اوكي', 'اوك',
  'حلو', 'ممتاز', 'زين', 'العفو', 'عفوا', 'ok', 'okay', 'thanks', 'thank you', 'thx', 'تم', 'خلاص', 'وصل', 'تمام شكرا',
]);
/** How long automation gets to answer before an unanswered customer message counts as the team's to reply to. */
const BOT_GRACE_MS = 2 * 60 * 1000;
/** WhatsApp (and Messenger) allow free-form replies only within 24h of the customer's last message. */
const REPLY_WINDOW_MS = 24 * 3600 * 1000;
/** A customer is asked to rate at most once in this period, however often the conversation is closed. */
const RATING_COOLDOWN_MS = 24 * 3600 * 1000;

const INBOX_PAGE_DEFAULT = 30;
const INBOX_PAGE_MAX = 100;
const MESSAGES_PAGE_DEFAULT = 30;
const MESSAGES_PAGE_MAX = 100;

/**
 * Inbox badge counts are reused for this long. Every open inbox asks for them after realtime events, so without
 * it each message cost (sessions × 6) counts over the whole branch. The inbox waits longer than this before
 * refreshing after an event (COUNTS_EVENT_DELAY_MS in ConversationsPage), so the refresh always sees the event.
 */
const INBOX_COUNTS_TTL_MS = 3_000;
/**
 * Dashboard and analytics totals walk every stored message of the branch (on a branch of ~800k threads that
 * takes more than a minute); they are all-time or per-day figures, not live ones. Longer than one computation,
 * so a busy dashboard never starts a second full scan while the first is still running.
 */
const REPORT_CACHE_TTL_MS = 5 * 60_000;
/** A branch's expired snoozes are reopened at most this often (lazily, when its inbox is read). */
const SNOOZE_WAKE_INTERVAL_MS = 10_000;
/** Start-up data repairs run in the background after boot, so they never hold up the API or webhooks. */
const STARTUP_MAINTENANCE_DELAY_MS = 30_000;
/** Marks one-off data repairs as done, so a restart does not scan the whole collection again. */
const MAINTENANCE_COLLECTION = 'maintenance_tasks';

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
  private readonly countsCache = new TtlCache<InboxCounts>(INBOX_COUNTS_TTL_MS);
  private readonly statsCache = new TtlCache<any>(REPORT_CACHE_TTL_MS, 200);
  private readonly analyticsCache = new TtlCache<any>(REPORT_CACHE_TTL_MS, 200);
  private readonly snoozeWakes = new Map<string, { at: number; done: Promise<void> }>();

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    private readonly messagingService: MessagingService,
    private readonly channelsService: ChannelsService,
    private readonly customersService: CustomersService,
    private readonly eventsGateway: EventsGateway,
    private readonly billingService: BillingService,
    private readonly whatsAppMediaService: WhatsAppMediaService,
  ) {}

  onModuleInit() {
    // Each of these scans the whole collection. They used to be awaited here, which held the app (and every
    // webhook) until they finished; now they run once the API is up.
    setTimeout(() => void this.runStartupMaintenance(), STARTUP_MAINTENANCE_DELAY_MS).unref?.();
  }

  async runStartupMaintenance() {
    try {
      await this.mergeDuplicateWhatsAppConversations();
    } catch (error) {
      this.logger.error('Failed to merge duplicate WhatsApp conversations', error?.stack);
    }
    // One-off repairs of data written by older versions: nothing writes these shapes any more.
    await this.runOnce('remove-ai-failure-notes-v1', () => this.removeAiFailureNotes());
    await this.runOnce('backfill-awaiting-reply-v1', () => this.backfillAwaitingReply());
    await this.runOnce('clear-acknowledgement-waits-v1', () => this.clearAcknowledgementWaits());
  }

  /** Runs a one-off data repair unless it already completed; a failed run is retried at the next start. */
  private async runOnce(task: string, run: () => Promise<unknown>) {
    const tasks = this.conversationModel.db.collection<{ _id: string; completedAt: Date }>(MAINTENANCE_COLLECTION);
    try {
      if (await tasks.findOne({ _id: task })) return;
      await run();
      await tasks.updateOne({ _id: task }, { $set: { completedAt: new Date() } }, { upsert: true });
    } catch (error) {
      this.logger.error(`Start-up task ${task} failed`, error?.stack);
    }
  }

  /** Removes the old "AI reply failed" system notes; auto-reply now stops silently instead. */
  private async removeAiFailureNotes() {
    await this.conversationModel.updateMany(
      { 'messages.type': 'system_error', 'messages.text': /^تعذر توليد رد تلقائي/ },
      { $pull: { messages: { type: 'system_error', text: /^تعذر توليد رد تلقائي/ } } } as any,
    );
    const stalePreviews = await this.conversationModel.find({ lastMessage: /^تعذر توليد رد تلقائي/ }, { messages: { $slice: -1 } }).lean().exec();
    for (const conv of stalePreviews) {
      const last = conv.messages?.[conv.messages.length - 1];
      await this.conversationModel.updateOne({ _id: conv._id }, { $set: { lastMessage: last?.text || '' } });
    }
  }

  /** Threads that only "wait" on a closing thanks/emoji (from before isAcknowledgement existed) wait on nothing. */
  private async clearAcknowledgementWaits() {
    const rows = await this.conversationModel
      .find({ awaitingReply: true, lastMessage: { $regex: /^[\s\S]{1,40}$/ } }, { lastMessage: 1 })
      .lean()
      .exec();
    const ids = rows.filter((row) => ConversationsService.isAcknowledgement(row.lastMessage)).map((row) => row._id);
    if (ids.length) {
      await this.conversationModel.updateMany({ _id: { $in: ids } }, { $set: { awaitingReply: false } });
      this.logger.log(`Cleared awaitingReply on ${ids.length} conversation(s) ending with a thanks or emoji`);
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

  /** A short closing message that needs no answer: thanks, OK, or emoji only. */
  static isAcknowledgement(text?: string | null) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 40) return false;
    // Only emoji/punctuation, e.g. "👍" or "🙏🌹".
    if (!/[\p{L}\p{N}]/u.test(raw)) return true;
    const words = raw
      .toLowerCase()
      .replace(/[\p{Extended_Pictographic}️‍]/gu, ' ')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة(?=\s|$)/g, 'ه')
      .replace(/[!.,،؟?…]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+(لك|لكم|جزيلا|كثير|وايد|مره|مرا|عليك|عليكم)$/, '');
    return ACKNOWLEDGEMENTS.has(words);
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
    // Most candidates are international numbers that are already normalized (outside +9…): read only the fields
    // the check needs, and load a thread's messages only when it is actually merged.
    const candidates = await this.conversationModel
      .find({ platform: 'whatsapp', customerPhone: { $not: /^9[0-9]{8,}$/ } }, { customerPhone: 1, storeId: 1, status: 1 })
      .lean()
      .exec();
    let merged = 0;
    for (const candidate of candidates) {
      const phone = normalizePhoneNumber(candidate.customerPhone);
      if (!phone || phone === candidate.customerPhone) continue;
      const target = await this.conversationModel.findOne({
        _id: { $ne: candidate._id }, platform: 'whatsapp', storeId: candidate.storeId, customerPhone: phone, status: candidate.status,
      }).exec();
      if (!target) {
        await this.conversationModel.updateOne({ _id: candidate._id }, { $set: { customerPhone: phone } });
        continue;
      }
      const source = await this.conversationModel.findById(candidate._id).exec();
      if (!source) continue;
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
    // An emoji reaction is kept in the thread but asks nothing: it neither reopens the conversation nor waits for a reply.
    const quiet = messageData.type === 'reaction';
    const updateQuery: any = {
      $push: { messages: messageData },
      $set: {
        lastMessage: messageData.text,
        lastMessageAt: new Date(),
        // A closing "thanks" / "👍" still reopens the thread, but nobody owes an answer to it.
        awaitingReply: !quiet && ConversationsService.isCustomerMessage(messageData) && !ConversationsService.isAcknowledgement(messageData.text),
      }
    };

    if (messageData.sentiment) updateQuery.$set.lastSentiment = messageData.sentiment;
    if (messageData.customerId) updateQuery.$set.customerId = messageData.customerId;
    if (customerName) updateQuery.$set.customerName = customerName;
    if (messageData.metadata?.metaConnectionId) updateQuery.$set.metaConnectionId = messageData.metadata.metaConnectionId;
    if (messageData.tags && messageData.tags.length > 0) updateQuery.$addToSet = { tags: { $each: messageData.tags } };

    if (messageData.from !== 'me' && !quiet) updateQuery.$inc = { unreadCount: 1 };

    // A customer writing again reopens a snoozed or closed conversation.
    const fromCustomer = messageData.from !== 'me' && messageData.from !== 'system';
    if (fromCustomer && !quiet) {
      updateQuery.$set.status = 'open';
      updateQuery.$set.snoozedUntil = null;
    }

    // One thread per customer: match it whatever its status, so closing never spawns a duplicate conversation.
    return this.conversationModel.findOneAndUpdate(
      { customerPhone, storeId, platform },
      updateQuery,
      // Callers only look at the last two messages (new-conversation check); don't ship the whole thread back.
      { upsert: true, returnDocument: 'after', sort: { lastMessageAt: -1 }, projection: { messages: { $slice: -2 } } }
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

    this.invalidateCounts(fromStoreId, targetStoreId);
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
    const before = await this.conversationModel.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'before', projection: { status: 1, platform: 1 } }).lean().exec();
    if (!before) throw new NotFoundException('Conversation not found');
    if (status === 'closed' && before.status !== 'closed' && before.platform === 'whatsapp') {
      void this.sendRatingRequest(id).catch((error) => this.logger.warn(`Rating request for ${id} failed: ${error?.message}`));
    }
    const conversation = await this.conversationModel.findById(id, { storeId: 1, status: 1, snoozedUntil: 1 }).lean().exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.invalidateCounts(conversation.storeId);
    this.eventsGateway.server.to(`store_${conversation.storeId}`).emit('conversation_status', {
      conversationId: String(conversation._id),
      status: conversation.status,
      snoozedUntil: conversation.snoozedUntil || null,
    });
    return { id: String(conversation._id), status: conversation.status, snoozedUntil: conversation.snoozedUntil || null };
  }

  /**
   * Snoozes are lazy: anything past its wake-up time is reopened before a list is read. Each branch is checked
   * at most every SNOOZE_WAKE_INTERVAL_MS (the list and the counts both ask, for every open inbox); callers in
   * that window wait for the check already running. The inbox shows an expired snooze as open meanwhile.
   */
  private async wakeSnoozed(storeIds: string[]) {
    const now = Date.now();
    const running: Promise<void>[] = [];
    const due: string[] = [];
    for (const id of storeIds) {
      const last = this.snoozeWakes.get(id);
      if (last && now - last.at < SNOOZE_WAKE_INTERVAL_MS) running.push(last.done);
      else due.push(id);
    }
    if (due.length) {
      const wake = this.conversationModel.updateMany(
        { storeId: { $in: due }, status: 'snoozed', snoozedUntil: { $lte: new Date(now) } },
        { $set: { status: 'open', snoozedUntil: null, statusUpdatedAt: new Date(now) } },
      ).exec().then(() => undefined);
      // Waiters never see the error (the caller that started the check does); the branch is checked again next time.
      const entry = { at: now, done: wake.catch(() => { for (const id of due) if (this.snoozeWakes.get(id) === entry) this.snoozeWakes.delete(id); }) };
      for (const id of due) this.snoozeWakes.set(id, entry);
      running.push(wake);
    }
    await Promise.all(running);
  }

  async hasWhatsAppMessage(storeId: string, whatsappMessageId: string) {
    if (!whatsappMessageId) return false;
    // exists() stops at the first match; countDocuments() ran an aggregation to count every one.
    const found = await this.conversationModel.exists({
      storeId,
      platform: 'whatsapp',
      'messages.metadata.whatsappMessageId': whatsappMessageId,
    });
    return Boolean(found);
  }

  async hasWhatsAppMessageInStores(storeIds: string[], whatsappMessageId: string) {
    if (!whatsappMessageId || !storeIds.length) return false;
    const found = await this.conversationModel.exists({
      storeId: { $in: storeIds },
      platform: 'whatsapp',
      'messages.metadata.whatsappMessageId': whatsappMessageId,
    });
    return Boolean(found);
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
      { returnDocument: 'after', projection: this.statusUpdateProjection(whatsappMessageId) },
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
      { returnDocument: 'after', projection: this.statusUpdateProjection(whatsappMessageId) },
    );
  }

  /** Status callers only need the store and the updated message, not the whole thread. */
  private statusUpdateProjection(whatsappMessageId: string) {
    return { storeId: 1, messages: { $elemMatch: { 'metadata.whatsappMessageId': whatsappMessageId } } };
  }

  async markAsRead(id: string) {
    const conversation = await this.conversationModel.findByIdAndUpdate(id, { unreadCount: 0 }, { returnDocument: 'after' });
    this.invalidateCounts(conversation?.storeId);
    return conversation;
  }

  /** Team actions show in the badges at once; incoming messages show within INBOX_COUNTS_TTL_MS. */
  private invalidateCounts(...storeIds: (string | null | undefined)[]) {
    for (const id of storeIds) if (id) this.countsCache.invalidate(id);
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

  /**
   * "Needs a reply" for the team: the customer's last message is unanswered and automation is not going to
   * answer it, either because automatic replies are paused for this conversation or because nothing has replied
   * within BOT_GRACE_MS. Messages the bot is about to answer stay out of the team's list.
   */
  private static needsTeamReplyQuery() {
    const now = Date.now();
    return {
      awaitingReply: true,
      // Past 24h a free-form reply is no longer allowed (only a template), so it is not a reply the team owes.
      lastMessageAt: { $gt: new Date(now - REPLY_WINDOW_MS) },
      $or: [
        { lastMessageAt: { $lte: new Date(now - BOT_GRACE_MS) } },
        { aiEnabled: false, aiDisabledUntil: { $gt: new Date(now) } },
      ],
    };
  }

  /**
   * Badge counts for the status tabs, plus unread / needs-reply inside the selected status tab.
   * The result depends only on the branches and the filters (not on who asks), so that is the cache key: two
   * users with the same branch access share it, and a user never gets counts for branches outside their list.
   */
  async countInbox(storeIds: string[], filters: InboxFilters): Promise<InboxCounts> {
    if (!storeIds.length) return { active: 0, snoozed: 0, closed: 0, unread: 0, needsReply: 0, pending: 0 };
    const stores = [...new Set(storeIds)].sort();
    const key = JSON.stringify([
      stores, filters.view || 'active', filters.platform || null, filters.tag || null, filters.rating || null, filters.search?.trim() || null,
    ]);
    return this.countsCache.get(key, stores, () => this.computeInboxCounts(storeIds, filters));
  }

  private async computeInboxCounts(storeIds: string[], filters: InboxFilters): Promise<InboxCounts> {
    await this.wakeSnoozed(storeIds);
    const base = { ...filters, tab: undefined };
    const count = (query: Record<string, any>) => this.conversationModel.countDocuments(query).exec();
    const current = this.inboxQuery(storeIds, { ...base, view: filters.view || 'active' });
    const [byStatus, unread, needsReply] = await Promise.all([
      this.countByStatus(this.inboxQuery(storeIds, { ...base, view: undefined })),
      count({ ...current, unreadCount: { $gt: 0 } }),
      count({ ...current, ...ConversationsService.needsTeamReplyQuery() }),
    ]);
    return { ...byStatus, unread, needsReply };
  }

  /**
   * The four status-tab counts in one pass, grouped by status. Separate counts walked the branch once each, and
   * the planner sometimes answered the "active" one ($nin) by reading every document instead of the status
   * index. Active is everything not snoozed or closed, including threads stored without a status (as $nin was).
   * Pending ignores the status view, as before (the pending tab replaces the view's status filter).
   */
  private async countByStatus(match: Record<string, any>) {
    const rows = await this.conversationModel.aggregate<{ _id: unknown; n: number }>([
      { $match: match },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]).exec();
    const of = (status: ConversationStatus) => rows.find((row) => row._id === status)?.n || 0;
    const total = rows.reduce((sum, row) => sum + row.n, 0);
    return { active: total - of('snoozed') - of('closed'), snoozed: of('snoozed'), closed: of('closed'), pending: of('pending') };
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
    if (filters.rating) query.rating = filters.rating;
    if (filters.view === 'active') query.status = { $nin: ['snoozed', 'closed'] };
    else if (filters.view) query.status = filters.view;
    if (filters.tab === 'unread') query.unreadCount = { $gt: 0 };
    else if (filters.tab === 'needs_reply') Object.assign(query, ConversationsService.needsTeamReplyQuery());
    // Pending conversations the team parked (waiting on the customer or someone else), to come back to.
    else if (filters.tab === 'pending') query.status = 'pending';
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
    const stores = [...new Set(storeIds)].sort();
    const key = JSON.stringify([stores, days, tzOffsetMinutes]);
    return this.analyticsCache.get(key, stores, () => this.computeAnalytics(storeIds, days, tzOffsetMinutes));
  }

  private async computeAnalytics(storeIds: string[], days: number, tzOffsetMinutes: number) {
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

    // Streamed: a busy period covers most of the branch's threads, too many to hold in memory at once.
    const conversations = this.conversationModel
      .find(
        { storeId: { $in: storeIds }, $or: [{ lastMessageAt: { $gte: new Date(prevStart) } }, { lastMessageAt: { $exists: false } }] },
        { platform: 1, lastSentiment: 1, 'messages.from': 1, 'messages.type': 1, 'messages.timestamp': 1, 'messages.isManual': 1 },
      )
      .lean()
      .cursor({ batchSize: 500 });

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

    for await (const conv of conversations as AsyncIterable<any>) {
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
    return this.statsCache.get(storeId, [storeId], () => this.computeStats(storeId));
  }

  /**
   * Dashboard totals over every message of the branch. Only the fields the totals use leave MongoDB (no message
   * text, attachments or metadata), and threads are streamed instead of all being held in memory at once.
   * Text length is counted in code points ($strLenCP); JavaScript counted UTF-16 units, so an emoji now counts as
   * 1 character instead of 2 in the "hours saved" estimate.
   */
  private async computeStats(storeId: string) {
    const cursor = this.conversationModel.aggregate<{ platform: string; rating?: string | null; messages: { from: string; isManual?: boolean; timestamp: any; textLength: number }[] }>([
      { $match: { storeId } },
      {
        $project: {
          _id: 0,
          platform: 1,
          rating: 1,
          messages: {
            $map: {
              input: { $ifNull: ['$messages', []] },
              as: 'm',
              in: {
                from: '$$m.from',
                isManual: '$$m.isManual',
                timestamp: '$$m.timestamp',
                textLength: { $cond: [{ $eq: [{ $type: '$$m.text' }, 'string'] }, { $strLenCP: '$$m.text' }, 0] },
              },
            },
          },
        },
      },
    ]).cursor({ batchSize: 500 });
    const connectedChannels = await this.channelsService.findAllByStore(storeId);

    let totalConversations = 0;
    let totalMessages = 0;
    let aiReplies = 0;
    let totalAiChars = 0;
    let totalHumanResponseTime = 0;
    let humanResponseCount = 0;
    const platformCount: any = { whatsapp: 0, instagram: 0, facebook: 0, google_maps: 0 };
    const sentiments: any = { positive: 0, neutral: 0, negative: 0 };
    let unrated = 0;

    const last7Days: string[] = [];
    const timelineData: any = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last7Days.push(dateStr);
      timelineData[dateStr] = 0;
    }

    for await (const conv of cursor) {
      totalConversations++;
      totalMessages += conv.messages.length;
      const convMessages = conv.messages;
      for (let i = 0; i < convMessages.length; i++) {
        const msg = convMessages[i];
        if (msg.from === 'me' && msg.isManual !== true) {
          aiReplies++;
          totalAiChars += msg.textLength;
        }
        if (msg.from !== 'me' && i < convMessages.length - 1) {
          const nextMsg = convMessages[i+1];
          if (nextMsg.from === 'me' && nextMsg.isManual === true) {
            const diff = (new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) / 1000;
            if (diff > 0 && diff < 86400) { totalHumanResponseTime += diff; humanResponseCount++; }
          }
        }
        // A malformed timestamp used to throw (toISOString of an invalid date) and fail the whole dashboard.
        const time = new Date(msg.timestamp).getTime();
        if (!Number.isFinite(time)) continue;
        const mDate = new Date(time).toISOString().split('T')[0];
        if (timelineData.hasOwnProperty(mDate)) timelineData[mDate]++;
      }
      if (platformCount.hasOwnProperty(conv.platform)) platformCount[conv.platform]++;
      // Satisfaction comes from the customers' own ratings, not from guessing at their messages.
      if (conv.rating && sentiments.hasOwnProperty(conv.rating)) sentiments[conv.rating]++;
      else unrated++;
    }

    const wordsPerMinute = 40;
    const charsPerWord = 5;
    const estimatedMinutesSaved = (totalAiChars / charsPerWord) / wordsPerMinute;
    const avgHumanSpeedSeconds = humanResponseCount > 0 ? totalHumanResponseTime / humanResponseCount : 600;

    return {
      totalConversations,
      totalMessages,
      aiReplies,
      activeChannels: connectedChannels.length,
      hoursSaved: Math.round((estimatedMinutesSaved / 60) * 10) / 10,
      avgHumanSpeed: Math.round(avgHumanSpeedSeconds / 60),
      aiSpeed: 0.05,
      platformStats: Object.entries(platformCount).map(([name, value]) => ({ name, value })),
      sentimentStats: [
        { key: 'positive', name: 'راضٍ', value: sentiments.positive, color: '#22c55e' },
        { key: 'neutral', name: 'عادي', value: sentiments.neutral, color: '#94a3b8' },
        { key: 'negative', name: 'غير راضٍ', value: sentiments.negative, color: '#ef4444' }
      ],
      unratedConversations: unrated,
      timelineData: last7Days.map(date => ({ date: date.split('-').slice(1).join('/'), messages: timelineData[date] }))
    };
  }

  /**
   * WhatsApp threads of these numbers whose flow replies Meta refused for unpaid billing (131042) since `since`,
   * split into those the customer can still receive (they wrote after `since`, so the free-reply window is open)
   * and those whose window has passed. A node sent again successfully later is not listed twice.
   */
  async findPaymentFailedFlowReplies(phones: string[], storeIds: string[], since: number) {
    const eligible: { conversationId: string; customerPhone: string; storeId: string; customerName?: string; metaConnectionId?: string; nodes: { flowId: string; nodeId: string }[] }[] = [];
    let expired = 0;
    const at = (value: unknown) => (typeof value === 'number' ? value : new Date(value as any).getTime()) || 0;
    for (let i = 0; i < phones.length; i += 1000) {
      const docs = await this.conversationModel.find(
        {
          customerPhone: { $in: phones.slice(i, i + 1000) },
          storeId: { $in: storeIds },
          platform: 'whatsapp',
          messages: { $elemMatch: { 'metadata.source': 'flow', 'metadata.statusErrors.code': 131042 } },
        },
        { customerPhone: 1, storeId: 1, customerName: 1, metaConnectionId: 1, messages: { $slice: -40 } },
      ).lean().exec();
      for (const doc of docs) {
        const messages: any[] = doc.messages || [];
        const lastInbound = Math.max(0, ...messages.filter((m) => ConversationsService.isCustomerMessage(m)).map((m) => at(m.timestamp)));
        const failed = messages.filter((m) => m.metadata?.source === 'flow' && at(m.timestamp) >= since
          && (m.metadata?.statusErrors || []).some((e: any) => e?.code === 131042));
        if (!failed.length) continue;
        if (lastInbound < since) { expired += 1; continue; }
        const nodes = new Map<string, { flowId: string; nodeId: string }>();
        for (const message of failed) {
          const { flowId, nodeId } = message.metadata;
          const resentLater = messages.some((m) => m.from === 'me' && at(m.timestamp) > at(message.timestamp)
            && m.metadata?.flowId === flowId && m.metadata?.nodeId === nodeId && m.metadata?.status !== 'failed');
          if (flowId && nodeId && !resentLater) nodes.set(`${flowId}:${nodeId}`, { flowId, nodeId });
        }
        if (nodes.size) eligible.push({
          conversationId: String(doc._id), customerPhone: doc.customerPhone, storeId: doc.storeId,
          customerName: doc.customerName, metaConnectionId: doc.metaConnectionId, nodes: [...nodes.values()],
        });
      }
    }
    return { eligible, expired };
  }

  /** Each number's WhatsApp messages to these branches since `since`, oldest first (only the recent tail of each thread). */
  async findCustomerMessagesSince(phones: string[], storeIds: string[], since: number) {
    const byPhone = new Map<string, { at: number; type: string; text?: string }[]>();
    const at = (value: unknown) => (typeof value === 'number' ? value : new Date(value as any).getTime()) || 0;
    for (let i = 0; i < phones.length; i += 1000) {
      const docs = await this.conversationModel.find(
        { customerPhone: { $in: phones.slice(i, i + 1000) }, storeId: { $in: storeIds }, platform: 'whatsapp', lastMessageAt: { $gte: new Date(since) } },
        { customerPhone: 1, messages: { $slice: -300 } },
      ).lean().exec();
      for (const doc of docs) {
        const list = byPhone.get(doc.customerPhone) || [];
        for (const m of doc.messages || []) {
          if (ConversationsService.isCustomerMessage(m) && at(m.timestamp) >= since) list.push({ at: at(m.timestamp), type: m.type, text: m.text });
        }
        byPhone.set(doc.customerPhone, list);
      }
    }
    for (const list of byPhone.values()) list.sort((a, b) => a.at - b.at);
    return byPhone;
  }

  /** Why automatic replies are paused for this customer right now, or null when they are not. */
  async getAutoReplyPause(customerPhone: string, storeId: string, platform: string): Promise<string | null> {
    customerPhone = this.normalizeCustomerPhone(customerPhone, platform);
    const conversation = await this.conversationModel.findOne({ customerPhone, storeId, platform })
      .sort({ lastMessageAt: -1 })
      .select('aiEnabled aiDisabledUntil aiPausedReason')
      .lean();
    if (!conversation || conversation.aiEnabled !== false || !conversation.aiDisabledUntil) return null;
    if (new Date() >= conversation.aiDisabledUntil) return null;
    return conversation.aiPausedReason || 'manual';
  }

  async toggleAi(conversationId: string, enabled: boolean, reason: 'manual' | 'handoff' | 'ai_error' = 'manual') {
    const conversation = await this.conversationModel.findByIdAndUpdate(conversationId, {
      aiEnabled: enabled,
      aiDisabledUntil: enabled ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
      aiPausedReason: enabled ? null : reason,
    }, { returnDocument: 'after' });
    // "Needs a reply" depends on whether automatic replies are paused.
    this.invalidateCounts(conversation?.storeId);
    return conversation;
  }

  async updateFlowState(id: string, flowId: string | null, nodeId: string | null, invalidReplies = 0) {
    return this.conversationModel.findByIdAndUpdate(id, {
      currentFlowId: flowId,
      currentFlowNodeId: nodeId,
      flowInvalidReplies: invalidReplies,
    });
  }

  async updateTags(conversationId: string, tags: string[]) {
    const conversation = await this.conversationModel.findByIdAndUpdate(conversationId, { tags: Array.from(new Set(tags)) }, { returnDocument: 'after' });
    this.invalidateCounts(conversation?.storeId);
    return conversation;
  }

  /**
   * Asks the customer to rate the conversation, as WhatsApp reply buttons, once the team closes it.
   * Skipped when the 24h window for free-form messages has passed, or when the customer was asked in the last
   * 24 hours or has not written since the last request.
   */
  async sendRatingRequest(conversationId: string) {
    const conversation = await this.conversationModel
      .findById(conversationId, { storeId: 1, platform: 1, customerPhone: 1, metaConnectionId: 1, messages: { $slice: -50 } })
      .lean().exec();
    if (!conversation || conversation.platform !== 'whatsapp') return;
    const lastCustomerAt = Math.max(0, ...(conversation.messages || [])
      .filter((m: any) => ConversationsService.isCustomerMessage(m))
      .map((m: any) => (typeof m.timestamp === 'number' ? m.timestamp : new Date(m.timestamp).getTime()) || 0));
    if (!lastCustomerAt || Date.now() - lastCustomerAt > RATING_WINDOW_MS) return;

    // Claimed atomically so closing twice in quick succession sends one request. Asked again only once the
    // customer has written since, and the cooldown has passed: closing, reopening and closing must not repeat it.
    const claimed = await this.conversationModel.findOneAndUpdate(
      {
        _id: conversationId,
        $or: [
          { ratingRequestedAt: null },
          { ratingRequestedAt: { $lt: new Date(Math.min(lastCustomerAt, Date.now() - RATING_COOLDOWN_MS)) } },
        ],
      },
      { $set: { ratingRequestedAt: new Date() } },
      // The previous value comes back, to restore it if the send fails.
      { returnDocument: 'before', projection: { _id: 1, ratingRequestedAt: 1 } },
    ).lean().exec();
    if (!claimed) return;

    const { storeId, customerPhone } = conversation;
    const channels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
    const channel = channels.find((c) => c.type === 'whatsapp' && (!conversation.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
      || channels.find((c) => c.type === 'whatsapp');
    if (!channel) return;

    const walletCharge = await this.billingService.chargeMetaUsageForStore(storeId, MetaUsageType.INTERACTIVE, {
      referenceId: conversationId,
      source: 'rating_request',
    });
    let providerResponse: any;
    try {
      providerResponse = await this.messagingService.sendWhatsAppPayload(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, customerPhone, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: RATING_PROMPT },
          action: { buttons: RATING_OPTIONS.map((o) => ({ type: 'reply', reply: { id: `${RATING_REPLY_PREFIX}${o.value}`, title: o.label } })) },
        },
      });
    } catch (error) {
      if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'Rating request send failed');
      await this.conversationModel.updateOne({ _id: conversationId }, { $set: { ratingRequestedAt: claimed.ratingRequestedAt ?? null } });
      await this.addSystemError(customerPhone, storeId, 'whatsapp', `لم تُرسل رسالة التقييم. ${this.getSendErrorText(error)}`, error);
      return;
    }

    const whatsappMessageId = providerResponse?.messages?.[0]?.id || providerResponse?.message_id;
    const messageData = {
      from: 'me',
      text: `${RATING_PROMPT}\n${RATING_OPTIONS.map((o) => `[${o.label}]`).join(' ')}`,
      type: 'text',
      isManual: false,
      timestamp: Date.now(),
      metadata: {
        source: 'rating_request',
        ...(whatsappMessageId ? { whatsappMessageId, status: 'accepted', walletTransactionId: walletCharge?.id || null, metaConnectionId: channel.credentials?.metaConnectionId || conversation.metaConnectionId || null } : {}),
      },
    };
    await this.addMessage(customerPhone, storeId, 'whatsapp', messageData);
    this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', { ...messageData, customerPhone, platform: 'whatsapp', storeId });
  }

  /** The rating a tapped reply button stands for, or null when the tap was not on a rating message. */
  static ratingFromReply(replyId?: string | null): ConversationRating | null {
    if (!replyId?.startsWith(RATING_REPLY_PREFIX)) return null;
    const value = replyId.slice(RATING_REPLY_PREFIX.length);
    return (CONVERSATION_RATINGS as readonly string[]).includes(value) ? value as ConversationRating : null;
  }

  /**
   * Stores the customer's rating tap. Unlike other customer messages it does not reopen the conversation
   * or wait for a reply: the team closed it, and a rating is the customer's last word.
   */
  async recordRating(customerPhone: string, storeId: string, rating: ConversationRating, messageData: any) {
    customerPhone = this.normalizeCustomerPhone(customerPhone, 'whatsapp');
    const { customerName, ...message } = messageData;
    const at = new Date(message.timestamp || Date.now());
    const conversation = await this.conversationModel.findOneAndUpdate(
      { customerPhone, storeId, platform: 'whatsapp' },
      {
        $push: { messages: message },
        $set: {
          lastMessage: message.text, lastMessageAt: new Date(), awaitingReply: false,
          rating, ratedAt: at, lastSentiment: rating,
          ...(customerName ? { customerName } : {}),
          ...(message.customerId ? { customerId: message.customerId } : {}),
        },
      },
      { returnDocument: 'after', sort: { lastMessageAt: -1 }, projection: { _id: 1 } },
    ).lean().exec();
    if (!conversation) return;
    this.eventsGateway.server.to(`store_${storeId}`).emit('conversation_rating', { conversationId: String(conversation._id), rating, ratedAt: at });
  }

  /**
   * Blocks or unblocks the customer of a WhatsApp conversation for the whole organization. While blocked their
   * messages are dropped on arrival and campaigns skip them; blocking also closes their conversations (without
   * a rating request). Meta is asked to block the number too, which it only allows within 24h of their last message,
   * so `metaBlocked` says whether WhatsApp itself now stops them.
   */
  async setCustomerBlocked(conversationId: string, storeId: string, organizationId: string, blocked: boolean) {
    const conversation = await this.conversationModel.findOne({ _id: conversationId, storeId }, { platform: 1, customerPhone: 1, metaConnectionId: 1 }).lean().exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.platform !== 'whatsapp') throw new BadRequestException('الحظر متاح لمحادثات واتساب فقط.');
    const phone = conversation.customerPhone;
    await this.customersService.setBlocked(organizationId, phone, blocked);

    const storeIds = await this.customersService.organizationStoreIds(organizationId);
    const filter = { customerPhone: phone, platform: 'whatsapp', storeId: { $in: storeIds } };
    const now = new Date();
    await this.conversationModel.updateMany(filter, {
      $set: blocked
        ? { blockedAt: now, status: 'closed', snoozedUntil: null, statusUpdatedAt: now, unreadCount: 0, awaitingReply: false }
        : { blockedAt: null },
    });
    const affected = await this.conversationModel.find(filter, { storeId: 1, status: 1 }).lean().exec();
    this.invalidateCounts(...affected.map((row) => row.storeId));
    for (const row of affected) {
      this.eventsGateway.server.to(`store_${row.storeId}`).emit('conversation_status', { conversationId: String(row._id), status: row.status, snoozedUntil: null });
      this.eventsGateway.server.to(`store_${row.storeId}`).emit('conversation_blocked', { conversationId: String(row._id), blockedAt: blocked ? now : null });
    }

    let metaBlocked = false;
    let metaError: string | null = null;
    try {
      const channels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
      const channel = channels.find((c) => c.type === 'whatsapp' && (!conversation.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
        || channels.find((c) => c.type === 'whatsapp');
      if (!channel) throw new Error('No linked WhatsApp channel');
      const result = await this.messagingService.setWhatsAppUserBlocked(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, phone, blocked);
      const failed = result?.block_users?.failed_users || [];
      metaBlocked = !failed.length;
      if (failed.length) metaError = failed[0]?.errors?.[0]?.message || 'رفضت Meta الطلب';
    } catch (error: any) {
      metaError = error?.response?.data?.error?.message || error?.message || 'تعذر الاتصال بـ Meta';
      this.logger.warn(`Meta ${blocked ? 'block' : 'unblock'} of ${phone} failed: ${metaError}`);
    }
    return { blocked, blockedAt: blocked ? now : null, metaBlocked, metaError };
  }

  /**
   * Sends an image, video, audio or document from the inbox (WhatsApp only). The file is kept next to received
   * media so the thread shows it the same way, uploaded to Meta, and sent with the optional caption.
   */
  async sendAttachment(conversationId: string, storeId: string, file: UploadedChatFile, caption?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('اختر ملفًا لإرساله.');
    const spec = WHATSAPP_MEDIA_TYPES[file.mimetype];
    if (!spec) throw new BadRequestException(WHATSAPP_MEDIA_UNSUPPORTED);
    if (file.buffer.length > spec.max) throw new BadRequestException(`حجم الملف أكبر من حد واتساب (${spec.max / (1024 * 1024)} ميجابايت).`);
    const conversation = await this.conversationModel.findOne({ _id: conversationId, storeId }).select('-messages');
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.blockedAt) throw new BadRequestException('هذا العميل محظور. ألغِ الحظر أولًا لمراسلته.');
    if (conversation.platform !== 'whatsapp') throw new BadRequestException('إرسال المرفقات متاح لمحادثات واتساب فقط.');
    const channels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
    const channel = channels.find((c) => c.type === 'whatsapp' && (!conversation.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
      || channels.find((c) => c.type === 'whatsapp');
    if (!channel) throw new NotFoundException('No linked whatsapp channel found.');

    const filename = `${Date.now()}-out-${spec.type}-${randomBytes(4).toString('hex')}${spec.ext}`;
    const root = this.whatsAppMediaService.getWhatsAppUploadRoot();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    writeFileSync(join(root, filename), file.buffer);
    const originalFilename = Buffer.from(file.originalname || filename, 'latin1').toString('utf8');
    const text = caption?.trim() || '';

    const walletCharge = await this.billingService.chargeMetaUsageForStore(storeId, MetaUsageType.SESSION_TEXT, {
      referenceId: conversationId,
      source: 'manual_agent_media',
    });
    let providerResponse: any;
    let mediaId: string;
    try {
      mediaId = await this.messagingService.uploadWhatsAppMedia(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, filename, {
        buffer: file.buffer, mimeType: file.mimetype, filename: originalFilename,
      });
      const media: Record<string, string> = { id: mediaId };
      if (text && spec.type !== 'audio') media.caption = text;
      if (spec.type === 'document') media.filename = originalFilename;
      providerResponse = await this.messagingService.sendWhatsAppPayload(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, conversation.customerPhone, { type: spec.type, [spec.type]: media });
    } catch (error) {
      if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'Manual WhatsApp media send failed');
      const errorText = this.getSendErrorText(error);
      await this.addSystemError(conversation.customerPhone, storeId, conversation.platform, errorText, error);
      throw new InternalServerErrorException(errorText);
    }

    const whatsappMessageId = providerResponse?.messages?.[0]?.id || providerResponse?.message_id;
    const messageData = {
      from: 'me',
      text: text || `[${spec.type}]`,
      type: spec.type,
      attachments: [{ id: mediaId, type: spec.type, mimeType: file.mimetype, filename, originalFilename, caption: text || undefined, url: `/conversations/attachments/${filename}` }],
      isManual: true,
      timestamp: Date.now(),
      metadata: whatsappMessageId ? { whatsappMessageId, status: 'accepted', walletTransactionId: walletCharge?.id || null, metaConnectionId: channel.credentials?.metaConnectionId || conversation.metaConnectionId || null } : {},
    };
    await this.addMessage(conversation.customerPhone, storeId, conversation.platform, messageData);
    // Same as a typed reply: the team has taken over, so automatic replies pause for a while.
    await this.conversationModel.findByIdAndUpdate(conversationId, { aiEnabled: false, aiDisabledUntil: new Date(Date.now() + 30 * 60 * 1000), aiPausedReason: 'agent_reply' });
    this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', { ...messageData, customerPhone: conversation.customerPhone, platform: conversation.platform, storeId });
    return { status: 'sent', message: messageData };
  }

  async sendMessage(conversationId: string, storeId: string, text: string) {
    const conversation = await this.conversationModel.findOne({ _id: conversationId, storeId }).select('-messages');
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.blockedAt) throw new BadRequestException('هذا العميل محظور. ألغِ الحظر أولًا لمراسلته.');
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
        await this.addSystemError(conversation.customerPhone, storeId, conversation.platform, errorText, error, text);
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
    await this.conversationModel.findByIdAndUpdate(conversationId, { aiEnabled: false, aiDisabledUntil: thirtyMinutesFromNow, aiPausedReason: 'agent_reply' });
    const store = await this.channelsService.getStoreContext(storeId);
    const ownerId = store.owner?.id || (typeof store.owner === 'string' ? store.owner : null);
    if (ownerId) this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', { ...messageData, customerPhone: conversation.customerPhone, platform: conversation.platform, storeId });
    return { status: 'sent', message: messageData };
  }

  async addSystemError(customerPhone: string, storeId: string, platform: string, text: string, error?: any, failedText?: string) {
    const messageData = {
      from: 'system',
      text,
      type: 'system_error',
      timestamp: Date.now(),
      metadata: {
        error: error?.response?.data?.error || { message: error?.message || text },
        // The agent's text that failed to send, so the inbox can offer a resend.
        ...(failedText ? { failedText } : {}),
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
