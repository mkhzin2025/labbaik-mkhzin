import { IsString, IsOptional, IsEmail, IsArray, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { examples } from '../../../common/swagger/api-examples';

export class CreateCustomerDto {
  @ApiPropertyOptional({ example: examples.customer.item.fullName })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: examples.customer.item.email })
  @IsEmail()
  @IsOptional()
  @ValidateIf((o) => o.email && o.email !== '')
  email?: string;

  @ApiPropertyOptional({ example: examples.customer.item.phoneNumber })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '+966511111111' })
  @IsString()
  @IsOptional()
  whatsappId?: string;

  @ApiPropertyOptional({ example: 'insta_user_123' })
  @IsString()
  @IsOptional()
  instagramId?: string;

  @ApiPropertyOptional({ example: 'fb_user_456' })
  @IsString()
  @IsOptional()
  facebookId?: string;

  @ApiPropertyOptional({ example: examples.customer.update.tags, type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: examples.customer.update.notes })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {}
