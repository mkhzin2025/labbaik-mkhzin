import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { examples } from '../../../common/swagger/api-examples';

export class RegisterDto {
  @ApiProperty({ example: examples.auth.register.email })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: examples.auth.register.password, minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: examples.auth.register.fullName })
  @IsString()
  @IsNotEmpty()
  fullName: string;
}

export class LoginDto {
  @ApiProperty({ example: examples.auth.login.email })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: examples.auth.login.password })
  @IsString()
  @IsNotEmpty()
  password: string;
}
