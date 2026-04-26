import { SetMetadata } from '@nestjs/common';

/**
 * Endpoint público — bypassa JwtAuthGuard. Usado por /health,
 * /auth/login, /auth/refresh y eventualmente endpoints de la API
 * externa de bloqueos (que usa API key, no JWT).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Marca el handler como requiriendo uno o más permisos. El
 * `PermissionGuard` valida que el usuario tenga TODOS los listados
 * (AND, no OR). Sin esta annotation, el endpoint solo requiere estar
 * autenticado (JwtAuthGuard pasa).
 *
 * Convención: `modulo.recurso.accion` (ver permissions.catalog.ts).
 */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...codes: readonly string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, codes);
