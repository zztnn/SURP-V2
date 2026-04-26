import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import type { SessionDeviceType } from '../domain/session';
import { SESSION_REPOSITORY, type SessionRepositoryPort } from '../ports/session.repository.port';

export interface SessionItem {
  externalId: string;
  deviceLabel: string | null;
  deviceType: SessionDeviceType | null;
  locationLabel: string | null;
  ip: string;
  userAgent: string | null;
  issuedAt: Date;
  lastRefreshedAt: Date;
  expiresAt: Date;
  /** true si esta sesión es la que originó el JWT del request actual. */
  isCurrent: boolean;
}

/**
 * Devuelve las sesiones activas (no revocadas, no expiradas) del usuario
 * actual, marcando cuál es la sesión actual con base en `sessionExternalId`
 * del `RequestContext` (claim `sid` del JWT). Frontend lo consume desde
 * `/settings/seguridad`.
 */
@Injectable()
export class ListMySessionsUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(_input: undefined, ctx: RequestContext): Promise<SessionItem[]> {
    if (ctx.userId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Listar sesiones requiere usuario autenticado',
      });
    }
    const now = this.clock.now();
    const active = await this.sessions.findActiveByUserId(ctx.userId, now);
    return active.map((s) => ({
      externalId: s.externalId,
      deviceLabel: s.deviceLabel,
      deviceType: s.deviceType,
      locationLabel: s.locationLabel,
      ip: s.ip,
      userAgent: s.userAgent,
      issuedAt: s.issuedAt,
      lastRefreshedAt: s.lastRefreshedAt,
      expiresAt: s.expiresAt,
      isCurrent: ctx.sessionExternalId === s.externalId,
    }));
  }
}
