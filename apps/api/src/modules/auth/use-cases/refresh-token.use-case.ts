import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError, type RequestContext } from '../../../common';
import { CLOCK, type ClockPort } from '../../../common';
import { SESSION_REPOSITORY, type SessionRepositoryPort } from '../ports/session.repository.port';
import { TOKEN_ISSUER, type TokenIssuerPort } from '../ports/token-issuer.port';
import { USER_REPOSITORY, type UserRepositoryPort } from '../ports/user.repository.port';

const REFRESH_TTL_DAYS = 30;

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Rota el refresh token de forma atómica:
 *   1. Valida hash del refresh recibido contra `user_sessions`.
 *   2. Verifica que la sesión no esté revocada ni expirada.
 *   3. Verifica que el usuario siga activo y no bloqueado.
 *   4. Genera nuevo refresh + access; revoca el viejo con motivo
 *      `rotation`; persiste el nuevo en la misma transacción.
 *   5. Retorna el nuevo par.
 *
 * Detección de reuso (refresh token ya rotado): si el refresh recibido
 * pertenece a una sesión revocada con motivo='rotation', es señal de
 * que un atacante capturó el token antiguo. F6 deja la detección
 * pendiente (TODO post-MVP); F6 solo responde 401.
 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuerPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: RefreshTokenInput, ctx: RequestContext): Promise<RefreshTokenResult> {
    const now = this.clock.now();
    const refreshHash = this.tokens.hashRefreshToken(input.refreshToken);

    const session = await this.sessions.findByRefreshHash(refreshHash);
    if (!session) {
      throw this.unauthorized('AUTH_REFRESH_UNKNOWN');
    }

    try {
      session.assertCanRefresh(now);
    } catch (e) {
      if (e instanceof DomainError) {
        throw this.unauthorized(e.code);
      }
      throw e;
    }

    const user = await this.users.findByIdWithPermissions(session.userId);
    if (!user || !user.active) {
      throw this.unauthorized('AUTH_USER_INACTIVE');
    }

    const newRefreshPlain = this.tokens.generateOpaqueRefreshToken();
    const newRefreshHash = this.tokens.hashRefreshToken(newRefreshPlain);
    const newExpiresAt = new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);

    const newSession = await this.sessions.rotateRefresh({
      oldSessionId: session.id,
      newRefreshTokenHash: newRefreshHash,
      newExpiresAt,
      ip: ctx.ip ?? '0.0.0.0',
      userAgent: ctx.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id.toString(),
      org: user.organizationId.toString(),
      jti: randomUUID(),
      sid: newSession.externalId,
      mfa: false,
    });

    return {
      accessToken,
      refreshToken: newRefreshPlain,
      expiresIn: 15 * 60,
    };
  }

  private unauthorized(code: string): UnauthorizedException {
    return new UnauthorizedException({
      error: 'Unauthorized',
      code,
      message: 'Refresh token inválido — re-login requerido',
    });
  }
}
