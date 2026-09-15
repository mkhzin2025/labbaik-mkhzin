import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum PaymentMethodStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
}

@Entity('payment_methods')
@Index(['organizationId', 'providerTokenHash'], { unique: true })
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ default: 'moyasar' })
  provider: string;

  @Column({ type: 'text', select: false })
  providerTokenEncrypted: string;

  @Column()
  providerTokenHash: string;

  @Column({ type: 'varchar', nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', nullable: true })
  funding: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastFour: string | null;

  @Column({ type: 'varchar', nullable: true })
  expiryMonth: string | null;

  @Column({ type: 'varchar', nullable: true })
  expiryYear: string | null;

  @Column({ type: 'varchar', nullable: true })
  holderName: string | null;

  @Column({ type: 'enum', enum: PaymentMethodStatus, default: PaymentMethodStatus.PENDING })
  status: PaymentMethodStatus;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
