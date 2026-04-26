import type { AuthenticatedUser } from '../domain/authenticated-user';
import type { LoginAttempt, LoginOutcome } from '../domain/login-attempt';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Acceso a `users`, `user_roles`, `role_permissions`, `permissions` y
 * `user_login_attempts`. El use case solo conoce esta interface; la
 * implementación Kysely vive en `infrastructure/`.
 */
export interface UserRepositoryPort {
  /**
   * Lookup por email para login. Retorna null si no existe (lo cual
   * el use case mapea a `unknown_email` en login_attempts y a 401
   * sin distinguir del `bad_password` para evitar enumeración).
   *
   * No incluye soft-deleted (`deleted_at IS NOT NULL`).
   */
  findByEmail(email: string): Promise<AuthenticatedUser | null>;

  /**
   * Lookup por id usado por:
   *   - `JwtAuthGuard` cuando hidrata el RequestContext desde el JWT.
   *   - `RefreshTokenUseCase` después de validar la sesión.
   *   - `GetCurrentUserUseCase`.
   *
   * Hidrata permisos efectivos (UNION sobre los roles del usuario).
   */
  findByIdWithPermissions(userId: bigint): Promise<UserWithPermissions | null>;

  /**
   * Append-only. El schema lo registra en cada intento independiente
   * del outcome (success o failure). Se usa para:
   *   1. Detección de abuso (bloqueo por 5 fails en 10 min).
   *   2. Análisis forense post-incidente.
   */
  registerLoginAttempt(attempt: LoginAttempt): Promise<void>;

  /**
   * Cuenta los intentos fallidos (`bad_password` | `mfa_failed`) del
   * usuario en la ventana indicada. Se usa para decidir lockout.
   */
  countRecentFailures(userId: bigint, sinceMinutesAgo: number): Promise<number>;

  /**
   * Setea `users.locked_until` para forzar bloqueo temporal.
   */
  lockUser(userId: bigint, until: Date): Promise<void>;

  /**
   * Setea `users.last_login_at` y `last_login_ip` tras login exitoso.
   */
  touchLastLogin(userId: bigint, ip: string, at: Date): Promise<void>;

  /**
   * Últimos intentos de login (incluye éxitos y fallos) del usuario,
   * ordenados por `attempted_at DESC`. Default limit = 20.
   * Usado por el endpoint `GET /auth/login-history`.
   */
  findRecentLoginAttempts(userId: bigint, limit: number): Promise<LoginAttemptRecord[]>;
}

export interface LoginAttemptRecord {
  outcome: LoginOutcome;
  mfaUsed: boolean;
  ip: string;
  userAgent: string | null;
  attemptedAt: Date;
}

/**
 * Proyección con permisos efectivos pre-calculados (UNION sobre roles).
 * Se entrega al guard / al use case `me` sin necesidad de joins extra
 * en cada request.
 */
export interface UserWithPermissions {
  id: bigint;
  externalId: string;
  organizationId: bigint;
  email: string;
  displayName: string;
  active: boolean;
  mustResetPassword: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  /** codes ordenados (`audit.logs.read`, `blocks.blocks.read`, ...) */
  permissions: readonly string[];
  /** nombres de roles asignados, útiles para UI */
  roles: readonly string[];
}
