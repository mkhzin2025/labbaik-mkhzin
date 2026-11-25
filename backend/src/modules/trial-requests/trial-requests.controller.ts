import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request } from '@nestjs/common';
import { Access } from '../organizations/access';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TrialRequestsService } from './trial-requests.service';
import type { TrialRequestInput } from './trial-requests.service';

/**
 * Trial / subscription requests from the public website. Served under /organizations because the production
 * proxy only forwards known path prefixes to the backend.
 */
@ApiTags('Trial requests')
@Controller('organizations/trial-requests')
export class TrialRequestsController {
  constructor(private readonly trialRequests: TrialRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Public: request a trial / subscription from the website' })
  create(@Body() body: TrialRequestInput, @Request() req: any) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return this.trialRequests.create(body || {}, forwarded || req.ip || null);
  }

  // Owners and admins only (the roles allowed into the team section), of the platform owner organization.
  @Get('summary')
  @ApiBearerAuth()
  @Access('team')
  @ApiOperation({ summary: 'Whether the caller sees website requests, and how many are new' })
  async summary(@Request() req: any) {
    if (!this.trialRequests.isOwner(req.user.organizationId)) return { enabled: false, newCount: 0 };
    return { enabled: true, newCount: await this.trialRequests.newCount() };
  }

  @Get()
  @ApiBearerAuth()
  @Access('team')
  list(@Request() req: any, @Query('status') status?: string, @Query('page') page?: string) {
    this.trialRequests.assertOwner(req.user.organizationId);
    return this.trialRequests.list(status, Math.min(1000, Math.max(1, Math.trunc(Number(page) || 1))));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Access('team')
  setStatus(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body('status') status: unknown) {
    this.trialRequests.assertOwner(req.user.organizationId);
    return this.trialRequests.setStatus(id, status);
  }
}
