import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { type RequestContext } from '../../../common';
import { GEO_CONTEXT, type GeoContextPort } from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentDetail,
  type IncidentRepositoryPort,
} from '../ports/incident.repository.port';

export interface GetIncidentByExternalIdInput {
  externalId: string;
}

export type GetIncidentByExternalIdResult = IncidentDetail;

/**
 * Detalle del incidente. Aplica el mismo guard de visibilidad que
 * `ListIncidentsUseCase`: si el incidente está fuera de las zonas
 * asignadas al `security_provider`, responde **404 uniforme** (no
 * 403) para no filtrar la existencia.
 */
@Injectable()
export class GetIncidentByExternalIdUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepositoryPort,
    @Inject(GEO_CONTEXT) private readonly geo: GeoContextPort,
  ) {}

  async execute(
    input: GetIncidentByExternalIdInput,
    ctx: RequestContext,
  ): Promise<GetIncidentByExternalIdResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Ver incidente requiere usuario autenticado',
      });
    }
    if (ctx.organizationType === 'api_consumer') {
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'INCIDENTS_FORBIDDEN_FOR_API_CONSUMER',
        message: 'api_consumer no tiene visibilidad sobre incidentes',
      });
    }

    const visibleZoneIds = await this.resolveVisibleZones(ctx);
    const detail = await this.incidents.findByExternalId(input.externalId, visibleZoneIds);
    if (!detail) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incidente no encontrado',
      });
    }
    return detail;
  }

  private async resolveVisibleZones(ctx: RequestContext): Promise<readonly bigint[] | null> {
    if (ctx.organizationType === 'principal') {
      return null;
    }
    if (ctx.organizationType === 'security_provider' && ctx.organizationId !== null) {
      return this.geo.findVisibleZoneIdsForOrganization(ctx.organizationId);
    }
    return [];
  }
}
