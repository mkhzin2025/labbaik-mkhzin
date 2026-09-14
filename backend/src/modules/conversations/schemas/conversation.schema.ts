import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
}

export const MessageSchema = SchemaFactory.createForClass(Message);

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ required: true })
  customerPhone: string;

  @Prop({ required: true })
  storeId: string;

  @Prop({ required: true, enum: ['whatsapp', 'instagram', 'facebook', 'google_maps'] })
  platform: string;

  @Prop({ nullable: true })
  customerId: string; // Link to Postgres Customer Entity UUID

  @Prop({ default: 'open' })
  status: string;

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
