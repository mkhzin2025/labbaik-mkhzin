import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType, ChannelStatus } from './entities/channel.entity';
import { CreateChannelDto } from './dto/channel.dto';
import { Store } from '../stores/entities/store.entity';
import { CredentialEncryptionService } from './credential-encryption.service';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  async create(createChannelDto: CreateChannelDto, store: Store) {
    const existingChannel = await this.channelRepository.findOne({
      where: { store: { id: store.id }, type: createChannelDto.type },
    });
    if (existingChannel) {
      throw new ConflictException(`Channel of type ${createChannelDto.type} already exists for this store`);
    }
    const encryptedCredentials = this.credentialEncryption.encryptCredentials(createChannelDto.credentials);
    const channel = this.channelRepository.create({ ...createChannelDto, credentials: encryptedCredentials, store });
    return this.maskChannel(await this.channelRepository.save(channel));
  }

  async findAllByStore(storeId: string, options: { maskCredentials?: boolean } = { maskCredentials: true }) {
    const channels = await this.channelRepository.find({
      where: { store: { id: storeId } },
      order: { createdAt: 'DESC' },
    });
    if (options.maskCredentials === false) return channels;
    return channels.map(channel => this.maskChannel(channel));
  }

  async findOne(id: string, storeId: string) {
    const channel = await this.channelRepository.findOne({ where: { id, store: { id: storeId } } });
    if (!channel) throw new NotFoundException('Channel not found');
    return this.maskChannel(channel);
  }

  async remove(id: string, storeId: string) {
    const channel = await this.findEntity(id, storeId);
    return this.maskChannel(await this.channelRepository.remove(channel));
  }

  async updateStatus(id: string, storeId: string, status: ChannelStatus) {
    const channel = await this.findEntity(id, storeId);
    channel.status = status;
    return this.maskChannel(await this.channelRepository.save(channel));
  }

  private async findEntity(id: string, storeId: string) {
    const channel = await this.channelRepository.findOne({ where: { id, store: { id: storeId } } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async findByProviderId(providerId: string) {
    return this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.store', 'store')
      .leftJoinAndSelect('store.owner', 'owner')
      .where("channel.credentials->>'phoneNumberId' = :providerId", { providerId })
      .getOne();
  }

  async getStoreContext(storeId: string) {
    const store = await this.storeRepository.findOne({ 
      where: { id: storeId },
      relations: ['owner']
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  private maskChannel(channel: Channel) {
    return {
      ...channel,
      credentials: this.credentialEncryption.maskCredentials(channel.credentials),
    };
  }
}
