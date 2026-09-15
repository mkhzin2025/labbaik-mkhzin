import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PlanLimits = {
  stores?: number | null;
  agents?: number | null;
  channels?: number | null;
  monthlyMessages?: number | null;
  monthlyAiReplies?: number | null;
};

export type PlanFeatures = {
  metaLabbaik?: boolean;
  ownMeta?: boolean;
  ai?: boolean;
  flows?: boolean;
  analytics?: boolean;
};

@Entity('billing_plans')
export class BillingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column()
  nameAr: string;

  @Column({ type: 'varchar', nullable: true })
  nameEn: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  monthlyPriceMinor: number;

  @Column({ default: 'SAR' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  trialDays: number;

  @Column({ type: 'jsonb', default: {} })
  limits: PlanLimits;

  @Column({ type: 'jsonb', default: {} })
  features: PlanFeatures;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
