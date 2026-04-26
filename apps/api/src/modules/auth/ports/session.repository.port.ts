import type { Session, SessionDeviceType, SessionRevokeReason } from '../domain/session';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface SessionRepositoryPort {
  /**
   * Crea una sesión nueva tras login exitoso. Devuelve la entidad
   * persistida (con id BIGINT real y external_id resuelto).
   */
  create(input: CreateSessionInput): Promise<Session>;

  /**
   * Lookup por hash del refresh token (usado en refresh y logout).
   * Retorna null si no existe (token desconocido → 401 sin filtrar
   * si el token fue válido alguna vez).
   */
  findByRefreshHash(refreshHash: string): Promise<Session | null>;

  /**
   * Rota refresh: revoca la sesión vieja con motivo `rotation` y
   * crea una nueva con el nuevo hash. Operación atómica — si falla,
   * la sesión vieja queda intacta. Preserva los labels de dispositivo
   * (deviceLabel/deviceType/locationLabel) de la sesión vieja para
   * que el etiquetado siga estable a través de rotaciones.
   */
  rotateRefresh(input: RotateRefreshInput): Promise<Session>;

  /**
   * Marca la sesión como revocada. Idempotente — revocar una sesión
   * ya revocada no falla.
   */
  revoke(sessionId: bigint, reason: SessionRevokeReason, at: Date): Promise<void>;

  /**
   * Revoca todas las sesiones activas del usuario (used por
   * `password_change` o `admin force-logout`).
   */
  revokeAllForUser(userId: bigint, reason: SessionRevokeReason, at: Date): Promise<number>;

  /**
   * Devuelve las sesiones activas del usuario (no revocadas y no
   * expiradas) ordenadas por `lastRefreshedAt` descendente. Usado
   * por `ListMySessionsUseCase` para alimentar `/settings/seguridad`.
   */
  findActiveByUserId(userId: bigint, now: Date): Promise<Session[]>;

  /**
   * Revoca una sesión por su `external_id`, validando que pertenezca
   * al usuario indicado. Devuelve true si efectivamente revocó algo,
   * false si la sesión no existe, no es del usuario o ya estaba
   * revocada. Esto evita filtrar la existencia de sesiones de otros
   * usuarios.
   */
  revokeByExternalIdForUser(
    externalId: string,
    userId: bigint,
    reason: SessionRevokeReason,
    at: Date,
  ): Promise<boolean>;
}

export interface CreateSessionInput {
  userId: bigint;
  refreshTokenHash: string;
  ip: string;
  userAgent: string | null;
  expiresAt: Date;
  deviceLabel: string | null;
  deviceType: SessionDeviceType | null;
  locationLabel: string | null;
}

export interface RotateRefreshInput {
  oldSessionId: bigint;
  newRefreshTokenHash: string;
  newExpiresAt: Date;
  ip: string;
  userAgent: string | null;
}
