import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const TRIAL_REQUEST_STATUSES = ['new', 'contacted', 'subscribed', 'closed'] as const;
export type TrialRequestStatus = (typeof TRIAL_REQUEST_STATUSES)[number];

/** A trial / subscription request sent from the public website form. */
@Entity('trial_requests')
export class TrialRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 160 })
  company: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  message: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: TrialRequestStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
