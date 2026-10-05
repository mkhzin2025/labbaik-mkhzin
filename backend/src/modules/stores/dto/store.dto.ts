import { IsNotEmpty, IsString, IsOptional, IsUrl, IsEnum, IsObject, IsArray, ArrayMaxSize, ValidateNested, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { examples } from '../../../common/swagger/api-examples';

export class QuickReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id: string;

  // Typed after "/" in the composer: letters (Arabic or Latin), digits, "_" or "-", no spaces.
  @IsString()
  @Matches(/^[\p{L}\p{N}_-]{1,32}$/u, { message: 'shortcut must be 1-32 letters, digits, _ or -' })
  shortcut: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text: string;
}

export class CreateStoreDto {
  @ApiProperty({ example: examples.store.create.name })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: examples.store.create.description })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: examples.store.create.knowledgeBase })
  @IsString()
  @IsOptional()
  knowledgeBase?: string;

  @ApiPropertyOptional({ example: examples.store.create.logoUrl })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: examples.store.create.website })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ example: examples.store.create.phoneNumber })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: examples.store.create.name })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: examples.store.create.description })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: examples.store.create.knowledgeBase })
  @IsString()
  @IsOptional()
  knowledgeBase?: string;

  @ApiPropertyOptional({ enum: ['always', 'off_hours', 'manual'], example: examples.store.update.aiMode })
  @IsEnum(['always', 'off_hours', 'manual'])
  @IsOptional()
  aiMode?: 'always' | 'off_hours' | 'manual';

  @ApiPropertyOptional({ enum: ['groq', 'gemini', 'openai', 'deepseek', 'deepseek_groq'], example: examples.store.update.preferredModel })
  @IsEnum(['groq', 'gemini', 'openai', 'deepseek', 'deepseek_groq'])
  @IsOptional()
  preferredModel?: 'groq' | 'gemini' | 'openai' | 'deepseek' | 'deepseek_groq';

  @ApiPropertyOptional({ example: examples.store.update.workingHours })
  @IsObject()
  @IsOptional()
  workingHours?: any;

  @ApiPropertyOptional({ example: examples.store.update.customTags, type: [String] })
  @IsString({ each: true })
  @IsOptional()
  customTags?: string[];

  @ApiPropertyOptional({ type: [QuickReplyDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuickReplyDto)
  quickReplies?: QuickReplyDto[];

  @ApiPropertyOptional({ example: examples.store.create.phoneNumber })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: examples.store.create.logoUrl })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: examples.store.create.website })
  @IsUrl()
  @IsOptional()
  website?: string;
}
