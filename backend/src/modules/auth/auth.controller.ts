import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { examples } from '../../common/swagger/api-examples';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a user account. Create a store with POST /stores after registering, because most dashboard APIs require a store profile.',
  })
  @ApiBody({ type: RegisterDto, examples: { default: { value: examples.auth.register } } })
  @ApiResponse({ status: 201, description: 'User registered and JWT returned.', schema: { example: examples.auth.authResponse } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in', description: 'Returns a JWT. In Swagger Authorize, paste the raw token value without the word Bearer.' })
  @ApiBody({ type: LoginDto, examples: { default: { value: examples.auth.login } } })
  @ApiResponse({ status: 200, description: 'Login succeeded.', schema: { example: examples.auth.authResponse } })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.', schema: { example: examples.errors.unauthorized } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
