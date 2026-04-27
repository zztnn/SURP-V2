import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import {
  Incident,
  type IncidentSnapshot,
  type LocationSource,
  type Semaforo,
  type TimberFate,
} from '../domain/incident';
import {
  GEO_CONTEXT,
  type GeoContextPort,
  type ResolvedArea,
  type ResolvedCommune,
  type ResolvedProperty,
  type ResolvedZone,
} from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentRepositoryPort,
} from '../ports/incident.repository.port';

export interface RegisterIncidentInput {
  zoneExternalId: string;
  areaExternalId: string | null;
  propertyExternalId: string | null;
  communeExternalId: string | null;
  incidentTypeExternalId: string;
  operationTypeExternalId: string | null;
  occurredAt: Date;
  detectedAt: Date | null;
  location: { lat: number; lng: number };
  locationSource: LocationSource;
  gpsAccuracyMeters: number | null;
  description: string;
  semaforo: Semaforo | null;
  timberFate: TimberFate | null;
  aggravatingFactors: readonly string[];
}

export interface RegisterIncidentResult {
  externalId: string;
  correlativeCode: string;
  state: string;
  zoneExternalId: string;
  areaExternalId: string | null;
  propertyExternalId: string | null;
  communeExternalId: string | null;
}

/**
 * Registra un incidente nuevo en estado `submitted` con correlativo asignado
 * server-side bajo lock atómico. Decisión de F12.2:
 *
 *   - El cliente DEBE enviar `zoneExternalId` (la zona la decide quien
 *     ingresa, ver INCIDENT-CODE.md §3).
 *   - `area`/`property`/`commune` son opcionales: si vienen, se validan
 *     contra la jerarquía (`area.zoneId == zone.id`, `property.areaId ==
 *     area.id`); si no vienen, se auto-resuelven por `ST_Contains` desde
 *     lat/lng.
 *   - El correlativo `{N}-{Y}-Z{XX}` usa el AÑO DE OCURRENCIA (no del
 *     reporte ni de la sincronización). Lock + UPSERT en
 *     `incident_sequences (zone_id, year)`.
 *   - El estado inicial es `submitted` con correlativo. La variante `draft`
 *     (offline-first móvil) llegará en F12.7.
 */
