import { Controller, Get, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Access } from '../organizations/access';
import { OrganizationsService } from '../organizations/organizations.service';
import { EventsGateway } from './events.gateway';

@ApiTags('Team')
@ApiBearerAuth()
@Access('team')
@Controller('presence')
export class PresenceController {
  constructor(private readonly events: EventsGateway, private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Team members who have the platform open now, and when the others were last seen' })
  async get(@Request() req: any) {
    // Resolved like the socket's organization room, so both sides key on the same organization.
    const { organization } = await this.organizations.getMembership(req.user.id, req.user.organizationId);
    return this.events.presenceOf(organization.id);
  }
}
