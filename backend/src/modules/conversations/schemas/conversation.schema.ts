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
  @Prop({ default: 'open', enum: CONVERSATION_STATUSES })
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

  @Prop({ default: 'neutral' })
  lastSentiment: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // Flow Builder Integration
  @Prop({ nullable: true })
  currentFlowId: string;

  @Prop({ nullable: true })
  currentFlowNodeId: string;

  @Prop()
  lastMessage: string;

  @Prop()
  lastMessageAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
