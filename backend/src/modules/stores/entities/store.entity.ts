import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  knowledgeBase: string;

  @Column({ default: 'always' })
  aiMode: 'always' | 'off_hours' | 'manual';

  @Column({ default: 'groq' })
  preferredModel: 'groq' | 'gemini' | 'openai' | 'deepseek' | 'deepseek_groq';

  @Column({ type: 'jsonb', default: [] })
  customTags: string[];

  @Column({ type: 'jsonb', nullable: true })
  workingHours: {
    start: string; // HH:mm
    end: string;   // HH:mm
    timezone: string;
    enabledDays: number[]; // 0-6
  };

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ default: 'SAR' })
  currency: string;

  @Column('uuid', { nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;

  @OneToOne(() => User)
  @JoinColumn()
  owner: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
