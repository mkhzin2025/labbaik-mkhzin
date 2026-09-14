import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { MessagingService } from '../channels/messaging.service';
import { ChannelsService } from '../channels/channels.service';
import { CustomersService } from '../customers/customers.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    private readonly messagingService: MessagingService,
    private readonly channelsService: ChannelsService,
    private readonly customersService: CustomersService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async addMessage(customerPhone: string, storeId: string, platform: string, messageData: any) {
    const updateQuery: any = {
      $push: { messages: messageData },
      $set: { 
        lastMessage: messageData.text,
        lastMessageAt: new Date(),
      }
    };

    if (messageData.sentiment) updateQuery.$set.lastSentiment = messageData.sentiment;
    if (messageData.customerId) updateQuery.$set.customerId = messageData.customerId;
    if (messageData.tags && messageData.tags.length > 0) updateQuery.$addToSet = { tags: { $each: messageData.tags } };

    if (messageData.from !== 'me') updateQuery.$inc = { unreadCount: 1 };

    return this.conversationModel.findOneAndUpdate(
      { customerPhone, storeId, platform, status: 'open' },
      updateQuery,
      { upsert: true, returnDocument: 'after' }
    );
  }

  async markAsRead(id: string) {
    return this.conversationModel.findByIdAndUpdate(id, { unreadCount: 0 }, { returnDocument: 'after' });
  }

  async findAllByStore(storeId: string) {
    return this.conversationModel.find({ storeId }).sort({ lastMessageAt: -1 }).exec();
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
    const channel = channels.find(c => c.type === conversation.platform);
    if (!channel) throw new NotFoundException(`No linked ${conversation.platform} channel found.`);

    if (conversation.platform === 'whatsapp') {
      try {
        await this.messagingService.sendWhatsAppMessage(channel.credentials!.phoneNumberId, channel.credentials!.accessToken, conversation.customerPhone, text);
      } catch (error) {
        const errorText = this.getSendErrorText(error);
        await this.addSystemError(conversation.customerPhone, storeId, conversation.platform, errorText, error);
        throw new InternalServerErrorException(errorText);
      }
    } else if (conversation.platform === 'instagram') {
      await this.messagingService.sendInstagramMessage(channel.credentials!.accessToken, conversation.customerPhone, text);
    } else if (conversation.platform === 'facebook') {
      await this.messagingService.sendFacebookMessage(channel.credentials!.accessToken, conversation.customerPhone, text);
    }

    const messageData = { from: 'me', text, type: 'text', isManual: true, timestamp: Date.now() };
    await this.addMessage(conversation.customerPhone, storeId, conversation.platform, messageData);
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
    await this.conversationModel.findByIdAndUpdate(conversationId, { aiEnabled: false, aiDisabledUntil: thirtyMinutesFromNow });
    this.eventsGateway.server.emit('new_message', { ...messageData, customerPhone: conversation.customerPhone, platform: conversation.platform, storeId });
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
    this.eventsGateway.server.emit('new_message', {
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
