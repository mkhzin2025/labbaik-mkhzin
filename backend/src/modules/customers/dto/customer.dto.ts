import { IsString, IsOptional, IsEmail, IsArray, ValidateIf, IsUUID, IsHexColor, IsBoolean, IsInt, Min, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { examples } from '../../../common/swagger/api-examples';
import { CustomerTaxonomyScope } from '../entities/customer-category.entity';

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

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];

  @ApiPropertyOptional({ example: examples.customer.update.notes })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {}

export class CreateCustomerCategoryDto {
  @IsEnum(CustomerTaxonomyScope)
  scope: CustomerTaxonomyScope = CustomerTaxonomyScope.STORE;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateCustomerCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

export class CreateCustomerTagDto {
  @IsEnum(CustomerTaxonomyScope)
  scope: CustomerTaxonomyScope = CustomerTaxonomyScope.STORE;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateCustomerTagDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
