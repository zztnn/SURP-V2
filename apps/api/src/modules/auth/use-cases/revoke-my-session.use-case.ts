import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import { SESSION_REPOSITORY, type SessionRepositoryPort } from '../ports/session.repository.port';

export interface RevokeMySessionInput {
  /** `user_sessions.external_id` (UUID) de la sesión a revocar. */
  externalId: string;
}

/**
 * Revoca una sesión específica del usuario actual (no permite revocar
 * sesiones de otros usuarios — el repository filtra por userId).
 *
 * Reglas:
 *   - Rechaza si la sesión apuntada coincide con la sesión actual: el
 *     usuario debe usar `/auth/logout` para cerrar su propia sesión.
 *     Código `AUTH_CANNOT_REVOKE_CURRENT` (HTTP 400).
 *   - Si la sesión no existe, no es del usuario, o ya estaba revocada,
 *     responde 404 uniforme (no filtra existencia ajena).
 */
@Injectable()
export class RevokeMySessionUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: RevokeMySessionInput, ctx: RequestContext): Promise<void> {
    if (ctx.userId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Revocar sesión requiere usuario autenticado',
      });
    }

    if (ctx.sessionExternalId === input.externalId) {
      throw new BadRequestException({
        error: 'BadRequest',
        code: 'AUTH_CANNOT_REVOKE_CURRENT',
        message: 'No puedes revocar tu sesión actual — usa /auth/logout',
      });
    }

    const ok = await this.sessions.revokeByExternalIdForUser(
      input.externalId,
      ctx.userId,
      'admin',
      this.clock.now(),
    );

    if (!ok) {
      throw new NotFoundException({
        error: 'NotFound',
        code: 'AUTH_SESSION_NOT_FOUND',
        message: 'Sesión no encontrada o ya revocada',
      });
    }
  }
}