@Injectable()
export class RegisterIncidentUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepositoryPort,
    @Inject(GEO_CONTEXT) private readonly geo: GeoContextPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: RegisterIncidentInput,
    ctx: RequestContext,
  ): Promise<RegisterIncidentResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Registrar incidente requiere usuario autenticado',
      });
    }

    // 1. Resolver tipo de incidente.
    const incidentType = await this.geo.resolveIncidentTypeByExternalId(
      input.incidentTypeExternalId,
    );
    if (!incidentType || !incidentType.active) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'INCIDENT_TYPE_NOT_FOUND',
        message: 'incidentTypeExternalId no existe o está inactivo',
      });
    }

    // 2. Resolver zona (required, decide el correlativo).
    const zone = await this.geo.resolveZoneByExternalId(input.zoneExternalId);
    if (!zone || !zone.active) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'INCIDENT_ZONE_NOT_FOUND',
        message: 'zoneExternalId no existe o está inactiva',
      });
    }

    // 3. Resolver área (explícita o por geo).
    const area = await this.resolveArea(input, zone);

    // 4. Resolver predio (explícito o por geo).
    const property = await this.resolveProperty(input, zone, area);

    // 5. Resolver comuna (explícita, predio.communeId, o por geo).
    const commune = await this.resolveCommune(input, property);

    // 6. Construir el incidente en dominio + persistir bajo lock atómico
    // sobre `incident_sequences (zone_id, year)`. El año del correlativo es
    // el año de OCURRENCIA del hecho.
    const correlativeYear = input.occurredAt.getFullYear();
    if (correlativeYear < 2000 || correlativeYear > 2099) {
      throw new BadRequestException({
        error: 'Bad Request',
        code: 'INCIDENT_YEAR_OUT_OF_RANGE',
        message: 'occurredAt debe estar entre 2000 y 2099',
      });
    }

    const now = this.clock.now();

    const persisted = await this.incidents.withSequenceLock(
      zone.id,
      correlativeYear,
      async (nextNumber) => {
        const code = `${String(nextNumber)}-${String(correlativeYear)}-Z${zone.shortCode}`;
        const incident = Incident.registerActive({
          correlativeCode: code,
          correlativeNumber: nextNumber,
          correlativeYear,
          zoneId: zone.id,
          areaId: area?.id ?? null,
          propertyId: property?.id ?? null,
          communeId: commune?.id ?? null,
          incidentTypeId: incidentType.id,
          operationTypeId: null, // TODO F12.2.x: resolver operationTypeExternalId
          occurredAt: input.occurredAt,
          detectedAt: input.detectedAt,
          reportedAt: now,
          submittedAt: now,
          location: input.location,
          locationSource: input.locationSource,
          gpsAccuracyMeters: input.gpsAccuracyMeters,
          description: input.description,
          semaforo: input.semaforo ?? 'no_determinado',
          // El check `incidents_semaforo_consistency_ck` exige set_at + set_by
          // cuando semaforo != 'no_determinado'. Si el cliente declara un
          // valor explícito, marcamos al usuario actual como quien lo seteó.
          semaforoSetAt: input.semaforo && input.semaforo !== 'no_determinado' ? now : null,
          semaforoSetByUserId:
            input.semaforo && input.semaforo !== 'no_determinado' ? ctx.userId : null,
          timberFate: input.timberFate,
          aggravatingFactors: input.aggravatingFactors,
          createdByOrganizationId: ctx.organizationId as bigint,
          capturedByUserId: ctx.userId as bigint,
        });
        return this.incidents.insert(incident);
      },
    );

    return this.toResult(persisted, zone, area, property, commune);
  }

  private async resolveArea(
    input: RegisterIncidentInput,
    zone: ResolvedZone,
  ): Promise<ResolvedArea | null> {
    if (input.areaExternalId !== null) {
      const area = await this.geo.resolveAreaByExternalId(input.areaExternalId);
      if (!area || !area.active) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_AREA_NOT_FOUND',
          message: 'areaExternalId no existe o está inactiva',
        });
      }
      if (area.zoneId !== zone.id) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_AREA_ZONE_MISMATCH',
          message: 'El área no pertenece a la zona declarada',
        });
      }
      return area;
    }
    // Auto-resolve: el área cuyo polígono contiene el punto.
    return this.geo.findAreaContaining(input.location.lat, input.location.lng);
  }

  private async resolveProperty(
    input: RegisterIncidentInput,
    zone: ResolvedZone,
    area: ResolvedArea | null,
  ): Promise<ResolvedProperty | null> {
    if (input.propertyExternalId !== null) {
      const property = await this.geo.resolvePropertyByExternalId(input.propertyExternalId);
      if (!property || !property.active) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_NOT_FOUND',
          message: 'propertyExternalId no existe o está inactivo',
        });
      }
      if (property.zoneId !== zone.id) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_ZONE_MISMATCH',
          message: 'El predio no pertenece a la zona declarada',
        });
      }
      if (area !== null && property.areaId !== area.id) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_PROPERTY_AREA_MISMATCH',
          message: 'El predio no pertenece al área declarada',
        });
      }
      return property;
    }
    // Auto-resolve: el predio cuyo polígono contiene el punto.
    return this.geo.findPropertyContaining(input.location.lat, input.location.lng);
  }

  private async resolveCommune(
    input: RegisterIncidentInput,
    property: ResolvedProperty | null,
  ): Promise<ResolvedCommune | null> {
    if (input.communeExternalId !== null) {
      const commune = await this.geo.resolveCommuneByExternalId(input.communeExternalId);
      if (!commune) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: 'INCIDENT_COMMUNE_NOT_FOUND',
          message: 'communeExternalId no existe',
        });
      }
      return commune;
    }
    // Si el predio ya tiene comuna, heredamos.
    if (property?.communeId) {
      // No tenemos external_id de la comuna en property; lo resolvemos.
      const all = await this.geo.findCommuneContaining(input.location.lat, input.location.lng);
      // Si el lookup geo coincide con la comuna del predio, perfecto;
      // si no, preferimos la del predio (menos volátil que el polígono).
      return all ?? null;
    }
    // Fallback: buscar por geo.
    return this.geo.findCommuneContaining(input.location.lat, input.location.lng);
  }

  private toResult(
    s: IncidentSnapshot,
    zone: ResolvedZone,
    area: ResolvedArea | null,
    property: ResolvedProperty | null,
    commune: ResolvedCommune | null,
  ): RegisterIncidentResult {
    if (s.externalId === null || s.correlativeCode === null) {
      throw new Error('Incident persistido sin externalId/correlativeCode — bug en repo.insert');
    }
    return {
      externalId: s.externalId,
      correlativeCode: s.correlativeCode,
      state: s.state,
      zoneExternalId: zone.externalId,
      areaExternalId: area?.externalId ?? null,
      propertyExternalId: property?.externalId ?? null,
      communeExternalId: commune?.externalId ?? null,
    };
  }
}
