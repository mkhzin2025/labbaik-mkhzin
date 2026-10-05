import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class StoresService implements OnModuleInit {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  // Same convention as meta_whatsapp_connections.webhookMode: add new columns idempotently on boot
  // (see STORE-QUICK-REPLIES-MIGRATION.sql for running it by hand).
  async onModuleInit() {
    try {
      await this.storeRepository.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS "quickReplies" jsonb NOT NULL DEFAULT '[]'::jsonb;`);
    } catch (e: any) {
      this.logger.warn(`Auto-migration for quickReplies skipped or failed: ${e.message}`);
    }
  }

  async create(createStoreDto: CreateStoreDto, owner: User, organizationId?: string) {
    const existingStore = await this.storeRepository.findOne({
      where: { owner: { id: owner.id } },
    });

    if (existingStore) {
      Object.assign(existingStore, createStoreDto);
      if (organizationId && !existingStore.organizationId) existingStore.organizationId = organizationId;
      return this.storeRepository.save(existingStore);
    }

    const store = this.storeRepository.create({
      ...createStoreDto,
      owner,
      organizationId: organizationId || null,
    });
    return this.storeRepository.save(store);
  }

  async createBranch(createStoreDto: CreateStoreDto, owner: User, organizationId: string) {
    const store = this.storeRepository.create({
      ...createStoreDto,
      owner,
      organizationId,
    });
    return this.storeRepository.save(store);
  }

  async findByOwner(userId: string) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['owner'],
    });
    if (!store) throw new NotFoundException('Store profile not found');
    return store;
  }

  async findByIdInOrganization(storeId: string, organizationId: string) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId, organizationId },
      relations: ['owner'],
    });
    if (!store) throw new NotFoundException('Store/branch not found');
    return store;
  }

  async findAllByOrganization(organizationId: string) {
    return this.storeRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
  }

  async update(userId: string, updateStoreDto: UpdateStoreDto) {
    const store = await this.findByOwner(userId);
    Object.assign(store, updateStoreDto);
    return this.storeRepository.save(store);
  }

  async updateById(storeId: string, organizationId: string, updateStoreDto: UpdateStoreDto) {
    const store = await this.findByIdInOrganization(storeId, organizationId);
    Object.assign(store, updateStoreDto);
    return this.storeRepository.save(store);
  }
}
