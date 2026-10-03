import { Injectable, Logger, NotFoundException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { MessagingService } from '../channels/messaging.service';
import { ChannelsService } from '../channels/channels.service';
import { CustomersService } from '../customers/customers.service';
import { EventsGateway } from '../events/events.gateway';
import { BillingService } from '../billing/billing.service';
import { MetaUsageType } from '../billing/entities/pricing-rule.entity';
import { normalizePhoneNumber } from '../../common/utils/phone.util';

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
      }
    };

    if (messageData.sentiment) updateQuery.$set.lastSentiment = messageData.sentiment;
    if (messageData.customerId) updateQuery.$set.customerId = messageData.customerId;
    if (customerName) updateQuery.$set.customerName = customerName;
    if (messageData.metadata?.metaConnectionId) updateQuery.$set.metaConnectionId = messageData.metadata.metaConnectionId;
    if (messageData.tags && messageData.tags.length > 0) updateQuery.$addToSet = { tags: { $each: messageData.tags } };

    if (messageData.from !== 'me') updateQuery.$inc = { unreadCount: 1 };

    return this.conversationModel.findOneAndUpdate(
      { customerPhone, storeId, platform, status: 'open' },
      updateQuery,
      { upsert: true, returnDocument: 'after' }
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

  async findAllByStore(storeId: string) {
    return this.withCustomerNames(await this.conversationModel.find({ storeId }).sort({ lastMessageAt: -1 }).lean().exec());
  }

  async findAllByStores(storeIds: string[]) {
    if (!storeIds.length) return [];
    return this.withCustomerNames(await this.conversationModel.find({ storeId: { $in: storeIds } }).sort({ lastMessageAt: -1 }).lean().exec());
  }

  // A name saved on the customer record (possibly edited by the team) wins over the WhatsApp profile name.
  private async withCustomerNames<T extends { customerId?: string; customerName?: string }>(conversations: T[]) {
    try {
      const names = await this.customersService.findNamesByIds(conversations.map((conv) => conv.customerId || ''));
      return conversations.map((conv) => ({ ...conv, customerName: (conv.customerId && names.get(conv.customerId)) || conv.customerName || null }));
    } catch (error) {
      this.logger.warn(`Could not load customer names: ${error?.message}`);
      return conversations;
    }
  }

  async findOne(id: string) {
    const conversation = await this.conversationModel.findById(id).exec();
    
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
        conversation.customerId = customer.id;
        await conversation.save();
      } catch (e) {}
    }
    
    return conversation;
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
    const conversation = await this.conversationModel.findOne({ customerPhone, storeId, platform, status: 'open' });
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
