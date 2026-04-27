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

const VOIDABLE_FROM: readonly IncidentState[] = [
  'submitted',
  'under_review',
  'closed',
  'escalated',
];

export interface VoidIncidentInput {
  externalId: string;
  voidReason: string;
}

export type VoidIncidentResult = IncidentDetail;

/**
 * Anula un incidente. NO libera el correlativo (invariante del schema:
 * `incidents_no_hard_delete_post_submit` + `incidents_void_consistency_ck`
 * garantizan integridad). El correlativo queda ocupado por el incidente
 * `voided` con su razón documentada.
 *
 * Estados origen válidos: `submitted | under_review | closed | escalated`.
 * NO se puede anular un `draft` (use hard-delete) ni un `voided` (ya lo
 * está).
 */
@Injectable()
export class VoidIncidentUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepositoryPort,
    @Inject(GEO_CONTEXT) private readonly geo: GeoContextPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: VoidIncidentInput, ctx: RequestContext): Promise<VoidIncidentResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Anular incidente requiere usuario autenticado',
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

    if (!VOIDABLE_FROM.includes(state.state)) {
      throw new ConflictException({
        error: 'Conflict',
        code: 'INCIDENT_NOT_VOIDABLE_FROM_STATE',
        message: `No se puede anular un incidente en estado ${state.state} (válido: ${VOIDABLE_FROM.join(', ')})`,
      });
    }

    const ok = await this.incidents.markVoided(
      state.id,
      VOIDABLE_FROM,
      input.voidReason,
      this.clock.now(),
      ctx.userId,
    );
    if (!ok) {
      throw new ConflictException({
        error: 'Conflict',
        code: 'INCIDENT_STATE_CHANGED',
        message: 'El estado del incidente cambió mientras se procesaba la solicitud',
      });
    }

    const detail = await this.incidents.findByExternalId(input.externalId, visibleZoneIds);
    if (!detail) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incidente no encontrado tras anular',
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
