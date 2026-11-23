import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyLoginCodeDto, ResendLoginCodeDto } from './dto/auth.dto';
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
  @ApiOperation({
    summary: 'Log in',
    description: 'Returns a JWT. In Swagger Authorize, paste the raw token value without the word Bearer. Support-role members instead get { otpRequired, challenge, phone, resendIn }: a code is sent by SMS, then POST /auth/login/verify returns the JWT.',
  })
  @ApiBody({ type: LoginDto, examples: { default: { value: examples.auth.login } } })
  @ApiResponse({ status: 200, description: 'Login succeeded.', schema: { example: examples.auth.authResponse } })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.', schema: { example: examples.errors.unauthorized } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a support-role login with the SMS code', description: 'Returns the same response as a normal login. Five wrong codes end the attempt.' })
  async verifyLoginCode(@Body() dto: VerifyLoginCodeDto) {
    return this.authService.verifyLoginCode(dto.challenge, dto.code);
  }

  @Post('login/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a new SMS login code', description: 'Allowed once a minute.' })
  async resendLoginCode(@Body() dto: ResendLoginCodeDto) {
    return this.authService.resendLoginCode(dto.challenge);
  }
}
