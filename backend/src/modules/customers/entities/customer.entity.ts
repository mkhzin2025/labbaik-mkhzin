import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';

@Entity('customers')
@Index(['phoneNumber', 'store'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string; // Made optional for Social Media Only customers

  @Column({ nullable: true })
  whatsappId: string;

  @Column({ nullable: true })
  instagramId: string;

  @Column({ nullable: true })
  facebookId: string;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => Store)
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
