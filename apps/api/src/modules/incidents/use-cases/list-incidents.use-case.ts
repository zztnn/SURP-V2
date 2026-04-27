import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { type RequestContext } from '../../../common';
import type { Semaforo } from '../domain/incident';
import { GEO_CONTEXT, type GeoContextPort } from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentListItem,
  type IncidentRepositoryPort,
} from '../ports/incident.repository.port';

const MAX_PAGE_SIZE = 100;
const MIN_TEXT_SEARCH_CHARS = 2;
const MAX_TEXT_SEARCH_CHARS = 100;

export interface ListIncidentsInput {
  page: number;
  pageSize: number;
  zoneExternalId: string | null;
  areaExternalId: string | null;
  propertyExternalId: string | null;
  semaforo: Semaforo | null;
  occurredFrom: Date | null;
  occurredTo: Date | null;
  // Multi-select: el usuario puede filtrar por varios tipos a la vez
  // (espejo del legacy `select multiple` de "Delito").
  incidentTypeExternalIds: readonly string[];
  freeTextSearch: string | null;
  personSearch: string | null;
  vehicleSearch: string | null;
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

    if (input.occurredFrom !== null && input.occurredTo !== null) {
      if (input.occurredFrom.getTime() > input.occurredTo.getTime()) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INVALID_DATE_RANGE',
          message: 'occurredFrom no puede ser posterior a occurredTo',
        });
      }
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

    let areaId: bigint | null = null;
    if (input.areaExternalId !== null) {
      const area = await this.geo.resolveAreaByExternalId(input.areaExternalId);
      if (!area) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_AREA_NOT_FOUND',
          message: 'areaExternalId no existe',
        });
      }
      // Si Zona también vino, exigimos coherencia jerárquica.
      if (zoneId !== null && area.zoneId !== zoneId) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_AREA_NOT_IN_ZONE',
          message: 'areaExternalId no pertenece a zoneExternalId',
        });
      }
      areaId = area.id;
    }

    let propertyId: bigint | null = null;
    if (input.propertyExternalId !== null) {
      const prop = await this.geo.resolvePropertyByExternalId(input.propertyExternalId);
      if (!prop) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_NOT_FOUND',
          message: 'propertyExternalId no existe',
        });
      }
      if (zoneId !== null && prop.zoneId !== zoneId) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_NOT_IN_ZONE',
          message: 'propertyExternalId no pertenece a zoneExternalId',
        });
      }
      if (areaId !== null && prop.areaId !== areaId) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_NOT_IN_AREA',
          message: 'propertyExternalId no pertenece a areaExternalId',
        });
      }
      propertyId = prop.id;
    }

    let incidentTypeIds: readonly bigint[] | null = null;
    if (input.incidentTypeExternalIds.length > 0) {
      const resolved = await Promise.all(
        input.incidentTypeExternalIds.map(async (eid) => {
          const r = await this.geo.resolveIncidentTypeByExternalId(eid);
          if (!r) {
            throw new UnprocessableEntityException({
              error: 'Unprocessable Entity',
              code: 'INCIDENT_TYPE_NOT_FOUND',
              message: `incidentTypeExternalId "${eid}" no existe`,
            });
          }
          return r.id;
        }),
      );
      incidentTypeIds = resolved;
    }

    const freeTextSearch = sanitizeSearch(input.freeTextSearch);
    const personSearch = sanitizeSearch(input.personSearch);
    const vehicleSearch = sanitizeSearch(input.vehicleSearch);

    const visibleZoneIds = await this.resolveVisibleZones(ctx);

    const page = await this.incidents.list({
      page: input.page,
      pageSize: input.pageSize,
      visibleZoneIds,
      zoneId,
      areaId,
      propertyId,
      semaforo: input.semaforo,
      occurredFrom: input.occurredFrom,
      occurredTo: input.occurredTo,
      incidentTypeIds,
      freeTextSearch,
      personSearch,
      vehicleSearch,
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

/**
 * Recorta y valida un input de búsqueda. Reglas:
 *   - trim siempre
 *   - vacío → NULL (sin filtro)
 *   - menor a `MIN_TEXT_SEARCH_CHARS` → NULL (evita degradar la query con
 *     `%a%` que escanea media tabla)
 *   - mayor a `MAX_TEXT_SEARCH_CHARS` → trunca al máximo
 */
function sanitizeSearch(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length < MIN_TEXT_SEARCH_CHARS) return null;
  return trimmed.slice(0, MAX_TEXT_SEARCH_CHARS);
}
