import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type CompetitionSyncStatus = 'idle' | 'running' | 'completed' | 'failed';

export type CompetitionSyncStats = {
  fromPage: number;
  toPage: number;
  pagesDone: number;
  participants: number;
  /** New customers created in their competition branch. */
  created: number;
  /** Existing customers whose empty/placeholder name was filled from the competition. */
  renamed: number;
  /** Newly linked to "المسابقة" (registered directly in the branch). */
  linkedDirect: number;
  /** Newly linked to "المسابقة - online" (referral or social/influencer source). */
  linkedOnline: number;
  /** Customers moved from one competition category to the other. */
  switched: number;
  /** Customers newly given (or moved to) their age-group tag. Optional for states saved before it existed. */
  linkedAge?: number;
  cancelled: number;
  invalidPhone: number;
  unknownBranches: Record<string, number>;
};

/** Progress of the competition participants sync, one row per organization. */
@Entity('competition_sync_states')
export class CompetitionSyncState {
  @PrimaryColumn('uuid')
  organizationId: string;

  @Column({ type: 'varchar', default: 'idle' })
  status: CompetitionSyncStatus;

  /** Last fully processed page; the next incremental run resumes one page before it. */
  @Column({ default: 0 })
  lastPage: number;

  @Column({ default: 0 })
  totalPages: number;

  @Column({ default: 0 })
  totalParticipants: number;

  @Column({ type: 'jsonb', nullable: true })
  stats: CompetitionSyncStats | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastCompletedAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
