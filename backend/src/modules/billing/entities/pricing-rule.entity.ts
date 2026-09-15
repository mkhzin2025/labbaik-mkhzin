import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

const bigintTransformer: ValueTransformer = {
  to: (value: number) => Math.trunc(value || 0),
  from: (value: string | number) => Number(value || 0),
};

export enum MetaUsageType {
  SESSION_TEXT = 'meta_session_text',
  INTERACTIVE = 'meta_interactive',
  TEMPLATE_MARKETING = 'meta_template_marketing',
  TEMPLATE_UTILITY = 'meta_template_utility',
  TEMPLATE_AUTHENTICATION = 'meta_template_authentication',
  TEMPLATE_OTHER = 'meta_template_other',
}

@Entity('pricing_rules')
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'enum', enum: MetaUsageType })
  usageType: MetaUsageType;

  @Column()
  nameAr: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  priceMicros: number;

  @Column({ default: 'SAR' })
  currency: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
