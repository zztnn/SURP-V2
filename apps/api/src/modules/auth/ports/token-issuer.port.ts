export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

/**
 * Emisor + verificador de tokens. Encapsula:
 *   - Access JWT (HS256, exp 15 min, payload con userId/orgId/permissions).
 *   - Refresh token opaco (32 bytes random base64url) + su hash sha256
 *     para almacenar en BD sin retener el plano.
 *
 * Mantener una sola interface evita que el módulo auth filtre detalles
 * de impl JWT a controllers/guards.
 */
export interface TokenIssuerPort {
  signAccessToken(payload: AccessTokenPayload): Promise<string>;

  /**
   * Verifica firma + exp + iss + aud. Retorna el payload tipado o lanza
   * `TokenInvalidError` si la verificación falla.
   */
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;

  /**
   * Genera un refresh token plano (32 bytes random → base64url).
   * El plano se devuelve al cliente exactamente una vez.
   */
  generateOpaqueRefreshToken(): string;

  /**
   * Hash sha256 hex del refresh token. Se persiste en `user_sessions.refresh_token_hash`.
   * Sha256 (no argon2) porque el refresh ya es un secreto de 32 bytes
   * uniformemente aleatorio — derivación lenta no aporta seguridad.
   */
  hashRefreshToken(plain: string): string;
}

export interface AccessTokenPayload {
  /** users.id como string (JWT no soporta bigint nativo) */
  sub: string;
  /** organizations.id como string */
  org: string;
  /** identificador único del token (jti) — futuro uso para revocación granular */
  jti: string;
  /**
   * `user_sessions.external_id` (UUID) de la sesión que originó este JWT.
   * Lo usa el frontend para marcar la sesión actual en `/settings/seguridad`
   * y el backend para rechazar `DELETE /auth/sessions/:externalId` cuando
   * coincide con la sesión actual (código `AUTH_CANNOT_REVOKE_CURRENT`).
   */
  sid: string;
  /** true si el login pasó por challenge MFA. F6 lo deja false. */
  mfa: boolean;
}

export class TokenInvalidError extends Error {
  constructor(public readonly reason: 'expired' | 'malformed' | 'signature' | 'unknown') {
    super(`Token inválido (${reason})`);
    this.name = 'TokenInvalidError';
  }
}
