import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { RatingFrequency, RatingScope } from '../rating-policy';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  /** How often a customer is asked to rate the team when a conversation is closed. */
  @Column({ type: 'varchar', default: 'daily' })
  ratingFrequency: RatingFrequency;

  /** Whether every closed conversation asks for a rating, or only those a flow handed to the team. */
  @Column({ type: 'varchar', default: 'all' })
  ratingScope: RatingScope;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
