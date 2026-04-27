import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import type { IncidentState } from '../domain/incident';
import { GEO_CONTEXT, type GeoContextPort } from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentDetail,
  type IncidentRepositoryPort,
} from '../ports/incident.repository.port';

const CLOSABLE_FROM: readonly IncidentState[] = ['submitted', 'under_review'];

export interface CloseIncidentInput {
  externalId: string;
}

export type CloseIncidentResult = IncidentDetail;

/**
 * Cierra un incidente en estado `submitted` o `under_review` →
 * `closed`. La transición es atómica con check `state IN
 * CLOSABLE_FROM` (concurrencia segura). Aplica el guard de
 * visibilidad por organización: si está fuera de las zonas asignadas,
 * 404 uniforme.
 *
 * Reglas:
 *   - 404 si no existe o está fuera de zonas visibles.
 *   - 409 con código `INCIDENT_NOT_CLOSABLE_FROM_STATE` si el state
 *     actual no permite el cierre (ej. ya `closed`, `voided`, `draft`).
 */
@Injectable()
export class CloseIncidentUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepositoryPort,
    @Inject(GEO_CONTEXT) private readonly geo: GeoContextPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: CloseIncidentInput, ctx: RequestContext): Promise<CloseIncidentResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Cerrar incidente requiere usuario autenticado',
      });
    }
    if (ctx.organizationType === 'api_consumer') {
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'INCIDENTS_FORBIDDEN_FOR_API_CONSUMER',
        message: 'api_consumer no puede mutar incidentes',
      });
    }

    const visibleZoneIds = await this.resolveVisibleZones(ctx);
    const state = await this.incidents.findStateByExternalId(input.externalId, visibleZoneIds);
    if (!state) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incidente no encontrado',
      });
    }

    if (!CLOSABLE_FROM.includes(state.state)) {
      throw new ConflictException({
        error: 'Conflict',
        code: 'INCIDENT_NOT_CLOSABLE_FROM_STATE',
        message: `No se puede cerrar un incidente en estado ${state.state} (válido: ${CLOSABLE_FROM.join(', ')})`,
      });
    }

    const ok = await this.incidents.markClosed(
      state.id,
      CLOSABLE_FROM,
      this.clock.now(),
      ctx.userId,
    );
    if (!ok) {
      // Race condition: el state cambió entre el find y el update.
      throw new ConflictException({
        error: 'Conflict',
        code: 'INCIDENT_STATE_CHANGED',
        message: 'El estado del incidente cambió mientras se procesaba la solicitud',
      });
    }

    const detail = await this.incidents.findByExternalId(input.externalId, visibleZoneIds);
    if (!detail) {
      // Imposible si markClosed retornó OK, pero defensa contra borrado concurrente.
      throw new NotFoundException({
        error: 'Not Found',
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incidente no encontrado tras cerrar',
      });
    }
    return detail;
  }

  private async resolveVisibleZones(ctx: RequestContext): Promise<readonly bigint[] | null> {
    if (ctx.organizationType === 'principal') return null;
    if (ctx.organizationType === 'security_provider' && ctx.organizationId !== null) {
      return this.geo.findVisibleZoneIdsForOrganization(ctx.organizationId);
    }
    return [];
  }
}
