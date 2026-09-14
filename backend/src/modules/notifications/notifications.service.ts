import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { EventsGateway } from '../events/events.gateway';
import { User } from '../users/entities/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, data: { type: any, title: string, message: string, link?: string }) {
    const notification = this.notificationRepository.create({
      ...data,
      user: { id: userId } as User,
    });
    const saved = await this.notificationRepository.save(notification);

    // Emit real-time via WebSocket
    this.eventsGateway.server.to(`store_${userId}`).emit('notification', saved);

    return saved;
  }

  async findAll(userId: string) {
    return this.notificationRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async markAsRead(id: string) {
    return this.notificationRepository.update(id, { isRead: true });
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepository.update({ user: { id: userId }, isRead: false }, { isRead: true });
  }
}
