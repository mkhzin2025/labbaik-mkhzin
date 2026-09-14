import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { EventsGateway } from '../events/events.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import { ChannelsService } from '../channels/channels.service';
import { AiService } from '../ai/ai.service';
import { CustomersService } from '../customers/customers.service';
import { FlowsService } from '../flows/flows.service';
import { MessagingService } from '../channels/messaging.service';
import { WhatsAppMediaService } from '../channels/whatsapp-media.service';

type NormalizedWhatsAppMessage = {
  from: string;
  text: string;
  type: string;
  timestamp: number;
  attachments: Record<string, any>[];
  metadata: Record<string, any>;
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

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

        const sentiment = await this.aiService.analyzeSentiment(text);
        const tags = await this.aiService.categorizeMessage(text);

        const savedConv = await this.conversationsService.addMessage(from, storeId, platform, {
          from, text, type: 'text', timestamp: Date.now(), sentiment, tags, customerId: customer.id,
        });

        if (ownerId) {
          this.eventsGateway.server.to(`store_${ownerId}`).emit('new_message', {
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
          await this.processWhatsAppCustomerMessage(message, channel, metadata);
        }
      }
    }

    return { status: 'success' };
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

  private async processWhatsAppCustomerMessage(message: any, channel: any, webhookMetadata: any) {
    const storeId = channel.store.id;
    const currentStore = await this.channelsService.getStoreContext(storeId);
    const ownerId = currentStore.owner?.id || (typeof currentStore.owner === 'string' ? currentStore.owner : 'global');
    const normalized = await this.normalizeWhatsAppMessage(message, channel.credentials.accessToken, webhookMetadata);

    this.logger.log(`Incoming WhatsApp ${normalized.type} from ${normalized.from}: [${normalized.text}]`);

    const customer = await this.customersService.findOrCreate(currentStore, normalized.from, {
      fullName: `WhatsApp ${normalized.from}`,
      phoneNumber: normalized.from,
      whatsappId: normalized.from,
    }, 'whatsapp');

    const analysisText = normalized.text || `[${normalized.type}]`;
    const sentiment = await this.aiService.analyzeSentiment(analysisText);
    const tags = await this.aiService.categorizeMessage(analysisText);

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
    });

    if (ownerId) {
      this.eventsGateway.server.to(`store_${ownerId}`).emit('new_message', {
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
      });
    }

    try {
      await this.processFlowOrAi(normalized.from, analysisText, storeId, 'whatsapp', currentStore, ownerId, savedConv);
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

  private async processFlowOrAi(from: string, text: string, storeId: string, platform: string, store: any, ownerId: any, conversation: any) {
    const aiManuallyEnabled = await this.conversationsService.isAiEnabled(from, storeId, platform);
    if (!aiManuallyEnabled) return false;

    this.logger.log(`Checking Flow for ${from}. Current Flow: ${conversation.currentFlowId || 'NONE'}`);

    if (conversation.currentFlowId) {
      try {
        const flow = await this.flowsService.findOne(conversation.currentFlowId, storeId);
        if (flow && flow.isActive) {
          const nextNode = this.flowsService.getNextNode(flow, conversation.currentFlowNodeId, text);
          if (nextNode) {
            await this.executeNode(nextNode, from, storeId, platform, ownerId, conversation, flow);
            return true;
          }
        }
      } catch (e) {
        await this.conversationsService.updateFlowState(conversation._id, null, null);
        conversation.currentFlowId = null;
      }
    }

    const defaultFlow = await this.flowsService.findDefault(storeId);
    if (defaultFlow) {
      const startNode = defaultFlow.nodes.find(n => n.type === 'start' || n.data?.isStart) || defaultFlow.nodes[0];
      if (startNode) {
        if (startNode.type === 'start') {
          const firstActualNode = this.flowsService.getNextNode(defaultFlow, startNode.id, '');
          if (firstActualNode) {
            await this.executeNode(firstActualNode, from, storeId, platform, ownerId, conversation, defaultFlow);
            return true;
          }
        }
        await this.executeNode(startNode, from, storeId, platform, ownerId, conversation, defaultFlow);
        return true;
      }
    }

    const aiScheduledAllowed = this.shouldAiRespond(store);
    if (aiScheduledAllowed) {
      await this.processAiResponse(from, text, storeId, platform, store, String(ownerId));
      return true;
    }

    return false;
  }

  private async executeNode(node: any, from: string, storeId: string, platform: string, ownerId: any, conversation: any, flow: any) {
    const responseText = node.data.text || 'مرحباً!';
    const buttons = node.data.buttons || [];

    const channel = (await this.channelsService.findAllByStore(storeId, { maskCredentials: false })).find(c => c.type === platform);
    if (channel) {
      if (platform === 'whatsapp' && buttons.length > 0) {
        const imageUrl = node.data?.imageUrl;
        await this.messagingService.sendWhatsAppButtons(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, from, responseText, buttons, imageUrl);
      } else {
        await this.messagingService.sendWhatsAppMessage(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, from, responseText);
      }
    }

    await this.conversationsService.updateFlowState(conversation._id, flow.id, node.id);

    if (node.type === 'end' || node.data?.isEnd) {
      await this.conversationsService.updateFlowState(conversation._id, null, null);
    }

    await this.conversationsService.addMessage(from, storeId, platform, {
      from: 'me', text: responseText, type: 'text', isManual: false, timestamp: Date.now(),
    });

    this.eventsGateway.server.to(`store_${ownerId}`).emit('new_message', {
      platform, from: 'me', customerPhone: from, text: responseText, type: 'text', timestamp: Date.now(), storeId,
    });
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

  private async processAiResponse(from: string, text: string, storeId: string, platform: string, store: any, ownerId: string) {
    const aiResponseText = await this.aiResponse(text, store);
    const channel = (await this.channelsService.findAllByStore(storeId, { maskCredentials: false })).find(c => c.type === platform);
    if (channel && platform === 'whatsapp') {
      await this.messagingService.sendWhatsAppMessage(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, from, aiResponseText);
    }

    await this.conversationsService.addMessage(from, storeId, platform, { from: 'me', text: aiResponseText, type: 'text', isManual: false, timestamp: Date.now() });
    this.eventsGateway.server.to(`store_${ownerId}`).emit('new_message', { platform, from: 'me', customerPhone: from, text: aiResponseText, type: 'text', timestamp: Date.now(), storeId });
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
