import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async create(createStoreDto: CreateStoreDto, owner: User) {
    // Check if store already exists for this owner to perform Upsert
    const existingStore = await this.storeRepository.findOne({
      where: { owner: { id: owner.id } },
    });

    if (existingStore) {
      // Update existing store
      Object.assign(existingStore, createStoreDto);
      return this.storeRepository.save(existingStore);
    }

    // Create new store
    const store = this.storeRepository.create({
      ...createStoreDto,
      owner,
    });
    return this.storeRepository.save(store);
  }

  async findByOwner(userId: string) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['owner'], // Ensure owner info is loaded
    });
    if (!store) {
      throw new NotFoundException('Store profile not found');
    }
    return store;
  }

  async update(userId: string, updateStoreDto: UpdateStoreDto) {
    const store = await this.findByOwner(userId);
    Object.assign(store, updateStoreDto);
    return this.storeRepository.save(store);
  }
}
