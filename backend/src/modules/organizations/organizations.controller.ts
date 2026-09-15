import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';
import { StoreMemberRole } from './entities/store-member.entity';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('stores/access')
  async storesAccess(@Request() req: any) {
    return this.organizationsService.listStoresForUser(req.user.id, req.user.organizationId);
  }

  @Get('stores/:storeId/members')
  async listStoreMembers(@Request() req: any, @Param('storeId') storeId: string) {
    return this.organizationsService.listStoreMembers(req.user.id, storeId, req.user.organizationId);
  }

  @Post('stores/:storeId/members')
  async assignStoreMember(
    @Request() req: any,
    @Param('storeId') storeId: string,
    @Body() body: { userId: string; role?: StoreMemberRole },
  ) {
    return this.organizationsService.assignStoreMember(
      req.user.id,
      body.userId,
      storeId,
      body.role || StoreMemberRole.AGENT,
      req.user.organizationId,
    );
  }

  @Delete('stores/:storeId/members/:userId')
  async removeStoreMember(@Request() req: any, @Param('storeId') storeId: string, @Param('userId') userId: string) {
    return this.organizationsService.removeStoreMember(req.user.id, userId, storeId, req.user.organizationId);
  }
}
