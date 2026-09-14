import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StoresModule } from './modules/stores/stores.module';
import { EventsModule } from './modules/events/events.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CustomersModule } from './modules/customers/customers.module';
import { FlowsModule } from './modules/flows/flows.module';
import { User } from './modules/users/entities/user.entity';
import { Store } from './modules/stores/entities/store.entity';
import { Channel } from './modules/channels/entities/channel.entity';
import { Review } from './modules/reviews/entities/review.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { Customer } from './modules/customers/entities/customer.entity';
import { Flow } from './modules/flows/entities/flow.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [User, Store, Channel, Review, Notification, Customer, Flow],
        synchronize: true,
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
      }),
    }),
    AuthModule,
    UsersModule,
    StoresModule,
    EventsModule,
    ChannelsModule,
    WebhooksModule,
    ConversationsModule,
    AiModule,
    ReviewsModule,
    NotificationsModule,
    CustomersModule,
    FlowsModule,
  ],
})
export class AppModule {}
