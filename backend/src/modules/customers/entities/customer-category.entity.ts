import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Store } from '../../stores/entities/store.entity';
import { Customer } from './customer.entity';

export enum CustomerTaxonomyScope {
  ORGANIZATION = 'organization',
  STORE = 'store',
}

@Entity('customer_categories')
@Index(['organizationId', 'scope', 'storeId', 'name'])
export class CustomerCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'enum', enum: CustomerTaxonomyScope, default: CustomerTaxonomyScope.STORE })
  scope: CustomerTaxonomyScope;

  @Column('uuid', { nullable: true })
  @Index()
  storeId: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store | null;

  @Column()
  name: string;

  @Column({ default: '#7c3aed' })
  color: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @ManyToMany(() => Customer, (customer) => customer.categories)
  customers: Customer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
