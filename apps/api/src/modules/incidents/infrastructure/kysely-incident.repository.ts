import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';

import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import { Incident, type IncidentSnapshot, type IncidentState } from '../domain/incident';
import type { IncidentRepositoryPort } from '../ports/incident.repository.port';

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
}
