import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Store } from '../stores/entities/store.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async findOrCreate(store: Store, identifier: string, data: Partial<CreateCustomerDto>, platform: string) {
    let customer = await this.findByIdentifier(store.id, identifier, platform);

    if (!customer) {
      customer = this.customerRepository.create({
        ...data,
        store
      });
      return this.customerRepository.save(customer);
    }

    return customer;
  }

  async findAllByStore(storeId: string) {
    return this.customerRepository.find({
      where: { store: { id: storeId } },
      order: { updatedAt: 'DESC' }
    });
  }

  async findOne(id: string, storeId: string) {
    const customer = await this.customerRepository.findOne({
      where: { id, store: { id: storeId } }
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, storeId: string, updateData: UpdateCustomerDto) {
    const customer = await this.findOne(id, storeId);
    Object.assign(customer, updateData);
    return this.customerRepository.save(customer);
  }

  async findByIdentifier(storeId: string, identifier: string, platform: string) {
    const query = this.customerRepository.createQueryBuilder('customer')
      .where('customer.storeId = :storeId', { storeId });

    if (platform === 'whatsapp') query.andWhere('customer.phoneNumber = :identifier', { identifier });
    else if (platform === 'instagram') query.andWhere('customer.instagramId = :identifier', { identifier });
    else if (platform === 'facebook') query.andWhere('customer.facebookId = :identifier', { identifier });

    return query.getOne();
  }
}
