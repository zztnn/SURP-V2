import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithContext } from './jwt-auth.guard';
import { PERMISSIONS_KEY } from './decorators';

/**
 * Valida que el usuario autenticado tenga TODOS los permisos listados
 * en `@RequirePermission(...)`. Sin esa annotation, este guard pasa
 * (basta con autenticación, que ya validó JwtAuthGuard).
 *
 * Orden en main.ts: JwtAuthGuard ANTES que PermissionGuard.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(execCtx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      PERMISSIONS_KEY,
      [execCtx.getHandler(), execCtx.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = execCtx.switchToHttp().getRequest<RequestWithContext>();
    const user = req.surpUser ?? null;
    if (!user) {
      // Significaría @RequirePermission sin @Public (esperado) en un
      // endpoint que no llamó JwtAuthGuard. No debería pasar si los
      // guards globales están bien encadenados.
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'AUTH_NO_USER_CONTEXT',
        message: 'Permisos requeridos sin usuario autenticado',
      });
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((c) => !granted.has(c));
    if (missing.length > 0) {
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'AUTH_MISSING_PERMISSIONS',
        message: 'Permisos insuficientes',
        missing,
      });
    }
    return true;
  }
}
