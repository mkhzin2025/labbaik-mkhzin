import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Store } from '../../stores/entities/store.entity';

export enum MetaConnectionMode {
  SHARED_APP = 'shared_app',
  OWN_APP = 'own_app',
}

export enum MetaConnectionStatus {
  DRAFT = 'draft',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export enum MetaConnectionScope {
  ORGANIZATION = 'organization',
  STORE = 'store',
}

export enum MetaInboundRouting {
  LAST_CUSTOMER_STORE = 'last_customer_store',
  DEFAULT_STORE = 'default_store',
}

@Entity('meta_whatsapp_connections')
@Index(['organizationId', 'scope', 'storeId'])
export class MetaWhatsAppConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'enum', enum: MetaConnectionScope, default: MetaConnectionScope.STORE })
  scope: MetaConnectionScope;

  @Column('uuid', { nullable: true })
  storeId: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store | null;

  @Column('uuid', { nullable: true })
  defaultStoreId: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultStoreId' })
  defaultStore: Store | null;

  @Column({ type: 'enum', enum: MetaInboundRouting, default: MetaInboundRouting.LAST_CUSTOMER_STORE })
  inboundRouting: MetaInboundRouting;

  @Column({ type: 'enum', enum: MetaConnectionMode, default: MetaConnectionMode.SHARED_APP })
  mode: MetaConnectionMode;

  @Column({ type: 'varchar', nullable: true })
  appId: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  appSecret: string | null;

  @Column()
  wabaId: string;

  @Index({ unique: true })
  @Column()
  phoneNumberId: string;

  @Column({ type: 'varchar', nullable: true })
  displayPhoneNumber: string | null;

  @Column({ type: 'text', select: false })
  accessToken: string;

  @Column({ type: 'text', select: false })
  verifyToken: string;

  @Column({ type: 'varchar', nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'enum', enum: MetaConnectionStatus, default: MetaConnectionStatus.DRAFT })
  status: MetaConnectionStatus;

  @Column({ type: 'varchar', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  webhookSubscribedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastWebhookAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  templatesSyncedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
