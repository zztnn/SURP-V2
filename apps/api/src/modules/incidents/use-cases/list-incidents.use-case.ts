import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { type RequestContext } from '../../../common';
import type { IncidentState, Semaforo } from '../domain/incident';
import { GEO_CONTEXT, type GeoContextPort } from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentListItem,
  type IncidentRepositoryPort,
} from '../ports/incident.repository.port';

const MAX_PAGE_SIZE = 100;

export interface ListIncidentsInput {
  page: number;
  pageSize: number;
  state: IncidentState | null;
  zoneExternalId: string | null;
  semaforo: Semaforo | null;
  occurredFrom: Date | null;
  occurredTo: Date | null;
  incidentTypeExternalId: string | null;
}

export interface ListIncidentsResult {
  items: readonly IncidentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista incidentes con filtros y paginación. Visibilidad por organización
 * (decisión 5 de F12.3, fusiona con la sub-fase F12.5):
 *
 *   - `principal`        → ve todo.
 *   - `security_provider` → solo zonas con asignación vigente
 *     (`organization_zone_assignments.valid_to IS NULL`).
 *   - `api_consumer`     → 403 (no debería tener `incidents.incidents.read`,
 *     pero defendemos en uso).
 */
@Injectable()
export class ListIncidentsUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepositoryPort,
    @Inject(GEO_CONTEXT) private readonly geo: GeoContextPort,
  ) {}

  async execute(input: ListIncidentsInput, ctx: RequestContext): Promise<ListIncidentsResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Listar incidentes requiere usuario autenticado',
      });
    }
    if (ctx.organizationType === 'api_consumer') {
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'INCIDENTS_FORBIDDEN_FOR_API_CONSUMER',
        message: 'api_consumer no tiene visibilidad sobre incidentes',
      });
    }

    if (input.page < 1) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'INVALID_PAGE',
        message: 'page debe ser >= 1',
      });
    }
    if (input.pageSize < 1 || input.pageSize > MAX_PAGE_SIZE) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'INVALID_PAGE_SIZE',
        message: `pageSize debe estar entre 1 y ${String(MAX_PAGE_SIZE)}`,
      });
    }

    let zoneId: bigint | null = null;
    if (input.zoneExternalId !== null) {
      const zone = await this.geo.resolveZoneByExternalId(input.zoneExternalId);
      if (!zone) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_ZONE_NOT_FOUND',
          message: 'zoneExternalId no existe',
        });
      }
      zoneId = zone.id;
    }

    let incidentTypeId: bigint | null = null;
    if (input.incidentTypeExternalId !== null) {
      const it = await this.geo.resolveIncidentTypeByExternalId(input.incidentTypeExternalId);
      if (!it) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_TYPE_NOT_FOUND',
          message: 'incidentTypeExternalId no existe',
        });
      }
      incidentTypeId = it.id;
    }

    const visibleZoneIds = await this.resolveVisibleZones(ctx);

    const page = await this.incidents.list({
      page: input.page,
      pageSize: input.pageSize,
      visibleZoneIds,
      state: input.state,
      zoneId,
      semaforo: input.semaforo,
      occurredFrom: input.occurredFrom,
      occurredTo: input.occurredTo,
      incidentTypeId,
    });

    return {
      items: page.items,
      total: page.total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /**
   * NULL = sin filtro (caso `principal`).
   * Array vacío = bloquea todo (caso `security_provider` sin asignaciones
   * vigentes — improbable en prod pero defendemos).
   */
  private async resolveVisibleZones(ctx: RequestContext): Promise<readonly bigint[] | null> {
    if (ctx.organizationType === 'principal') {
      return null;
    }
    if (ctx.organizationType === 'security_provider' && ctx.organizationId !== null) {
      return this.geo.findVisibleZoneIdsForOrganization(ctx.organizationId);
    }
    // Tipo desconocido o sin org: bloquea por defecto.
    return [];
  }
}
