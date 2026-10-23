import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WhatsAppCampaign } from './whatsapp-campaign.entity';

export enum CampaignRecipientStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** One number of a campaign and how far its message got (Meta status webhooks + customer replies). */
@Entity('whatsapp_campaign_recipients')
@Index(['campaignId', 'status'])
@Index(['whatsappMessageId'])
@Index(['organizationId', 'phone', 'sentAt'])
export class WhatsAppCampaignRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  campaignId: string;

  @ManyToOne(() => WhatsAppCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: WhatsAppCampaign;

  @Column('uuid')
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  @Column('uuid')
  storeId: string;

  @Column({ type: 'varchar', nullable: true })
  storeName: string | null;

  @Column()
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', default: CampaignRecipientStatus.PENDING })
  status: CampaignRecipientStatus;

  @Column({ type: 'varchar', nullable: true })
  whatsappMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  /** 'button' for a template quick-reply tap, otherwise the inbound message type. */
  @Column({ type: 'varchar', nullable: true })
  replyType: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  replyText: string | null;
}
