import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { OrganizationsModule } from '../organizations/organizations.module';

@Global()
@Module({
  imports: [
    OrganizationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'LABBAIK_SECRET_2026',
        signOptions: { 
          expiresIn: (configService.get<string>('JWT_EXPIRATION') || '1d') as any 
        },
      }),
    }),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
