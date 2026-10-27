import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { EventsGateway } from '../events/events.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import { ChannelsService } from '../channels/channels.service';
import { AiService } from '../ai/ai.service';
import { CustomersService } from '../customers/customers.service';
import { existsSync, readFileSync } from 'fs';
import { FlowsService } from '../flows/flows.service';
import { Flow } from '../flows/entities/flow.entity';
import { continueFlow, fillVariables, MAX_LIST_ROWS, MAX_REPLY_BUTTONS, NEW_CONVERSATION_GAP_MS, nodeAsText, startFlow } from '../flows/flow-engine';
import type { FlowMedia, FlowNode, FlowStep } from '../flows/flow-engine';
import { MessagingService } from '../channels/messaging.service';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';
import { MetaWhatsAppService } from '../meta-whatsapp/meta-whatsapp.service';
import { BillingService } from '../billing/billing.service';
import { MetaUsageType } from '../billing/entities/pricing-rule.entity';
import { WhatsAppCampaignsService } from '../meta-whatsapp/whatsapp-campaigns.service';

type NormalizedWhatsAppMessage = {
  from: string;
  text: string;
  type: string;
  timestamp: number;
  attachments: Record<string, any>[];
  metadata: Record<string, any>;
};

/** One outgoing message produced by a flow node; `payload` is the Cloud API body (null off WhatsApp). */
type FlowMessagePart = {
  payload: Record<string, any> | null;
  interactive: boolean;
  type: string;
  text: string;
  attachments: Record<string, any>[];
};

