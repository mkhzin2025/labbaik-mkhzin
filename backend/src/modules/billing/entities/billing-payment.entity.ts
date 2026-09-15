import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { PaymentMethod } from './payment-method.entity';
import { BillingPlan } from './billing-plan.entity';

export enum BillingPaymentType {
  WALLET_TOPUP = 'wallet_topup',
  AUTO_TOPUP = 'auto_topup',
  SUBSCRIPTION = 'subscription',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
}

export enum BillingPaymentStatus {
  CREATED = 'created',
  INITIATED = 'initiated',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('billing_payments')
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'enum', enum: BillingPaymentType })
  type: BillingPaymentType;

  @Column({ type: 'enum', enum: BillingPaymentStatus, default: BillingPaymentStatus.CREATED })
  status: BillingPaymentStatus;

  @Column({ type: 'int' })
  amountMinor: number;

  @Column({ default: 'SAR' })
  currency: string;

  @Index({ unique: true })
  @Column()
  providerPaymentId: string;

  @Column({ type: 'varchar', nullable: true })
  providerStatus: string | null;

  @Column('uuid', { nullable: true })
  paymentMethodId: string | null;

  @ManyToOne(() => PaymentMethod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod | null;

  @Column('uuid', { nullable: true })
  planId: string | null;

  @ManyToOne(() => BillingPlan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: BillingPlan | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
