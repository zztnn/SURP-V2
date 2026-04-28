import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';

import { DATABASE } from '../../../../database/database.token';
import type { DB } from '../../../../database/generated/database.types';
import type { ExportFormat } from '../domain/export-job';
import type { IncidentExportRow } from '../incidents-excel.generator';
import type {
  IncidentExportDataPort,
  IncidentExportDataQuery,
} from '../ports/incident-export-data.port';

/**
 * Adapter que hace UNA query con joins al modelo de incidents para
 * producir filas listas para el generator de Excel. Filtros V1: zona,
 * área, predio, semáforo, rango de fechas, tipos. (Búsquedas libres
 * deferidas a V2.)
 */
@Injectable()
export class KyselyIncidentExportData implements IncidentExportDataPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async findManyForExport(query: IncidentExportDataQuery): Promise<readonly IncidentExportRow[]> {
    if (query.visibleZoneIds !== null && query.visibleZoneIds.length === 0) {
      return [];
    }

    let q = this.db
      .selectFrom('incidents as i')
      .innerJoin('zones as z', 'z.id', 'i.zoneId')
      .innerJoin('incidentTypes as it', 'it.id', 'i.incidentTypeId')
      .innerJoin('users as u', 'u.id', 'i.capturedByUserId')
      .innerJoin('organizations as o', 'o.id', 'i.createdByOrganizationId')
      .leftJoin('areas as a', 'a.id', 'i.areaId')
      .leftJoin('properties as p', 'p.id', 'i.propertyId')
      .leftJoin('communes as c', 'c.id', 'i.communeId')
      .where('i.deletedAt', 'is', null);

    if (query.visibleZoneIds !== null) {
      q = q.where(
        'i.zoneId',
        'in',
        query.visibleZoneIds.map((id) => id.toString()),
      );
    }
    if (query.zoneExternalId !== null) q = q.where('z.externalId', '=', query.zoneExternalId);
    if (query.areaExternalId !== null) q = q.where('a.externalId', '=', query.areaExternalId);
    if (query.propertyExternalId !== null) {
      q = q.where('p.externalId', '=', query.propertyExternalId);
    }
    if (query.semaforo !== null) q = q.where('i.semaforo', '=', query.semaforo);
    if (query.occurredFrom !== null) q = q.where('i.occurredAt', '>=', query.occurredFrom);
    if (query.occurredTo !== null) q = q.where('i.occurredAt', '<=', query.occurredTo);
    if (query.incidentTypeExternalIds !== null && query.incidentTypeExternalIds.length > 0) {
      q = q.where('it.externalId', 'in', query.incidentTypeExternalIds);
    }

    const rows = await q
      .select([
        'i.correlativeCode as correlativeCode',
        'i.occurredAt as occurredAt',
        'i.state as state',
        'i.semaforo as semaforo',
        'i.description as description',
        'i.locationSource as locationSource',
        'i.aggravatingFactors as aggravatingFactors',
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
        'o.name as organizationName',
      ])
      .orderBy('i.occurredAt', 'desc')
      .orderBy('i.id', 'desc')
      .execute();

    return rows.map((r) => ({
      correlativeCode: r.correlativeCode,
      occurredAt: new Date(r.occurredAt),
      state: r.state as IncidentExportRow['state'],
      semaforo: r.semaforo as IncidentExportRow['semaforo'],
      incidentTypeCode: r.itCode,
      incidentTypeName: r.itName,
      zoneShortCode: r.zoneShortCode,
      zoneName: r.zoneName,
      areaName: r.areaName,
      propertyName: r.propertyName,
      communeName: r.communeName,
      lat: r.lat,
      lng: r.lng,
      locationSource: r.locationSource,
      capturedByUserDisplayName: r.userDisplayName,
      organizationName: r.organizationName,
      description: r.description,
      aggravatingFactors: parseAggravatingFactors(r.aggravatingFactors),
    }));
  }
}

/**
 * `aggravating_factors` es JSONB que viene como `unknown` del adapter.
 * Validamos que sea array de strings; cualquier otra forma se descarta.
 */
function parseAggravatingFactors(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

// Re-export para que el módulo exponga el tipo ExportFormat sin duplicar.
export type { ExportFormat };
