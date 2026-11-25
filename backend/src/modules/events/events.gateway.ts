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
  /** organization → user → open sockets (tabs). A user is online while they have at least one. */
  private readonly presence = new Map<string, Map<string, number>>();
  /** When each user's last tab closed; kept in memory, so it starts empty after a restart. */
  private readonly lastSeen = new Map<string, Map<string, Date>>();

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
        // The socket may have closed while the stores were loading; then it never counts as online.
        if (client.connected) this.trackPresence(organization.id, payload.sub, client);
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
    const { presenceOrg, user } = client.data || {};
    if (!presenceOrg || !user?.sub) return;
    const users = this.presence.get(presenceOrg);
    const left = (users?.get(user.sub) || 1) - 1;
    if (left > 0) { users!.set(user.sub, left); return; }
    users?.delete(user.sub);
    const at = new Date();
    let seen = this.lastSeen.get(presenceOrg);
    if (!seen) this.lastSeen.set(presenceOrg, (seen = new Map()));
    seen.set(user.sub, at);
    this.server.to(`organization_${presenceOrg}`).emit('presence', { userId: user.sub, online: false, lastSeenAt: at });
  }

  private trackPresence(organizationId: string, userId: string, client: Socket) {
    client.data.presenceOrg = organizationId;
    let users = this.presence.get(organizationId);
    if (!users) this.presence.set(organizationId, (users = new Map()));
    const open = (users.get(userId) || 0) + 1;
    users.set(userId, open);
    if (open === 1) this.server.to(`organization_${organizationId}`).emit('presence', { userId, online: true });
  }

  /** Who in the organization has the platform open now, and when the others were last seen (since the last restart). */
  presenceOf(organizationId: string) {
    const online = [...(this.presence.get(organizationId)?.keys() || [])];
    const lastSeen = Object.fromEntries([...(this.lastSeen.get(organizationId) || [])].map(([id, at]) => [id, at.toISOString()]));
    return { online, lastSeen };
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
