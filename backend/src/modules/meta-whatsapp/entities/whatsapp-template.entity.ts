import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MetaWhatsAppConnection } from './meta-whatsapp-connection.entity';

@Entity('whatsapp_templates')
@Index(['connectionId', 'name', 'language'], { unique: true })
export class WhatsAppTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  connectionId: string;

  @ManyToOne(() => MetaWhatsAppConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connectionId' })
  connection: MetaWhatsAppConnection;

  @Column({ type: 'varchar', nullable: true })
  metaTemplateId: string | null;

  @Column()
  name: string;

  @Column()
  language: string;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  status: string | null;

  @Column({ type: 'jsonb', default: [] })
  components: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  qualityScore: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
