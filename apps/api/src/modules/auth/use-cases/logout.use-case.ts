import { Inject, Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { CLOCK, type ClockPort } from '../../../common';
import { SESSION_REPOSITORY, type SessionRepositoryPort } from '../ports/session.repository.port';
import { TOKEN_ISSUER, type TokenIssuerPort } from '../ports/token-issuer.port';

export interface LogoutInput {
  refreshToken: string;
}

/**
 * Logout idempotente. No falla si:
 *   - El refresh token no existe (ya revocado o nunca emitido).
 *   - La sesión ya estaba revocada.
 *
 * El cliente no debería distinguir estos casos — el output es siempre
 * 204. Esto evita oracle attacks ("¿este refresh token alguna vez
 * existió?") y simplifica el cliente (logout reintentable).
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuerPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: LogoutInput, _ctx: RequestContext): Promise<void> {
    const refreshHash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findByRefreshHash(refreshHash);
    if (!session) {
      return;
    }
    if (session.revokedAt !== null) {
      return;
    }
    await this.sessions.revoke(session.id, 'logout', this.clock.now());
  }
}
