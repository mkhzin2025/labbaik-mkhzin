import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';
import { Wallet } from './wallet.entity';
import { Organization } from '../../organizations/entities/organization.entity';

const bigintTransformer: ValueTransformer = {
  to: (value: number) => Math.trunc(value || 0),
  from: (value: string | number) => Number(value || 0),
};

export enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

export enum WalletTransactionCategory {
  TOPUP = 'topup',
  AUTO_TOPUP = 'auto_topup',
  META_USAGE = 'meta_usage',
  REFUND = 'refund',
  ADMIN = 'admin',
}

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  walletId: string;

  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'enum', enum: WalletTransactionType })
  type: WalletTransactionType;

  @Column({ type: 'enum', enum: WalletTransactionCategory })
  category: WalletTransactionCategory;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountMicros: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceBeforeMicros: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceAfterMicros: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
