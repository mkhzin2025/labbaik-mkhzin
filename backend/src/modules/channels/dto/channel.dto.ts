import { IsEnum, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelType } from '../entities/channel.entity';
import { examples } from '../../../common/swagger/api-examples';

export class CreateChannelDto {
  @ApiProperty({ enum: ChannelType, example: examples.channel.create.type })
  @IsEnum(ChannelType)
  @IsNotEmpty()
  type: ChannelType;

  @ApiPropertyOptional({ example: examples.channel.create.credentials })
  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;
}

export class UpdateChannelStatusDto {
  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  @IsEnum(['active', 'inactive'])
  status: string;
}
