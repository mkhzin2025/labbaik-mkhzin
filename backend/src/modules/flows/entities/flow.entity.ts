import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';

@Entity('flows')
export class Flow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: false })
  isDefault: boolean; // If true, this flow starts when a customer first messages

  @Column({ type: 'jsonb', default: [] })
  nodes: any[]; // The visual nodes structure

  @Column({ type: 'jsonb', default: [] })
  edges: any[]; // The connections between nodes

  @Column({ default: true })
  isActive: boolean;

  /** A core flow the business relies on: it can be edited and switched off, but not deleted. Set in the database. */
  @Column({ default: false })
  isProtected: boolean;

  @ManyToOne(() => Store)
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
