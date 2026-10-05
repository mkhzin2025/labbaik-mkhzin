import { Controller, Get, Patch, Body, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { examples } from '../../common/swagger/api-examples';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user without password.', schema: { example: examples.user.current } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ description: 'User does not exist.', schema: { example: { message: 'User not found', error: 'Not Found', statusCode: 404 } } })
  async findMe(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new NotFoundException('User not found');
    
    const { password, ...result } = user;
    return result;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.user.update } } })
  @ApiResponse({ status: 200, description: 'Updated user without password.', schema: { example: { ...examples.user.current, fullName: examples.user.update.fullName } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  async update(@Body() body: UpdateMeDto, @Request() req) {
    // Copy only self-editable fields: the raw body must never reach the entity, or a user could set their own role.
    const updateData: Partial<Pick<UpdateMeDto, 'fullName' | 'email' | 'password'>> = {};
    if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
    if (body.email !== undefined) updateData.email = body.email.trim().toLowerCase();
    if (body.password) updateData.password = body.password;
    if (updateData.fullName === '') throw new BadRequestException('Full name cannot be empty');

    const user = await this.usersService.update(req.user.id, updateData);
    if (!user) throw new NotFoundException('User not found');

    const { password, ...result } = user;
    return result;
  }
}
