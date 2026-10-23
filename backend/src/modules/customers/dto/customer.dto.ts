import { IsString, IsOptional, IsEmail, IsArray, ValidateIf, IsUUID, IsHexColor, IsBoolean, IsInt, Min, IsEnum, IsIn, ArrayNotEmpty, ArrayMaxSize, ValidateNested } from 'class-validator';
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

export class UpdateCustomerDto extends CreateCustomerDto {
  @ApiPropertyOptional({ description: 'Customer declined marketing campaigns; bulk template sends skip them.' })
  @IsBoolean()
  @IsOptional()
  marketingOptOut?: boolean;
}

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

export class BulkCustomerTaxonomyDto {
  @IsUUID('4')
  storeId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  customerIds: string[];

  @IsIn(['add', 'remove'])
  mode: 'add' | 'remove';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}

export class ImportCustomerRowDto {
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => o.email && o.email !== '')
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ImportCustomersDto {
  @IsUUID('4')
  storeId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRowDto)
  rows: ImportCustomerRowDto[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}

/** Who a WhatsApp campaign targets; resolved to customers on the server. */
export class CustomerAudienceDto {
  @ApiPropertyOptional({ enum: ['all', 'segment', 'manual'], default: 'all' })
  @IsIn(['all', 'segment', 'manual'])
  mode: 'all' | 'segment' | 'manual' = 'all';

  @ApiPropertyOptional({ type: [String], description: 'Branches to target; empty means every accessible branch.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'segment: customers in any of these categories.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'segment: customers carrying these tags (see tagMatch).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ enum: ['any', 'all'], default: 'any' })
  @IsOptional()
  @IsIn(['any', 'all'])
  tagMatch?: 'any' | 'all';

  @ApiPropertyOptional({ type: [String], description: 'segment: drop customers in any of these categories.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  excludeCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'segment: drop customers carrying any of these tags.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  excludeTagIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'manual: the hand-picked customers.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsUUID('4', { each: true })
  customerIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'all/segment: customers unticked in the review list.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsUUID('4', { each: true })
  excludeCustomerIds?: string[];
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
