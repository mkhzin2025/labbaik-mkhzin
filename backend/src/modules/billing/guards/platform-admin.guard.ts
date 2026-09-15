import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = String(request.user?.email || '').toLowerCase();
    const configured = String(this.config.get<string>('PLATFORM_ADMIN_EMAILS') || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!email || !configured.includes(email)) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    return true;
  }
}
