import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';
import { MetaConnectionMode, MetaConnectionScope, MetaInboundRouting } from '../entities/meta-whatsapp-connection.entity';

export class SaveMetaWhatsAppConnectionDto {
  @ApiProperty({ enum: MetaConnectionScope, default: MetaConnectionScope.STORE })
  @IsEnum(MetaConnectionScope)
  scope: MetaConnectionScope = MetaConnectionScope.STORE;

  @ApiPropertyOptional({ description: 'Required when scope=store.' })
  @ValidateIf((o) => o.scope === MetaConnectionScope.STORE)
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Fallback branch for inbound messages when scope=organization.' })
  @IsOptional()
  @IsUUID('4')
  defaultStoreId?: string;

  @ApiPropertyOptional({ enum: MetaInboundRouting, default: MetaInboundRouting.LAST_CUSTOMER_STORE })
  @IsOptional()
  @IsEnum(MetaInboundRouting)
  inboundRouting?: MetaInboundRouting;

  @ApiProperty({ enum: MetaConnectionMode, default: MetaConnectionMode.SHARED_APP })
  @IsEnum(MetaConnectionMode)
  mode: MetaConnectionMode = MetaConnectionMode.SHARED_APP;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional({ description: 'Required only when the tenant uses its own Meta App.' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  wabaId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayPhoneNumber?: string;

  @ApiProperty({ description: 'Permanent/system-user access token or a token valid for this WABA.' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

export class UpdateMetaWhatsAppConnectionDto {
  @ApiPropertyOptional({ enum: MetaConnectionScope })
  @IsOptional()
  @IsEnum(MetaConnectionScope)
  scope?: MetaConnectionScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultStoreId?: string;

  @ApiPropertyOptional({ enum: MetaInboundRouting })
  @IsOptional()
  @IsEnum(MetaInboundRouting)
  inboundRouting?: MetaInboundRouting;

  @ApiPropertyOptional({ enum: MetaConnectionMode })
  @IsOptional()
  @IsEnum(MetaConnectionMode)
  mode?: MetaConnectionMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wabaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayPhoneNumber?: string;

  @ApiPropertyOptional({ description: 'Leave empty to keep the current token.' })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class SendWhatsAppTemplateDto {
  @ApiPropertyOptional({ description: 'Branch that owns the customer/conversation. Required for store scoped numbers; optional for organization numbers.' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiProperty({ example: '9665XXXXXXXX' })
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/)
  to: string;

  @ApiPropertyOptional({ type: [String], description: 'Values for BODY {{1}}, {{2}}, ...' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyParameters?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Values for text HEADER placeholders.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headerParameters?: string[];

  @ApiPropertyOptional({ description: 'Optional raw Meta template components for advanced/dynamic buttons or media headers.' })
  @IsOptional()
  @IsArray()
  components?: Record<string, any>[];
}

export class SendWhatsAppTemplateBulkDto {
  @ApiPropertyOptional({ description: 'Legacy/single branch selector.' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Selected branches when using an organization-wide number.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiProperty({ type: [String], description: 'Selected customer records. Duplicate phone numbers are sent only once.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  customerIds: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyParameters?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headerParameters?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  components?: Record<string, any>[];
}
