import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';
import { StoreMemberRole } from './entities/store-member.entity';
import { Access } from './access';

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

  /** The caller's role and the dashboard sections it can open. */
  @Get('me/access')
  async myAccess(@Request() req: any) {
    return this.organizationsService.getAccess(req.user.id, req.user.organizationId);
  }

  @Get('members')
  @Access('team')
  async listMembers(@Request() req: any) {
    return this.organizationsService.listMembers(req.user.id, req.user.organizationId);
  }

  @Post('members')
  @Access('team')
  async addMember(@Request() req: any, @Body() body: { fullName?: string; email?: string; password?: string; role?: string; storeIds?: string[] }) {
    return this.organizationsService.addMember(req.user.id, req.user.organizationId, body);
  }

  @Patch('members/:userId')
  @Access('team')
  async updateMember(@Request() req: any, @Param('userId') userId: string, @Body() body: { fullName?: string; password?: string; role?: string; storeIds?: string[] }) {
    return this.organizationsService.updateMember(req.user.id, req.user.organizationId, userId, body);
  }

  @Delete('members/:userId')
  @Access('team')
  async removeMember(@Request() req: any, @Param('userId') userId: string) {
    return this.organizationsService.removeMember(req.user.id, req.user.organizationId, userId);
  }

  @Get('stores/:storeId/members')
  @Access('team')
  async listStoreMembers(@Request() req: any, @Param('storeId') storeId: string) {
    return this.organizationsService.listStoreMembers(req.user.id, storeId, req.user.organizationId);
  }

  @Post('stores/:storeId/members')
  @Access('team')
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
  @Access('team')
  async removeStoreMember(@Request() req: any, @Param('storeId') storeId: string, @Param('userId') userId: string) {
    return this.organizationsService.removeStoreMember(req.user.id, userId, storeId, req.user.organizationId);
  }
}
