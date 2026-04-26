import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import {
  USER_REPOSITORY,
  type OrganizationType,
  type UserRepositoryPort,
  type UserWithPermissions,
} from '../ports/user.repository.port';

export interface CurrentUserResult {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  active: boolean;
  mustResetPassword: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  permissions: readonly string[];
  roles: readonly string[];
}

/**
 * Lookup del usuario actual desde el RequestContext (poblado por el
 * `JwtAuthGuard`). No acepta input — el ctx ya tiene userId.
 *
 * Sirve al endpoint GET /auth/me. El frontend lo llama al cargar la
 * SPA para reconstruir su estado (roles, permisos, datos de display).
 */
@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(_input: undefined, ctx: RequestContext): Promise<CurrentUserResult> {
    if (ctx.userId === null) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'AUTH_NO_CONTEXT',
        message: 'No hay usuario autenticado en el contexto',
      });
    }
    const user = await this.users.findByIdWithPermissions(ctx.userId);
    if (!user) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'AUTH_USER_NOT_FOUND',
        message: 'Usuario referenciado por el token ya no existe',
      });
    }
    return toResult(user);
  }
}

function toResult(u: UserWithPermissions): CurrentUserResult {
  return {
    id: u.id.toString(),
    externalId: u.externalId,
    email: u.email,
    displayName: u.displayName,
    organizationId: u.organizationId.toString(),
    organizationName: u.organizationName,
    organizationType: u.organizationType,
    active: u.active,
    mustResetPassword: u.mustResetPassword,
    mfaRequired: u.mfaRequired,
    mfaEnrolled: u.mfaEnrolled,
    permissions: u.permissions,
    roles: u.roles,
  };
}
