import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';

export enum StoreMemberRole {
  VIEWER = 'viewer',
  AGENT = 'agent',
  SUPERVISOR = 'supervisor',
  MANAGER = 'manager',
}

@Entity('store_members')
@Index(['storeId', 'userId'], { unique: true })
@Index(['userId'])
export class StoreMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: StoreMemberRole, default: StoreMemberRole.AGENT })
  role: StoreMemberRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
