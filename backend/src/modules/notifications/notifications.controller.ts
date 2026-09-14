import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples, ids } from '../../common/swagger/api-examples';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiResponse({ status: 200, description: 'User notifications.', schema: { example: [examples.notification.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async findAll(@Request() req) {
    return this.notificationsService.findAll(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiParam({ name: 'id', example: ids.notification })
  @ApiResponse({ status: 200, description: 'TypeORM update result.', schema: { example: examples.notification.updateResult } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  @ApiResponse({ status: 200, description: 'TypeORM update result.', schema: { example: { ...examples.notification.updateResult, affected: 4 } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }
}
