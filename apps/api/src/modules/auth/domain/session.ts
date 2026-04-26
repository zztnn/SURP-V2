import { DomainError } from '../../../common';

/**
 * Sesión activa con refresh token rotable. La entidad NO contiene el
 * refresh token plano — solo su hash. El plano se genera/devuelve al
 * cliente una sola vez (al crear o al rotar) y nunca se persiste.
 */
export class Session {
  constructor(
    public readonly id: bigint,
    public readonly externalId: string,
    public readonly userId: bigint,
    public readonly refreshTokenHash: string,
    public readonly ip: string,
    public readonly userAgent: string | null,
    public readonly issuedAt: Date,
    public readonly lastRefreshedAt: Date,
    public readonly expiresAt: Date,
    public readonly revokedAt: Date | null,
    public readonly revokeReason: SessionRevokeReason | null,
    public readonly deviceLabel: string | null = null,
    public readonly deviceType: SessionDeviceType | null = null,
    public readonly locationLabel: string | null = null,
  ) {}

  isActive(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt > now;
  }

  /**
   * Llamado por `RefreshTokenUseCase` antes de rotar. Si la sesión
   * está revocada o expirada, lanza para que el use case responda
   * 401 (y el cliente sea forzado a re-login).
   */
  assertCanRefresh(now: Date): void {
    if (this.revokedAt !== null) {
      throw new DomainError(
        `Sesión revocada (${this.revokeReason ?? 'unknown'})`,
        'AUTH_SESSION_REVOKED',
      );
    }
    if (this.expiresAt <= now) {
      throw new DomainError('Sesión expirada', 'AUTH_SESSION_EXPIRED');
    }
  }
}

export type SessionRevokeReason =
  | 'logout'
  | 'admin'
  | 'password_change'
  | 'suspicious'
  | 'rotation';

/**
 * Tipos de dispositivo derivados del User-Agent (ua-parser-js).
 * `desktop` cuando ua-parser no marca tipo (default web). `bot` para
 * crawlers/scrapers. `unknown` cuando no se pudo parsear.
 */
export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

/** Snapshot crudo persistido. La capa infra mapea row → Session. */
export interface SessionRow {
  id: bigint;
  externalId: string;
  userId: bigint;
  refreshTokenHash: string;
  ip: string;
  userAgent: string | null;
  issuedAt: Date;
  lastRefreshedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: SessionRevokeReason | null;
  deviceLabel: string | null;
  deviceType: SessionDeviceType | null;
  locationLabel: string | null;
}
