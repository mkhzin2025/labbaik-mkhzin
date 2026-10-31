import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { CustomerCategory } from './customer-category.entity';
import { CustomerTag } from './customer-tag.entity';

@Entity('customers')
@Index(['phoneNumber', 'storeId'], { unique: true })
@Index(['storeId', 'updatedAt'])
// findByIdentifier matches phoneNumber OR whatsappId; without this the whatsappId side scans the whole store.
// Named so the copy created by hand on production (CREATE INDEX CONCURRENTLY) is kept by synchronize.
@Index('IDX_customers_whatsapp_store', ['whatsappId', 'storeId'])
// Expression index on the digits-only phone that inbound routing and phone lookups match on
// (REGEXP_REPLACE(COALESCE("phoneNumber", "whatsappId", ''), '[^0-9]', '', 'g')). TypeORM cannot declare
// expression indexes, so it is created by hand (CREATE INDEX CONCURRENTLY) and synchronize leaves it alone.
@Index('IDX_customers_phone_digits', { synchronize: false })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  whatsappId: string;

  @Column({ nullable: true })
  instagramId: string;

  @Column({ nullable: true })
  facebookId: string;

  /** Existing JSON tags are retained for backwards compatibility and lazy-migrated into customer_tags. */
  @Column({ name: 'tags', type: 'jsonb', default: [] })
  legacyTags: string[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  /** The customer asked not to receive marketing campaigns; bulk template sends skip their number. */
  @Column({ default: false })
  marketingOptOut: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  marketingOptOutAt: Date | null;

  /** Blocked by the team (abusive customer): their messages are dropped and campaigns skip them. Set on every record of the number. */
  @Column({ type: 'timestamptz', nullable: true })
  blockedAt: Date | null;

  @Column('uuid')
  @Index()
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToMany(() => CustomerCategory, (category) => category.customers)
  @JoinTable({
    name: 'customer_category_links',
    joinColumn: { name: 'customerId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: CustomerCategory[];

  @ManyToMany(() => CustomerTag, (tag) => tag.customers)
  @JoinTable({
    name: 'customer_tag_links',
    joinColumn: { name: 'customerId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: CustomerTag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
