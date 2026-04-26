import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type SqlBool } from 'kysely';

import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import type {
  GeoContextPort,
  ResolvedArea,
  ResolvedCommune,
  ResolvedIncidentType,
  ResolvedProperty,
  ResolvedZone,
} from '../ports/geo-context.port';

@Injectable()
export class KyselyGeoContext implements GeoContextPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async resolveZoneByExternalId(externalId: string): Promise<ResolvedZone | null> {
    const row = await this.db
      .selectFrom('zones')
      .select(['id', 'externalId', 'shortCode', 'active'])
      .where('externalId', '=', externalId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      shortCode: row.shortCode,
      active: row.active,
    };
  }

  async resolveAreaByExternalId(externalId: string): Promise<ResolvedArea | null> {
    const row = await this.db
      .selectFrom('areas')
      .select(['id', 'externalId', 'zoneId', 'active'])
      .where('externalId', '=', externalId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      zoneId: BigInt(row.zoneId),
      active: row.active,
    };
  }

  async resolvePropertyByExternalId(externalId: string): Promise<ResolvedProperty | null> {
    const row = await this.db
      .selectFrom('properties')
      .select(['id', 'externalId', 'zoneId', 'areaId', 'communeId', 'active'])
      .where('externalId', '=', externalId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      zoneId: BigInt(row.zoneId),
      areaId: BigInt(row.areaId),
      communeId: row.communeId !== null ? BigInt(row.communeId) : null,
      active: row.active,
    };
  }

  async resolveCommuneByExternalId(externalId: string): Promise<ResolvedCommune | null> {
    const row = await this.db
      .selectFrom('communes')
      .select(['id', 'externalId', 'regionId'])
      .where('externalId', '=', externalId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      regionId: BigInt(row.regionId),
    };
  }

  async resolveIncidentTypeByExternalId(externalId: string): Promise<ResolvedIncidentType | null> {
    const row = await this.db
      .selectFrom('incidentTypes')
      .select(['id', 'externalId', 'active'])
      .where('externalId', '=', externalId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      active: row.active,
    };
  }

  async findPropertyContaining(lat: number, lng: number): Promise<ResolvedProperty | null> {
    const row = await this.db
      .selectFrom('properties')
      .select(['id', 'externalId', 'zoneId', 'areaId', 'communeId', 'active'])
      .where(sql<SqlBool>`ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`)
      .where('deletedAt', 'is', null)
      .where('active', '=', true)
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      zoneId: BigInt(row.zoneId),
      areaId: BigInt(row.areaId),
      communeId: row.communeId !== null ? BigInt(row.communeId) : null,
      active: row.active,
    };
  }

  async findAreaContaining(lat: number, lng: number): Promise<ResolvedArea | null> {
    const row = await this.db
      .selectFrom('areas')
      .select(['id', 'externalId', 'zoneId', 'active'])
      .where(sql<SqlBool>`ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`)
      .where('deletedAt', 'is', null)
      .where('active', '=', true)
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      zoneId: BigInt(row.zoneId),
      active: row.active,
    };
  }

  async findCommuneContaining(lat: number, lng: number): Promise<ResolvedCommune | null> {
    const row = await this.db
      .selectFrom('communes')
      .select(['id', 'externalId', 'regionId'])
      .where(sql<SqlBool>`ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`)
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: BigInt(row.id),
      externalId: row.externalId,
      regionId: BigInt(row.regionId),
    };
  }
}
