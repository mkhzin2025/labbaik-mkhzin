import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CONVERSATION_STATUSES = ['open', 'pending', 'snoozed', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  text: string;

  @Prop({ default: 'text' })
  type: string;

  @Prop({ type: [Object], default: [] })
  attachments: Record<string, any>[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: Date.now })
  timestamp: number;

  // true = typed by a team member, false = automatic (AI/flow). Older messages predate the field and leave it unset.
  @Prop()
  isManual?: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ required: true })
  customerPhone: string;

  @Prop({ required: true })
  storeId: string;

  @Prop({ nullable: true, index: true })
  metaConnectionId: string;

  @Prop({ required: true, enum: ['whatsapp', 'instagram', 'facebook', 'google_maps'] })
  platform: string;

  @Prop({ nullable: true })
  customerId: string; // Link to Postgres Customer Entity UUID

  @Prop({ nullable: true })
  customerName: string; // WhatsApp profile name or the customer's saved name

  // Workflow state shown in the inbox: open → pending (waiting on someone) → snoozed (hidden until snoozedUntil) → closed.
  @Prop({ type: String, default: 'open', enum: CONVERSATION_STATUSES })
  status: ConversationStatus;

  @Prop({ type: Date, default: null })
  snoozedUntil: Date | null;

  @Prop({ type: Date })
  statusUpdatedAt: Date;

  @Prop({ type: [MessageSchema], default: [] })
  messages: Message[];

  @Prop({ default: 0 })
  unreadCount: number;

  @Prop({ default: true })
  aiEnabled: boolean;

  @Prop({ type: Date, nullable: true })
  aiDisabledUntil: Date;

  // Why automatic replies are paused: 'ai_error' pauses only the AI, while 'manual' / 'agent_reply' / 'handoff'
  // pause flows too. Pauses from before this field existed read as manual.
  @Prop({ type: String, default: null })
  aiPausedReason: string | null;

  @Prop({ default: 'neutral' })
  lastSentiment: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // Flow Builder Integration
  @Prop({ nullable: true })
  currentFlowId: string;

  @Prop({ nullable: true })
  currentFlowNodeId: string;

  // Replies in a row that matched none of the waiting question's options; the flow lets go after a few.
  @Prop({ default: 0 })
  flowInvalidReplies: number;

  @Prop()
  lastMessage: string;

  @Prop()
  lastMessageAt: Date;

  // Denormalized from the last message so the inbox can filter "needs reply" without loading messages.
  @Prop({ default: false })
  awaitingReply: boolean;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
// Inbox pages: newest first per store (and per status tab), with _id as the cursor tie-breaker.
ConversationSchema.index({ storeId: 1, lastMessageAt: -1, _id: -1 });
// addMessage / getAutoReplyPause look up a customer's thread on every incoming message.
ConversationSchema.index({ customerPhone: 1, storeId: 1, platform: 1, lastMessageAt: -1 });
// Webhook dedupe and delivery-status updates (sent/delivered/read) match by message id.
ConversationSchema.index({ 'messages.metadata.whatsappMessageId': 1 }, { sparse: true });
ConversationSchema.index({ storeId: 1, status: 1, lastMessageAt: -1, _id: -1 });
