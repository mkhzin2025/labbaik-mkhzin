import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, Logger } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('EventsGateway');

  constructor(
    private readonly jwtService: JwtService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Check for token in Auth object, Headers, or Query string
      const token = client.handshake.auth.token || 
                    client.handshake.headers.authorization?.split(' ')[1] ||
                    client.handshake.query.token as string;
      
      if (!token) {
        throw new UnauthorizedException();
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      
      // Personal room is kept for user-specific notifications.
      client.join(`user_${payload.sub}`);
      // Backward-compatible room for existing notification emitters.
      client.join(`store_${payload.sub}`);

      // Join every branch in the active organization. Branch events are still isolated by store room.
      try {
        const { organization, stores } = await this.organizationsService.listStoresForUser(payload.sub, payload.organizationId);
        client.join(`organization_${organization.id}`);
        for (const store of stores) client.join(`store_${store.id}`);
        client.data.organizationId = organization.id;
        client.data.storeIds = stores.map((store) => store.id);
      } catch (error) {
        this.logger.warn(`Client ${client.id} has no accessible store room: ${error.message}`);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${payload.email})`);
    } catch (error) {
      this.logger.error(`Connection failed for client: ${client.id} - ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { event: 'pong', data: 'Server is alive!' };
  }

  // Helper method to send messages to a specific store room
  sendToStore(storeId: string, event: string, data: any) {
    this.server.to(`store_${storeId}`).emit(event, data);
  }
}
