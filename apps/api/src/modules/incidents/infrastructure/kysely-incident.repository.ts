import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';

import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import {
  Incident,
  type IncidentSnapshot,
  type IncidentState,
  type Semaforo,
} from '../domain/incident';
import type {
  IncidentDetail,
  IncidentRepositoryPort,
  ListIncidentsPage,
  ListIncidentsQuery,
} from '../ports/incident.repository.port';

const DESCRIPTION_EXCERPT_CHARS = 200;

@Injectable()
export class KyselyIncidentRepository implements IncidentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async withSequenceLock<T>(
    zoneId: bigint,
    year: number,
    fn: (nextNumber: number) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction().execute(async (tx) => {
      // UPSERT atómico: si no existe la fila (zone+year) la inserta con
      // last_number=1; si ya existe, hace last_number = last_number + 1.
      // El `RETURNING last_number` siempre devuelve el número final, así
      // dos requests concurrentes para la misma (zone, year) reciben
      // valores consecutivos sin colisión.
      const row = await tx
        .insertInto('incidentSequences')
        .values({ zoneId: zoneId.toString(), year, lastNumber: 1 })
        .onConflict((oc) =>
          oc
            .columns(['zoneId', 'year'])
            .doUpdateSet({ lastNumber: sql`incident_sequences.last_number + 1` }),
        )
        .returning('lastNumber')
        .executeTakeFirstOrThrow();

      const result = await fn(row.lastNumber);

      // Si fn lanza, la transacción rollbackea y el UPSERT se deshace.
      // Si fn retorna OK, el commit confirma tanto el contador como el
      // INSERT del incidente que fn haya hecho.
      return result;
    });
  }

  async insert(incident: Incident): Promise<IncidentSnapshot> {
    return this.insertWith(this.db, incident);
  }

  /**
   * Variante interna que acepta una transacción opcional. Útil cuando el
   * use case quiere meter el INSERT del incidente DENTRO del lock.
   * (En la implementación actual, `withSequenceLock` ya abre la transacción
   * y `insert` se llama en su scope — el `db` global no es la misma tx;
   * volvemos a usar `tx` cuando lo pasen explícito en futuras evoluciones.)
   */
  private async insertWith(
    db: Kysely<DB> | Transaction<DB>,
    incident: Incident,
  ): Promise<IncidentSnapshot> {
    const s = incident.toSnapshot();
    const lat = s.location.lat;
    const lng = s.location.lng;
    const row = await db
      .insertInto('incidents')
      .values({
        correlativeCode: s.correlativeCode,
        correlativeNumber: s.correlativeNumber,
        correlativeYear: s.correlativeYear,
        zoneId: s.zoneId.toString(),
        areaId: s.areaId !== null ? s.areaId.toString() : null,
        propertyId: s.propertyId !== null ? s.propertyId.toString() : null,
        communeId: s.communeId !== null ? s.communeId.toString() : null,
        incidentTypeId: s.incidentTypeId.toString(),
        operationTypeId: s.operationTypeId !== null ? s.operationTypeId.toString() : null,
        occurredAt: s.occurredAt,
        detectedAt: s.detectedAt,
        reportedAt: s.reportedAt,
        submittedAt: s.submittedAt,
        // PostGIS: ST_SetSRID(ST_MakePoint(lng, lat), 4326). Kysely no
        // tipa columnas de geometry — usamos plantilla `sql` y casteamos
        // al tipo del schema.
        location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)` as never,
        locationSource: s.locationSource,
        gpsAccuracyMeters: s.gpsAccuracyMeters !== null ? s.gpsAccuracyMeters.toString() : null,
        description: s.description,
        semaforo: s.semaforo,
        semaforoSetAt: s.semaforoSetAt,
        semaforoSetByUserId:
          s.semaforoSetByUserId !== null ? s.semaforoSetByUserId.toString() : null,
        state: s.state,
        timberFate: s.timberFate,
        aggravatingFactors: JSON.stringify(s.aggravatingFactors),
        createdByOrganizationId: s.createdByOrganizationId.toString(),
        capturedByUserId: s.capturedByUserId.toString(),
        // Si state ≠ draft, el constraint `incidents_submitted_has_correlative_ck`
        // exige correlative_*. Domain ya garantiza esa consistencia.
      })
      .returning([
        'id',
        'externalId',
        'correlativeCode',
        'correlativeNumber',
        'correlativeYear',
        'state',
        'submittedAt',
        'reportedAt',
      ])
      .executeTakeFirstOrThrow();

    return {
      ...s,
      id: BigInt(row.id),
      externalId: row.externalId,
      correlativeCode: row.correlativeCode,
      correlativeNumber: row.correlativeNumber,
      correlativeYear: row.correlativeYear,
      state: row.state as IncidentState,
      submittedAt: row.submittedAt,
      reportedAt: row.reportedAt,
      // Re-tipo defensivo de los campos que vienen del schema:
      locationSource: s.locationSource,
      semaforo: s.semaforo,
      timberFate: s.timberFate,
    };
  }

  async list(query: ListIncidentsQuery): Promise<ListIncidentsPage> {
    let q = this.db
      .selectFrom('incidents as i')
      .innerJoin('zones as z', 'z.id', 'i.zoneId')
      .innerJoin('incidentTypes as it', 'it.id', 'i.incidentTypeId')
      .innerJoin('users as u', 'u.id', 'i.capturedByUserId')
      .leftJoin('areas as a', 'a.id', 'i.areaId')
      .leftJoin('properties as p', 'p.id', 'i.propertyId')
      .leftJoin('communes as c', 'c.id', 'i.communeId')
      .where('i.deletedAt', 'is', null);

    if (query.visibleZoneIds !== null) {
      if (query.visibleZoneIds.length === 0) {
        return { items: [], total: 0 };
      }
      q = q.where(
        'i.zoneId',
        'in',
        query.visibleZoneIds.map((id) => id.toString()),
      );
    }
    if (query.zoneId !== null) q = q.where('i.zoneId', '=', query.zoneId.toString());
    if (query.areaId !== null) q = q.where('i.areaId', '=', query.areaId.toString());
    if (query.propertyId !== null) {
      q = q.where('i.propertyId', '=', query.propertyId.toString());
    }
    if (query.semaforo !== null) q = q.where('i.semaforo', '=', query.semaforo);
    if (query.occurredFrom !== null) q = q.where('i.occurredAt', '>=', query.occurredFrom);
    if (query.occurredTo !== null) q = q.where('i.occurredAt', '<=', query.occurredTo);
    if (query.incidentTypeIds !== null && query.incidentTypeIds.length > 0) {
      q = q.where(
        'i.incidentTypeId',
        'in',
        query.incidentTypeIds.map((id) => id.toString()),
      );
    }
    // Patrón ILIKE compartido entre el WHERE del free-text y el ORDER BY
    // que prioriza matches de folio (`correlative_code`) sobre matches en
    // descripción / zona / área / predio.
    const freeTextPattern =
      query.freeTextSearch !== null ? toLikePattern(query.freeTextSearch) : null;
    if (freeTextPattern !== null) {
      // Match en correlativo, descripción y nombres de zona/área/predio.
      // Usa ILIKE simple — los índices `gin_trgm_ops` que tenemos en
      // legacy y nuevo cubren los names; description es libre.
      q = q.where((eb) =>
        eb.or([
          eb('i.correlativeCode', 'ilike', freeTextPattern),
          eb('i.description', 'ilike', freeTextPattern),
          eb('z.name', 'ilike', freeTextPattern),
          eb('a.name', 'ilike', freeTextPattern),
          eb('p.name', 'ilike', freeTextPattern),
        ]),
      );
    }
    if (query.personSearch !== null) {
      // EXISTS sobre incident_party_links + parties + natural_persons.
      // Escapado de wildcards: ver `toLikePattern`.
      const pat = toLikePattern(query.personSearch);
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('incidentPartyLinks as ipl')
            .innerJoin('parties as pa', 'pa.id', 'ipl.partyId')
            .leftJoin('naturalPersons as np', 'np.partyId', 'pa.id')
            .leftJoin('legalEntities as le', 'le.partyId', 'pa.id')
            .select(eb.lit(1).as('one'))
            .whereRef('ipl.incidentId', '=', 'i.id')
            .where('ipl.deletedAt', 'is', null)
            .where('pa.deletedAt', 'is', null)
            .where((eb2) =>
              eb2.or([
                eb2('pa.rut', 'ilike', pat),
                eb2('pa.displayName', 'ilike', pat),
                eb2('pa.foreignDocumentNumber', 'ilike', pat),
                eb2('np.givenNames', 'ilike', pat),
                eb2('np.paternalSurname', 'ilike', pat),
                eb2('np.maternalSurname', 'ilike', pat),
                eb2('le.legalName', 'ilike', pat),
                eb2('le.tradeName', 'ilike', pat),
              ]),
            ),
        ),
      );
    }
    if (query.vehicleSearch !== null) {
      const pat = toLikePattern(query.vehicleSearch);
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('incidentVehicleLinks as ivl')
            .innerJoin('vehicles as v', 'v.id', 'ivl.vehicleId')
            .select(eb.lit(1).as('one'))
            .whereRef('ivl.incidentId', '=', 'i.id')
            .where('ivl.deletedAt', 'is', null)
            .where('v.deletedAt', 'is', null)
            .where((eb2) =>
              eb2.or([eb2('v.licensePlate', 'ilike', pat), eb2('ivl.observedPlate', 'ilike', pat)]),
            ),
        ),
      );
    }

    const totalRow = await q.select((eb) => eb.fn.countAll<string>().as('cnt')).executeTakeFirst();
    const total = totalRow ? Number(totalRow.cnt) : 0;

    let rowsQuery = q.select([
      'i.externalId as externalId',
      'i.correlativeCode as correlativeCode',
      'i.occurredAt as occurredAt',
      'i.state as state',
      'i.semaforo as semaforo',
      'i.description as description',
      sql<number>`ST_X(i.location)`.as('lng'),
      sql<number>`ST_Y(i.location)`.as('lat'),
      'it.code as itCode',
      'it.name as itName',
      'z.shortCode as zoneShortCode',
      'z.name as zoneName',
      'a.name as areaName',
      'p.name as propertyName',
      'c.name as communeName',
      'u.displayName as userDisplayName',
    ]);

    // Cuando hay búsqueda libre, los matches en `correlative_code` (folio)
    // tienen prioridad sobre los matches en descripción/zona/área/predio.
    // El `CASE` produce 0 para folio-match y 1 para el resto; el ORDER BY
    // ascendente los pone primero. Después se mantiene el orden por fecha.
    if (freeTextPattern !== null) {
      rowsQuery = rowsQuery.orderBy(
        sql<number>`CASE WHEN i.correlative_code ILIKE ${freeTextPattern} THEN 0 ELSE 1 END`,
        'asc',
      );
    }

    const rows = await rowsQuery
      .orderBy('i.occurredAt', 'desc')
      .orderBy('i.id', 'desc')
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        externalId: r.externalId,
        correlativeCode: r.correlativeCode,
        occurredAt: new Date(r.occurredAt),
        state: r.state as IncidentState,
        semaforo: r.semaforo as Semaforo,
        incidentTypeCode: r.itCode,
        incidentTypeName: r.itName,
        zoneShortCode: r.zoneShortCode,
        zoneName: r.zoneName,
        areaName: r.areaName,
        propertyName: r.propertyName,
        communeName: r.communeName,
        capturedByUserDisplayName: r.userDisplayName,
        descriptionExcerpt: excerpt(r.description, DESCRIPTION_EXCERPT_CHARS),
        location: { lat: r.lat, lng: r.lng },
      })),
      total,
    };
  }

  async findByExternalId(
    externalId: string,
    visibleZoneIds: readonly bigint[] | null,
  ): Promise<IncidentDetail | null> {
    let q = this.db
      .selectFrom('incidents as i')
      .innerJoin('zones as z', 'z.id', 'i.zoneId')
      .innerJoin('incidentTypes as it', 'it.id', 'i.incidentTypeId')
      .innerJoin('users as u', 'u.id', 'i.capturedByUserId')
      .innerJoin('organizations as o', 'o.id', 'i.createdByOrganizationId')
      .leftJoin('areas as a', 'a.id', 'i.areaId')
      .leftJoin('properties as p', 'p.id', 'i.propertyId')
      .leftJoin('communes as c', 'c.id', 'i.communeId')
      .where('i.externalId', '=', externalId)
      .where('i.deletedAt', 'is', null);

    if (visibleZoneIds !== null) {
      if (visibleZoneIds.length === 0) {
        return null;
      }
      q = q.where(
        'i.zoneId',
        'in',
        visibleZoneIds.map((id) => id.toString()),
      );
    }

    const row = await q
      .select([
        'i.externalId as externalId',
        'i.correlativeCode as correlativeCode',
        'i.state as state',
        'i.semaforo as semaforo',
        'i.occurredAt as occurredAt',
        'i.detectedAt as detectedAt',
        'i.reportedAt as reportedAt',
        'i.submittedAt as submittedAt',
        'i.description as description',
        'i.locationSource as locationSource',
        'i.gpsAccuracyMeters as gpsAccuracyMeters',
        'i.aggravatingFactors as aggravatingFactors',
        'i.timberFate as timberFate',
        sql<number>`ST_X(i.location)`.as('lng'),
        sql<number>`ST_Y(i.location)`.as('lat'),
        'z.externalId as zoneExternalId',
        'z.shortCode as zoneShortCode',
        'z.name as zoneName',
        'a.externalId as areaExternalId',
        'a.name as areaName',
        'p.externalId as propertyExternalId',
        'p.name as propertyName',
        'c.externalId as communeExternalId',
        'c.name as communeName',
        'it.externalId as itExternalId',
        'it.code as itCode',
        'it.name as itName',
        'u.externalId as userExternalId',
        'u.displayName as userDisplayName',
        'o.externalId as orgExternalId',
        'o.name as orgName',
        'o.type as orgType',
      ])
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      externalId: row.externalId,
      correlativeCode: row.correlativeCode,
      state: row.state as IncidentState,
      semaforo: row.semaforo as Semaforo,
      occurredAt: new Date(row.occurredAt),
      detectedAt: row.detectedAt !== null ? new Date(row.detectedAt) : null,
      reportedAt: new Date(row.reportedAt),
      submittedAt: row.submittedAt !== null ? new Date(row.submittedAt) : null,
      description: row.description,
      location: { lat: row.lat, lng: row.lng },
      locationSource: row.locationSource,
      gpsAccuracyMeters: row.gpsAccuracyMeters !== null ? Number(row.gpsAccuracyMeters) : null,
      aggravatingFactors: parseAggravatingFactors(row.aggravatingFactors),
      timberFate: row.timberFate,
      zone: {
        externalId: row.zoneExternalId,
        shortCode: row.zoneShortCode,
        name: row.zoneName,
      },
      area:
        row.areaExternalId !== null && row.areaName !== null
          ? { externalId: row.areaExternalId, name: row.areaName }
          : null,
      property:
        row.propertyExternalId !== null && row.propertyName !== null
          ? { externalId: row.propertyExternalId, name: row.propertyName }
          : null,
      commune:
        row.communeExternalId !== null && row.communeName !== null
          ? { externalId: row.communeExternalId, name: row.communeName }
          : null,
      incidentType: { externalId: row.itExternalId, code: row.itCode, name: row.itName },
      capturedByUser: { externalId: row.userExternalId, displayName: row.userDisplayName },
      createdByOrganization: {
        externalId: row.orgExternalId,
        name: row.orgName,
        type: row.orgType as 'principal' | 'security_provider' | 'api_consumer',
      },
    };
  }

  async findStateByExternalId(
    externalId: string,
    visibleZoneIds: readonly bigint[] | null,
  ): Promise<{ id: bigint; state: IncidentState; zoneId: bigint } | null> {
    let q = this.db
      .selectFrom('incidents')
      .select(['id', 'state', 'zoneId'])
      .where('externalId', '=', externalId)
      .where('deletedAt', 'is', null);
    if (visibleZoneIds !== null) {
      if (visibleZoneIds.length === 0) return null;
      q = q.where(
        'zoneId',
        'in',
        visibleZoneIds.map((id) => id.toString()),
      );
    }
    const row = await q.executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      state: row.state as IncidentState,
      zoneId: BigInt(row.zoneId),
    };
  }

  async markVoided(
    incidentId: bigint,
    fromStates: readonly IncidentState[],
    voidReason: string,
    at: Date,
    voidedByUserId: bigint,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('incidents')
      .set({
        state: 'voided',
        stateChangedAt: at,
        voidedAt: at,
        voidedByUserId: voidedByUserId.toString(),
        voidReason,
        updatedAt: at,
        updatedById: voidedByUserId.toString(),
      })
      .where('id', '=', incidentId.toString())
      .where('state', 'in', fromStates as IncidentState[])
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}

function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Construye un patrón ILIKE escapando los wildcards `%` y `_` que el
 * usuario haya escrito (o que vengan de un input pegado), para que
 * actúen como literales y no como comodines.
 */
function toLikePattern(raw: string): string {
  const escaped = raw.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

function parseAggravatingFactors(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}
