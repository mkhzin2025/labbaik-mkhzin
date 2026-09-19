import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountDeletionService } from './account-deletion.service';
import { CreateAccountDeletionRequestDto, UpdateAccountDeletionStatusDto } from './dto/account-deletion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../billing/guards/platform-admin.guard';

@ApiTags('Account Deletion')
@Controller()
export class AccountDeletionController {
  constructor(private readonly service: AccountDeletionService) {}

  @Post('public/account-deletion-request')
  @ApiOperation({ summary: 'Submit a public account and data deletion request' })
  @ApiResponse({ status: 200, description: 'Request accepted securely without leaking account presence.' })
  createPublicRequest(@Body() dto: CreateAccountDeletionRequestDto, @Req() req: any) {
    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] as string;
    return this.service.createPublicRequest(dto, rawIp, userAgent);
  }

  @Get('admin/account-deletion-requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({ summary: 'List all account deletion requests for platform admin review' })
  listRequestsForAdmin() {
    return this.service.listRequestsForAdmin();
  }

  @Patch('admin/account-deletion-requests/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({ summary: 'Update status and notes of an account deletion request' })
  updateStatusForAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDeletionStatusDto,
  ) {
    return this.service.updateStatusForAdmin(id, dto);
  }
}
