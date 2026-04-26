import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import type { LoginOutcome } from '../domain/login-attempt';
import { USER_REPOSITORY, type UserRepositoryPort } from '../ports/user.repository.port';

export interface LoginAttemptItem {
  outcome: LoginOutcome;
  mfaUsed: boolean;
  ip: string;
  userAgent: string | null;
  attemptedAt: Date;
}

const DEFAULT_LIMIT = 20;

/**
 * Devuelve los últimos N intentos de login del usuario actual (success
 * y failure mezclados). Solo accesible para el propio usuario — no
 * acepta `userId` como parámetro: se toma del `RequestContext`.
 *
 * Frontend lo consume en `/settings/seguridad`. NO requiere permission
 * code adicional — todo usuario autenticado puede ver su historial.
 */
@Injectable()
export class ListMyLoginAttemptsUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(_input: undefined, ctx: RequestContext): Promise<LoginAttemptItem[]> {
    if (ctx.userId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Login history requiere usuario autenticado',
      });
    }
    const attempts = await this.users.findRecentLoginAttempts(ctx.userId, DEFAULT_LIMIT);
    return attempts.map((a) => ({
      outcome: a.outcome,
      mfaUsed: a.mfaUsed,
      ip: a.ip,
      userAgent: a.userAgent,
      attemptedAt: a.attemptedAt,
    }));
  }
}
