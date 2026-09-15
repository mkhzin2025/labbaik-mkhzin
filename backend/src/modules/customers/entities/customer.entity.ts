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
