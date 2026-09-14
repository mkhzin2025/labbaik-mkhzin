import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reviewerName: string;

  @Column({ nullable: true })
  reviewerPhotoUrl: string;

  @Column('int')
  rating: number; // 1 to 5 stars

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'text', nullable: true })
  reply: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'replied' | 'ignored';

  @Column({ nullable: true })
  platformReviewId: string; // ID from Google Maps

  @ManyToOne(() => Store)
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
