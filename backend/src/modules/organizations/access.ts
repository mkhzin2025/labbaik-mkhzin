import { applyDecorators, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { sectionsFor } from './roles';
import type { Section } from './roles';
import { OrganizationsService } from './organizations.service';

export { SECTIONS, MEMBER_ROLES, memberRoleOf, sectionsFor } from './roles';
export type { Section, MemberRole } from './roles';

const SECTIONS_KEY = 'access:sections';

/**
 * Authenticated route open to members whose role covers any of `sections`. Usable on a controller or a
 * method; a method's sections replace its controller's.
 */
export const Access = (...sections: Section[]) => applyDecorators(SetMetadata(SECTIONS_KEY, sections), UseGuards(SectionsGuard));

/** Checks the JWT itself, so it does not depend on the order guards are declared in. */
@Injectable()
export class SectionsGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector, private readonly organizationsService: OrganizationsService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const sections = this.reflector.getAllAndOverride<Section[]>(SECTIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!sections?.length) return true;

    const request = context.switchToHttp().getRequest();
    const { membership } = await this.organizationsService.getMembership(request.user.id, request.user.organizationId);
    const allowed = sectionsFor(membership.role);
    request.orgRole = membership.role;
    request.orgSections = allowed;
    if (!sections.some((section) => allowed.includes(section))) {
      throw new ForbiddenException('ليست لديك صلاحية للوصول إلى هذا القسم.');
    }
    return true;
  }
}