/** Failed flow replies are re-sent only to customers who wrote within this many hours (WhatsApp allows 24). */
const FLOW_RETRY_WINDOW_HOURS = 20;
/** Re-sends run in the background at about FLOW_RETRY_WORKERS / FLOW_RETRY_PACE_MS customers a second. */
const FLOW_RETRY_WORKERS = 4;
const FLOW_RETRY_PACE_MS = 400;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  /** Campaigns whose failed flow replies are being re-sent right now. */
  private readonly flowRetries = new Set<string>();

  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly channelsService: ChannelsService,
    private readonly aiService: AiService,
    private readonly customersService: CustomersService,
    private readonly flowsService: FlowsService,
    private readonly messagingService: MessagingService,
    private readonly whatsAppMediaService: WhatsAppMediaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly billingService: BillingService,
    private readonly campaignsService: WhatsAppCampaignsService,
  ) {}

  verifyWhatsApp(mode: string, token: string, challenge: string) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'labbaik_whatsapp_verify';
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return 'Verification failed';
  }

  async handleGenericWebhook(from: string, text: string, platform: string) {
    try {
      const channel = await this.channelsService.findByProviderId('123456789');
      if (channel && channel.store) {
        const storeId = channel.store.id;
        const currentStore = await this.channelsService.getStoreContext(storeId);
        const ownerId = currentStore.owner?.id || (typeof currentStore.owner === 'string' ? currentStore.owner : 'global');

        const customer = await this.customersService.findOrCreate(currentStore, from, {
          fullName: `العميل ${from.substring(0, 5)}...`,
          phoneNumber: platform === 'whatsapp' ? from : undefined,
          whatsappId: platform === 'whatsapp' ? from : undefined,
          instagramId: platform === 'instagram' ? from : undefined,
          facebookId: platform === 'facebook' ? from : undefined,
        }, platform);

        const [sentiment, tags] = await Promise.all([
          this.aiService.analyzeSentiment(text),
          this.aiService.categorizeMessage(text),
        ]);

        const savedConv = await this.conversationsService.addMessage(from, storeId, platform, {
          from, text, type: 'text', timestamp: Date.now(), sentiment, tags, customerId: customer.id,
        });

        if (ownerId) {
          this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', {
            platform, from, text, type: 'text', timestamp: Date.now(), storeId, unreadCount: (savedConv as any).unreadCount, sentiment, tags, customerId: customer.id,
          });
        }

        await this.processFlowOrAi(from, text, storeId, platform, currentStore, ownerId, savedConv);
      }
      return { status: 'success' };
    } catch (error) {
      this.logger.error('Error in generic webhook', error.stack);
      return { status: 'error' };
    }
  }

  async handleWhatsAppMessage(payload: any, signature?: string, rawBody?: Buffer) {
    this.verifyMetaSignature(signature, rawBody, payload);

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const metadata = value?.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const messages = value?.messages || [];

        if (!phoneNumberId || messages.length === 0) continue;

        const channel = await this.channelsService.findByProviderId(phoneNumberId);
        if (!channel || !channel.store) {
          this.logger.warn(`No WhatsApp channel found for phone number id ${phoneNumberId}`);
          continue;
        }

        for (const message of messages) {
          if (message?.id && await this.conversationsService.hasWhatsAppMessage(channel.store.id, message.id)) continue;
          await this.processWhatsAppCustomerMessage(message, channel, metadata, undefined, this.getWhatsAppProfileName(value, message?.from));
        }
      }
    }

    return { status: 'success' };
  }

  async verifyTenantWhatsApp(connectionId: string, mode: string, token: string, challenge: string) {
    return this.metaWhatsAppService.verifyWebhook(connectionId, mode, token, challenge);
  }

  async handleTenantWhatsAppMessage(connectionId: string, payload: any, signature?: string, rawBody?: Buffer) {
    const connection = await this.metaWhatsAppService.getWebhookConnection(connectionId);
    this.metaWhatsAppService.verifyWebhookSignature(connection, signature, rawBody, payload);

    const entries = payload.entry || [];
    const organizationStoreIds = await this.metaWhatsAppService.getOrganizationStoreIds(connection);
    for (const entry of entries) {
      if (entry?.id && String(entry.id) !== String(connection.wabaId)) {
        this.logger.warn(`Rejected webhook WABA mismatch for connection ${connectionId}`);
        continue;
      }
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};
        const phoneNumberId = metadata?.phone_number_id;
        if (phoneNumberId && String(phoneNumberId) !== String(connection.phoneNumberId)) {
          this.logger.warn(`Rejected webhook phone_number_id mismatch for connection ${connectionId}`);
          continue;
        }

        for (const status of value?.statuses || []) {
          await this.processWhatsAppStatusAcrossStores(organizationStoreIds, status);
        }

        for (const message of value?.messages || []) {
          if (message?.id && await this.conversationsService.hasWhatsAppMessageInStores(organizationStoreIds, message.id)) {
            this.logger.debug(`Ignoring duplicate WhatsApp message ${message.id}`);
            continue;
          }
          const targetStore = await this.metaWhatsAppService.resolveInboundStore(connection, message?.from || '');
          const channel = await this.metaWhatsAppService.findChannelForConnection(connection, targetStore.id);
          await this.processWhatsAppCustomerMessage(message, channel, metadata, connection.id, this.getWhatsAppProfileName(value, message?.from));
        }
      }
    }

    await this.metaWhatsAppService.touchWebhook(connectionId);
    return { status: 'success' };
  }

  private async processWhatsAppStatusAcrossStores(storeIds: string[], status: any) {
    if (!status?.id || !status?.status || !storeIds.length) return;
    const timestamp = this.parseWhatsAppTimestamp(status.timestamp);
    await this.trackCampaign(() => this.campaignsService.recordStatus({ id: status.id, status: status.status, timestamp, errors: status.errors }));
    const conversation = await this.conversationsService.updateWhatsAppMessageStatusInStores(
      storeIds,
      status.id,
      status.status,
      timestamp,
      status.errors,
    );
    if (!conversation) return;
    if (String(status.status).toLowerCase() === 'failed') {
      const failedMessage: any = (conversation.messages || []).find((message: any) => message?.metadata?.whatsappMessageId === status.id);
      const walletTransactionId = failedMessage?.metadata?.walletTransactionId;
      if (walletTransactionId) await this.billingService.refundMetaUsage(walletTransactionId, 'Meta delivery failed webhook');
    }
    this.eventsGateway.server.to(`store_${conversation.storeId}`).emit('message_status', {
      storeId: conversation.storeId,
      whatsappMessageId: status.id,
      status: status.status,
      timestamp,
      errors: status.errors || [],
    });
  }

  private async processWhatsAppStatus(storeId: string, status: any) {
    if (!status?.id || !status?.status) return;
    const timestamp = this.parseWhatsAppTimestamp(status.timestamp);
    await this.trackCampaign(() => this.campaignsService.recordStatus({ id: status.id, status: status.status, timestamp, errors: status.errors }));
    const conversation = await this.conversationsService.updateWhatsAppMessageStatus(
      storeId,
      status.id,
      status.status,
      timestamp,
      status.errors,
    );
    if (conversation && String(status.status).toLowerCase() === 'failed') {
      const failedMessage: any = (conversation.messages || []).find((message: any) => message?.metadata?.whatsappMessageId === status.id);
      const walletTransactionId = failedMessage?.metadata?.walletTransactionId;
      if (walletTransactionId) {
        await this.billingService.refundMetaUsage(walletTransactionId, 'Meta delivery failed webhook');
      }
    }
    if (conversation) {
      const store = await this.channelsService.getStoreContext(storeId);
      const ownerId = store.owner?.id || (typeof store.owner === 'string' ? store.owner : null);
      if (ownerId) {
        this.eventsGateway.server.to(`store_${storeId}`).emit('message_status', {
          storeId,
          whatsappMessageId: status.id,
          status: status.status,
          timestamp,
          errors: status.errors || [],
        });
      }
    }
  }

  /** Campaign statistics are best-effort and must never break webhook processing. */
  private async trackCampaign(task: () => Promise<void>) {
    try {
      await task();
    } catch (error: any) {
      this.logger.warn(`Campaign tracking failed: ${error.message}`);
    }
  }

  private verifyMetaSignature(signature?: string, rawBody?: Buffer, payload?: any) {
    const appSecret = this.configService.get<string>('META_APP_SECRET');
    if (!appSecret) throw new UnauthorizedException('META_APP_SECRET is required for WhatsApp webhooks');
    if (!signature?.startsWith('sha256=')) throw new UnauthorizedException('Missing Meta webhook signature');

    const body = rawBody || Buffer.from(JSON.stringify(payload || {}));
    const expected = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }
  }

  // Meta sends the sender's WhatsApp display name in value.contacts[].profile.name (profile photos are not exposed).
  private getWhatsAppProfileName(value: any, from?: string): string | undefined {
    const contacts: any[] = value?.contacts || [];
    const contact = contacts.find((c) => c?.wa_id && from && String(c.wa_id) === String(from)) || contacts[0];
    const name = String(contact?.profile?.name || '').trim();
    return name || undefined;
  }

  private async processWhatsAppCustomerMessage(message: any, channel: any, webhookMetadata: any, metaConnectionId?: string, profileName?: string) {
    const storeId = channel.store.id;
    const currentStore = await this.channelsService.getStoreContext(storeId);
    const ownerId = currentStore.owner?.id || (typeof currentStore.owner === 'string' ? currentStore.owner : 'global');
    const normalized = await this.normalizeWhatsAppMessage(message, channel.credentials.accessToken, webhookMetadata);
    if (metaConnectionId) normalized.metadata.metaConnectionId = metaConnectionId;

    this.logger.log(`Incoming WhatsApp ${normalized.type} from ${normalized.from}: [${normalized.text}]`);

    const customer = await this.customersService.findOrCreate(currentStore, normalized.from, {
      fullName: profileName || `WhatsApp ${normalized.from}`,
      phoneNumber: normalized.from,
      whatsappId: normalized.from,
    }, 'whatsapp');
    // Replace our generated placeholder with the real WhatsApp name, without overwriting names the team edited.
    await this.customersService.updateProfileName(customer, profileName, normalized.from);
    const customerName = this.customersService.isPlaceholderName(customer.fullName, normalized.from) ? profileName : customer.fullName;

    const analysisText = normalized.text || `[${normalized.type}]`;
    const [sentiment, tags] = await Promise.all([
      this.aiService.analyzeSentiment(analysisText),
      this.aiService.categorizeMessage(analysisText),
    ]);

    const savedConv = await this.conversationsService.addMessage(normalized.from, storeId, 'whatsapp', {
      from: normalized.from,
      text: normalized.text,
      type: normalized.type,
      timestamp: normalized.timestamp,
      attachments: normalized.attachments,
      metadata: normalized.metadata,
      sentiment,
      tags,
      customerId: customer.id,
      customerName,
    });
    await this.trackCampaign(() => this.campaignsService.recordReply(currentStore.organizationId, normalized.from, {
      contextId: message?.context?.id,
      type: normalized.type,
      text: normalized.text,
      timestamp: normalized.timestamp,
    }));

    if (ownerId) {
      this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', {
        platform: 'whatsapp',
        from: normalized.from,
        text: normalized.text,
        type: normalized.type,
        attachments: normalized.attachments,
        metadata: normalized.metadata,
        timestamp: normalized.timestamp,
        storeId,
        sentiment,
        tags,
        customerId: customer.id,
        customerName,
      });
    }

    try {
      await this.processFlowOrAi(normalized.from, analysisText, storeId, 'whatsapp', currentStore, ownerId, savedConv, normalized.metadata?.reply?.id);
    } catch (error) {
      this.logger.error(`WhatsApp auto-reply failed for ${normalized.from}: ${error.message}`);
      await this.conversationsService.addSystemError(
        normalized.from,
        storeId,
        'whatsapp',
        this.getSendErrorText(error),
        error,
      );
    }
  }

  private async normalizeWhatsAppMessage(message: any, encryptedAccessToken: string, webhookMetadata: any): Promise<NormalizedWhatsAppMessage> {
    const messageType = message.type || 'unsupported';
    const timestamp = this.parseWhatsAppTimestamp(message.timestamp);
    const baseMetadata = {
      whatsappMessageId: message.id,
      rawType: message.type,
      phoneNumberId: webhookMetadata?.phone_number_id,
      displayPhoneNumber: webhookMetadata?.display_phone_number,
    };

    if (message.text?.body) {
      return { from: message.from, text: message.text.body, type: 'text', timestamp, attachments: [], metadata: baseMetadata };
    }

    if (message.button) {
      return { from: message.from, text: message.button.text || message.button.payload || '', type: 'button', timestamp, attachments: [], metadata: { ...baseMetadata, button: message.button } };
    }

    if (message.interactive?.button_reply) {
      const reply = message.interactive.button_reply;
      return { from: message.from, text: reply.title || reply.id || '', type: 'interactive_button', timestamp, attachments: [], metadata: { ...baseMetadata, reply } };
    }

    if (message.interactive?.list_reply) {
      const reply = message.interactive.list_reply;
      return { from: message.from, text: reply.title || reply.description || reply.id || '', type: 'interactive_list', timestamp, attachments: [], metadata: { ...baseMetadata, reply } };
    }

    if (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType)) {
      const media = message[messageType];
      const attachment = await this.whatsAppMediaService.safeDownloadMedia(media, messageType, encryptedAccessToken);
      const text = media?.caption || attachment.originalFilename || `[${messageType}]`;
      return { from: message.from, text, type: messageType, timestamp, attachments: [attachment], metadata: { ...baseMetadata, media } };
    }

    if (message.location) {
      const location = message.location;
      const text = location.name || location.address || `Location: ${location.latitude}, ${location.longitude}`;
      return { from: message.from, text, type: 'location', timestamp, attachments: [], metadata: { ...baseMetadata, location } };
    }

    if (message.contacts) {
      const names = message.contacts.map((contact: any) => contact.name?.formatted_name || contact.name?.first_name || 'Contact');
      return { from: message.from, text: names.join(', '), type: 'contacts', timestamp, attachments: [], metadata: { ...baseMetadata, contacts: message.contacts } };
    }

    return {
      from: message.from,
      text: `[Unsupported WhatsApp message: ${messageType}]`,
      type: 'unsupported',
      timestamp,
      attachments: [],
      metadata: { ...baseMetadata, unsupported: message },
    };
  }

  private parseWhatsAppTimestamp(timestamp: any) {
    const numericTimestamp = Number(timestamp);
    if (!Number.isFinite(numericTimestamp)) return Date.now();
    return numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  }

  private async processFlowOrAi(from: string, text: string, storeId: string, platform: string, store: any, ownerId: any, conversation: any, replyId?: string) {
    // A team pause (manual, agent reply, handoff) stops everything; an AI failure only stops the AI, so flows keep working.
    const pause = await this.conversationsService.getAutoReplyPause(from, storeId, platform);
    if (pause && pause !== 'ai_error') {
      this.logger.log(`Auto-reply paused (${pause}) for ${from}; skipping flows and AI`);
      return false;
    }

    let releasedFlowId: string | null = null;
    if (conversation.currentFlowId && conversation.currentFlowNodeId) {
      const flow = await this.flowsService.findLive(conversation.currentFlowId, storeId, store?.organizationId);
      if (flow) {
        const step = continueFlow(flow, { nodeId: conversation.currentFlowNodeId, invalidReplies: conversation.flowInvalidReplies || 0 }, text, replyId);
        if (!step.released) {
          await this.runFlowStep(step, flow, from, storeId, platform, conversation);
          return true;
        }
        this.logger.log(`Flow ${flow.id} released ${from} after repeated replies outside its options`);
        releasedFlowId = flow.id;
      }
      await this.conversationsService.updateFlowState(conversation._id, null, null);
    }

    const flow = await this.flowsService.findTriggered(storeId, store?.organizationId, text, this.isNewConversation(conversation));
    // A customer who just left a flow by ignoring its options is not pulled straight back into it.
    if (flow && flow.id !== releasedFlowId) {
      this.logger.log(`Starting flow ${flow.id} for ${from}`);
      await this.runFlowStep(startFlow(flow), flow, from, storeId, platform, conversation);
      return true;
    }

    if (pause === 'ai_error') return false;
    const aiScheduledAllowed = this.shouldAiRespond(store);
    if (aiScheduledAllowed) {
      await this.processAiResponse(from, text, storeId, platform, store, String(ownerId), conversation);
      return true;
    }

    return false;
  }

  /** First message in this thread, or the first after a day of silence. */
  private isNewConversation(conversation: any) {
    const messages: any[] = conversation?.messages || [];
    if (messages.length <= 1) return true;
    const latest = Number(messages[messages.length - 1]?.timestamp) || Date.now();
    const previous = Number(messages[messages.length - 2]?.timestamp) || 0;
    return latest - previous > NEW_CONVERSATION_GAP_MS;
  }

  /**
   * Flow replies to a campaign's responders that Meta refused while the WhatsApp account had unpaid billing.
   * Only customers who wrote within FLOW_RETRY_WINDOW_HOURS are offered: past 24h a free-form reply is no longer
   * allowed, and the margin keeps a re-send from landing just after the window closes.
   */
  async previewCampaignFlowRetry(userId: string, organizationId: string | undefined, campaignId: string) {
    const { campaign, phones } = await this.campaignsService.repliedRecipientsForUser(userId, organizationId, campaignId);
    const since = Date.now() - FLOW_RETRY_WINDOW_HOURS * 3600 * 1000;
    const { eligible, expired } = await this.conversationsService.findPaymentFailedFlowReplies(phones, campaign.storeIds, since);
    return { campaign, eligible, expired, running: this.flowRetries.has(campaignId) };
  }

  async startCampaignFlowRetry(userId: string, organizationId: string | undefined, campaignId: string) {
    if (this.flowRetries.has(campaignId)) throw new BadRequestException('إعادة الإرسال جارية بالفعل لهذه الحملة.');
    const { campaign, eligible, expired } = await this.previewCampaignFlowRetry(userId, organizationId, campaignId);
    if (!eligible.length) throw new BadRequestException('لا توجد ردود تدفق فاشلة بسبب الدفع ضمن آخر 20 ساعة.');
    this.flowRetries.add(campaignId);
    void this.resendFlowReplies(campaign.organizationId, eligible).finally(() => this.flowRetries.delete(campaignId));
    return { started: eligible.length, messages: eligible.reduce((sum, item) => sum + item.nodes.length, 0), expired };
  }

  private async resendFlowReplies(organizationId: string, targets: Awaited<ReturnType<ConversationsService['findPaymentFailedFlowReplies']>>['eligible']) {
    const queue = [...targets];
    let sent = 0;
    let failed = 0;
    const worker = async () => {
      for (let target = queue.shift(); target; target = queue.shift()) {
        try {
          const channels = await this.channelsService.findAllByStore(target.storeId, { maskCredentials: false });
          const channel = channels.find((c) => c.type === 'whatsapp' && (!target.metaConnectionId || c.credentials?.metaConnectionId === target.metaConnectionId))
            || channels.find((c) => c.type === 'whatsapp');
          if (!channel) throw new Error('no WhatsApp channel');
          const conversation = { _id: target.conversationId, customerName: target.customerName, metaConnectionId: target.metaConnectionId };
          for (const { flowId, nodeId } of target.nodes) {
            const flow = await this.flowsService.findLive(flowId, target.storeId, organizationId);
            const node = flow?.nodes?.find((item: any) => item.id === nodeId);
            if (flow && node) await this.sendFlowNode(node, flow, target.customerPhone, target.storeId, 'whatsapp', conversation, channel);
          }
          sent += 1;
        } catch (error: any) {
          failed += 1;
          this.logger.warn(`Flow retry failed for ${target.customerPhone}: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, FLOW_RETRY_PACE_MS));
      }
    };
    await Promise.all(Array.from({ length: FLOW_RETRY_WORKERS }, worker));
    this.logger.log(`Flow retry finished: ${sent} customers re-sent, ${failed} failed`);
  }

  private async runFlowStep(step: FlowStep, flow: Flow, from: string, storeId: string, platform: string, conversation: any) {
    // Saved before sending so a quick second message from the customer sees where the flow is.
    await this.conversationsService.updateFlowState(conversation._id, step.state ? flow.id : null, step.state?.nodeId ?? null, step.state?.invalidReplies ?? 0);
    const availableChannels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
    const channel = availableChannels.find(c => c.type === platform && (!conversation?.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
      || availableChannels.find(c => c.type === platform);
    for (const node of step.send) {
      await this.sendFlowNode(node, flow, from, storeId, platform, conversation, channel);
    }
    if (step.handoff) {
      await this.conversationsService.toggleAi(String(conversation._id), false, 'handoff');
      this.eventsGateway.server.to(`store_${storeId}`).emit('flow_handoff', { storeId, conversationId: String(conversation._id), customerPhone: from, flowId: flow.id });
    }
  }

  private async sendFlowNode(node: FlowNode, flow: Flow, from: string, storeId: string, platform: string, conversation: any, channel: any) {
    const text = fillVariables(node.data?.text || '', { name: conversation?.customerName, phone: from });
    const parts: FlowMessagePart[] = platform === 'whatsapp' && channel
      ? await this.whatsAppFlowParts(node, text, channel)
      : [{ payload: null, interactive: false, type: 'text', text: nodeAsText(node, text), attachments: [] }];

    for (const part of parts) {
      if (!part.payload && !part.text) continue;
      let providerResponse: any = null;
      let walletCharge: any = null;
      if (channel) {
        if (platform === 'whatsapp') {
          walletCharge = await this.billingService.chargeMetaUsageForStore(
            storeId,
            part.interactive ? MetaUsageType.INTERACTIVE : MetaUsageType.SESSION_TEXT,
            { referenceId: String(conversation._id), source: 'flow', flowId: flow.id, nodeId: node.id },
          );
        }
        try {
          if (platform === 'whatsapp' && part.payload) {
            providerResponse = await this.messagingService.sendWhatsAppPayload(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, from, part.payload);
          } else if (platform === 'instagram') {
            providerResponse = await this.messagingService.sendInstagramMessage(channel.credentials!.accessToken, from, part.text);
          } else if (platform === 'facebook') {
            providerResponse = await this.messagingService.sendFacebookMessage(channel.credentials!.accessToken, from, part.text);
          }
        } catch (error) {
          if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'Flow WhatsApp send failed');
          throw error;
        }
      }

      const whatsappMessageId = platform === 'whatsapp'
        ? (providerResponse?.messages?.[0]?.id || providerResponse?.message_id)
        : undefined;
      const messageData = {
        from: 'me', text: part.text, type: part.type, attachments: part.attachments, isManual: false, timestamp: Date.now(),
        metadata: {
          source: 'flow', flowId: flow.id, nodeId: node.id,
          ...(whatsappMessageId ? { whatsappMessageId, status: 'accepted', walletTransactionId: walletCharge?.id || null, metaConnectionId: channel?.credentials?.metaConnectionId || conversation?.metaConnectionId || null } : {}),
        },
      };
      await this.conversationsService.addMessage(from, storeId, platform, messageData);
      this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', {
        ...messageData, platform, customerPhone: from, storeId,
      });
    }
  }

  /** The Cloud API messages a node becomes. Most nodes are one message; audio with text is two (audio has no caption). */
  private async whatsAppFlowParts(node: FlowNode, text: string, channel: any): Promise<FlowMessagePart[]> {
    const data = node.data || {};
    const inboxText = nodeAsText(node, text);
    const footer = data.footer?.trim() ? { footer: { text: data.footer.trim() } } : {};
    const interactive = (body: Record<string, any>, media?: FlowMedia | null): FlowMessagePart[] => [
      { payload: { type: 'interactive', interactive: body }, interactive: true, type: 'text', text: inboxText, attachments: this.flowAttachments(media) },
    ];
    const textPart = (body: string): FlowMessagePart => ({ payload: { type: 'text', text: { body, preview_url: /https?:\/\//i.test(body) } }, interactive: false, type: 'text', text: body, attachments: [] });

    // Flows saved by the first editor can exceed WhatsApp's limits (more than 3 buttons, empty text);
    // send the closest message Meta accepts instead of failing. Numbered text replies still match options.
    const options = data.buttons || [];
    const kind = node.type === 'buttons' && options.length > MAX_REPLY_BUTTONS ? 'list' : node.type;
    if ((kind === 'buttons' || kind === 'list') && (options.length === 0 || options.length > MAX_LIST_ROWS)) return [textPart(inboxText || text || '…')];
    if (kind === 'buttons' || kind === 'list' || kind === 'link') text = text.trim() || 'اختر من الخيارات:';

    switch (kind) {
      case 'buttons': {
        const media: FlowMedia | null = data.media || (data.imageUrl ? { type: 'image', link: data.imageUrl } : null);
        const header = media
          ? { header: { type: media.type, [media.type]: { ...(await this.flowMediaRef(media, channel)), ...(media.type === 'document' && media.filename ? { filename: media.filename } : {}) } } }
          : {};
        return interactive({
          type: 'button',
          ...header,
          body: { text },
          ...footer,
          action: { buttons: (data.buttons || []).map((option) => ({ type: 'reply', reply: { id: option.id, title: option.label.slice(0, 20) } })) },
        }, media);
      }
      case 'list': {
        const title = (data.buttonText || 'الخيارات').trim();
        return interactive({
          type: 'list',
          body: { text },
          ...footer,
          action: {
            button: title.slice(0, 20),
            sections: [{
              title: title.slice(0, 24),
              rows: (data.buttons || []).map((option) => ({
                id: option.id,
                title: option.label.slice(0, 24),
                ...(option.description?.trim() ? { description: option.description.trim().slice(0, 72) } : {}),
              })),
            }],
          },
        });
      }
      case 'link':
        return interactive({
          type: 'cta_url',
          body: { text },
          ...footer,
          action: { name: 'cta_url', parameters: { display_text: (data.buttonText || '').slice(0, 20), url: data.url } },
        });
      case 'message': {
        const media = data.media;
        if (!media) return text ? [textPart(text)] : [];
        const captioned = media.type !== 'audio' && Boolean(text);
        const object = {
          ...(await this.flowMediaRef(media, channel)),
          ...(captioned ? { caption: text } : {}),
          ...(media.type === 'document' && media.filename ? { filename: media.filename } : {}),
        };
        const mediaPart: FlowMessagePart = {
          payload: { type: media.type, [media.type]: object },
          interactive: false,
          type: media.type,
          text: captioned ? text : (media.link || media.filename || `[${media.type}]`),
          attachments: this.flowAttachments(media),
        };
        return media.type === 'audio' && text ? [mediaPart, textPart(text)] : [mediaPart];
      }
      default:
        return text ? [textPart(text)] : [];
    }
  }

  private async flowMediaRef(media: FlowMedia, channel: any): Promise<{ id: string } | { link: string }> {
    if (media.link) return { link: media.link };
    const path = this.flowsService.mediaPath(String(media.file || ''));
    if (!media.file || !existsSync(path)) throw new Error(`ملف التدفق غير موجود على الخادم (${media.filename || media.file}). أعد رفعه من محرر التدفق.`);
    const id = await this.messagingService.uploadWhatsAppMedia(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, media.file, {
      buffer: readFileSync(path),
      mimeType: media.mimeType || 'application/octet-stream',
      filename: media.filename || media.file,
    });
    return { id };
  }

  /** Lets the inbox show the file a flow sent, like a customer's attachment. */
  private flowAttachments(media?: FlowMedia | null): Record<string, any>[] {
    if (!media?.file) return [];
    return [{ id: media.file, type: media.type, mimeType: media.mimeType, filename: media.file, originalFilename: media.filename, url: `/flows/media/${media.file}` }];
  }

  private shouldAiRespond(store: any): boolean {
    const mode = store.aiMode || 'always';
    if (mode === 'always') return true;
    if (mode === 'manual') return false;
    if (mode === 'off_hours' && store.workingHours) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = store.workingHours.start.split(':').map(Number);
      const [eh, em] = store.workingHours.end.split(':').map(Number);
      const startTime = sh * 60 + sm;
      const endTime = eh * 60 + em;
      return !store.workingHours.enabledDays.includes(now.getDay()) || (currentTime < startTime || currentTime > endTime);
    }
    return true;
  }

  private async processAiResponse(from: string, text: string, storeId: string, platform: string, store: any, ownerId: string, conversation?: any) {
    const aiResponseText = await this.aiResponse(text, store);
    if (!aiResponseText) {
      // AI failed on our side: silently stop auto-reply for this conversation and leave it to a human agent.
      this.logger.warn(`AI reply failed for ${from} (store ${storeId}); auto-reply disabled for this conversation`);
      if (conversation?._id) await this.conversationsService.toggleAi(String(conversation._id), false, 'ai_error');
      return;
    }
    const availableChannels = await this.channelsService.findAllByStore(storeId, { maskCredentials: false });
    const channel = availableChannels.find(c => c.type === platform && (!conversation?.metaConnectionId || c.credentials?.metaConnectionId === conversation.metaConnectionId))
      || availableChannels.find(c => c.type === platform);
    let providerResponse: any = null;
    let walletCharge: any = null;
    if (channel && platform === 'whatsapp') {
      walletCharge = await this.billingService.chargeMetaUsageForStore(storeId, MetaUsageType.SESSION_TEXT, {
        source: 'ai_reply',
        customerPhone: from,
      });
      try {
        providerResponse = await this.messagingService.sendWhatsAppMessage(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, from, aiResponseText);
      } catch (error) {
        if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'AI WhatsApp send failed');
        throw error;
      }
    } else if (channel && platform === 'instagram') {
      providerResponse = await this.messagingService.sendInstagramMessage(channel.credentials!.accessToken, from, aiResponseText);
    } else if (channel && platform === 'facebook') {
      providerResponse = await this.messagingService.sendFacebookMessage(channel.credentials!.accessToken, from, aiResponseText);
    }

    const whatsappMessageId = platform === 'whatsapp'
      ? (providerResponse?.messages?.[0]?.id || providerResponse?.message_id)
      : undefined;
    const messageData = {
      from: 'me', text: aiResponseText, type: 'text', isManual: false, timestamp: Date.now(),
      metadata: whatsappMessageId ? { whatsappMessageId, status: 'accepted', walletTransactionId: walletCharge?.id || null, metaConnectionId: channel?.credentials?.metaConnectionId || conversation?.metaConnectionId || null } : {},
    };
    await this.conversationsService.addMessage(from, storeId, platform, messageData);
    this.eventsGateway.server.to(`store_${storeId}`).emit('new_message', { ...messageData, platform, customerPhone: from, storeId });
  }

  private async aiResponse(text: string, store: any) {
    return this.aiService.generateResponse(text, {
      name: store.name, description: store.description, knowledgeBase: store.knowledgeBase, preferredModel: store.preferredModel,
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
