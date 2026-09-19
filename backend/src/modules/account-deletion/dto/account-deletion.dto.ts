import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountDeletionStatus } from '../entities/account-deletion-request.entity';

export class CreateAccountDeletionRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'يرجى إدخال بريد إلكتروني صحيح' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: 'مؤسسة مخزن' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationName?: string;

  @ApiPropertyOptional({ example: '+966500000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'سبب الحذف...' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateAccountDeletionStatusDto {
  @ApiProperty({ enum: AccountDeletionStatus })
  @IsEnum(AccountDeletionStatus)
  status: AccountDeletionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
