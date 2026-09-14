import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('EventsGateway');

  constructor(private readonly jwtService: JwtService) {}

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
      
      // Join store room for specific real-time updates
      const storeRoom = `store_${payload.sub}`;
      client.join(storeRoom);

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
