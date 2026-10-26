import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum WhatsAppCampaignStatus {
  SCHEDULED = 'scheduled',
  QUEUED = 'queued',
  SENDING = 'sending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

type TaxonomyLabel = { id: string; name: string; color: string };

/** The audience exactly as chosen, with names snapshotted so the record survives later renames/deletes. */
export type WhatsAppCampaignAudience = {
  mode: 'all' | 'segment' | 'manual';
  storeIds: string[];
  categoryIds?: string[];
  tagIds?: string[];
  tagMatch?: 'any' | 'all';
  excludeCategoryIds?: string[];
  excludeTagIds?: string[];
  manualCount?: number;
  excludedCount?: number;
  /** Pasted test numbers: sent without creating customers or inbox conversations. */
  test?: boolean;
  labels: {
    branches: { id: string; name: string }[];
    categories: TaxonomyLabel[];
    tags: TaxonomyLabel[];
    excludeCategories: TaxonomyLabel[];
    excludeTags: TaxonomyLabel[];
  };
};

export type WhatsAppCampaignParameters = {
  body: string[];
  header: string[];
  buttons: any[];
  otpCode?: string | null;
  nameFallback?: string | null;
  headerMedia?: { id?: string; link?: string; file?: string; mimeType?: string; filename?: string; type?: string } | null;
};

/** One bulk template send: who it targeted, what was sent, and the totals at creation. */
@Entity('whatsapp_campaigns')
@Index(['organizationId', 'createdAt'])
@Index(['templateId'])
export class WhatsAppCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  connectionId: string;

  /** Kept without a foreign key: syncing templates from Meta can delete the local row. */
  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column()
  templateName: string;

  @Column()
  templateLanguage: string;

  @Column({ type: 'varchar', nullable: true })
  templateCategory: string | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: WhatsAppCampaignStatus.QUEUED })
  status: WhatsAppCampaignStatus;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByName: string | null;

  @Column({ type: 'jsonb', default: [] })
  storeIds: string[];

  @Column({ type: 'jsonb' })
  audience: WhatsAppCampaignAudience;

  @Column({ type: 'jsonb' })
  parameters: WhatsAppCampaignParameters;

  /** Rendered message text with the campaign-wide values filled in (per-customer values left as tokens). */
  @Column({ type: 'text', nullable: true })
  previewText: string | null;

  /** Customer records matched before opt-outs and duplicate numbers were removed. */
  @Column({ type: 'int', default: 0 })
  sourceRecords: number;

  @Column({ type: 'int', default: 0 })
  duplicatesRemoved: number;

  @Column({ type: 'int', default: 0 })
  optedOutSkipped: number;

  @Column({ type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /** When a scheduled campaign is due to start; null for campaigns sent right away. */
  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  /** Send rate cap chosen for the campaign. */
  @Column({ type: 'int', default: 20 })
  messagesPerSecond: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
