import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';

export enum ChannelType {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  GOOGLE_MAPS = 'google_maps',
}

export enum ChannelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ChannelType,
  })
  type: ChannelType;

  @Column({
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.PENDING,
  })
  status: ChannelStatus;

  @Column({ type: 'jsonb', nullable: true })
  credentials: Record<string, any>;

  @ManyToOne(() => Store)
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
