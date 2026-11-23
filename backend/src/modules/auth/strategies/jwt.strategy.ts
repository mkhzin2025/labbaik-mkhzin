import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'LABBAIK_SECRET_2026',
    });
  }

  async validate(payload: any) {
    // The login-code token only finishes a sign-in; it is not a session.
    if (payload.purpose) throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, role: payload.role, organizationId: payload.organizationId };
  }
}
