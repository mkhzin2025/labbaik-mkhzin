import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

const bigintTransformer: ValueTransformer = {
  to: (value: number) => Math.trunc(value || 0),
  from: (value: string | number) => Number(value || 0),
};

@Entity('wallets')
@Index(['organizationId'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  balanceMicros: number;

  @Column({ default: 'SAR' })
  currency: string;

  @Column({ default: false })
  autoRechargeEnabled: boolean;

  @Column({ type: 'bigint', default: 10_000_000, transformer: bigintTransformer })
  autoRechargeThresholdMicros: number;

  @Column({ type: 'bigint', default: 100_000_000, transformer: bigintTransformer })
  autoRechargeAmountMicros: number;

  @Column({ type: 'bigint', default: 5_000_000, transformer: bigintTransformer })
  lowBalanceThresholdMicros: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
