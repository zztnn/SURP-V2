import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';

import { DATABASE } from '../../database/database.token';
import type { DB } from '../../database/generated/database.types';

export interface CatalogZone {
  externalId: string;
  code: string;
  shortCode: string;
  name: string;
  active: boolean;
}

export interface CatalogIncidentType {
  externalId: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  involvesTimber: boolean;
  involvesLandOccupation: boolean;
  involvesFire: boolean;
  orderIndex: number;
}

export interface CatalogArea {
  externalId: string;
  code: string;
  name: string;
  zoneExternalId: string;
  active: boolean;
}

export interface CatalogProperty {
  externalId: string;
  code: string;
  name: string;
  areaExternalId: string;
  zoneExternalId: string;
  active: boolean;
}

/**
 * Lecturas read-only de los catálogos. Pattern A (sin domain/use-cases) —
 * son SELECTs sin invariantes ni transformaciones más allá de mapping.
 * Si el alcance crece (filtros, búsqueda, agrupaciones), se promueve
 * a Pattern B con use cases.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async listZones(): Promise<readonly CatalogZone[]> {
    const rows = await this.db
      .selectFrom('zones')
      .select(['externalId', 'code', 'shortCode', 'name', 'active'])
      .where('deletedAt', 'is', null)
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => ({
      externalId: r.externalId,
      code: r.code,
      shortCode: r.shortCode,
      name: r.name,
      active: r.active,
    }));
  }

  async listAreas(zoneExternalId: string | null): Promise<readonly CatalogArea[]> {
    let q = this.db
      .selectFrom('areas as a')
      .innerJoin('zones as z', 'z.id', 'a.zoneId')
      .select([
        'a.externalId as externalId',
        'a.code as code',
        'a.name as name',
        'a.active as active',
        'z.externalId as zoneExternalId',
      ])
      .where('a.deletedAt', 'is', null);
    if (zoneExternalId !== null) {
      q = q.where('z.externalId', '=', zoneExternalId);
    }
    const rows = await q.orderBy('a.name', 'asc').execute();
    return rows.map((r) => ({
      externalId: r.externalId,
      code: r.code,
      name: r.name,
      zoneExternalId: r.zoneExternalId,
      active: r.active,
    }));
  }

  async listProperties(
    areaExternalId: string | null,
    zoneExternalId: string | null,
  ): Promise<readonly CatalogProperty[]> {
    let q = this.db
      .selectFrom('properties as p')
      .innerJoin('areas as a', 'a.id', 'p.areaId')
      .innerJoin('zones as z', 'z.id', 'p.zoneId')
      .select([
        'p.externalId as externalId',
        'p.code as code',
        'p.name as name',
        'p.active as active',
        'a.externalId as areaExternalId',
        'z.externalId as zoneExternalId',
      ])
      .where('p.deletedAt', 'is', null);
    if (areaExternalId !== null) {
      q = q.where('a.externalId', '=', areaExternalId);
    }
    if (zoneExternalId !== null) {
      q = q.where('z.externalId', '=', zoneExternalId);
    }
    const rows = await q.orderBy('p.name', 'asc').execute();
    return rows.map((r) => ({
      externalId: r.externalId,
      code: r.code,
      name: r.name,
      areaExternalId: r.areaExternalId,
      zoneExternalId: r.zoneExternalId,
      active: r.active,
    }));
  }

  async listIncidentTypes(): Promise<readonly CatalogIncidentType[]> {
    const rows = await this.db
      .selectFrom('incidentTypes')
      .select([
        'externalId',
        'code',
        'name',
        'description',
        'category',
        'involvesTimber',
        'involvesLandOccupation',
        'involvesFire',
        'orderIndex',
      ])
      .where('deletedAt', 'is', null)
      .where('active', '=', true)
      .orderBy('orderIndex', 'asc')
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => ({
      externalId: r.externalId,
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      involvesTimber: r.involvesTimber,
      involvesLandOccupation: r.involvesLandOccupation,
      involvesFire: r.involvesFire,
      orderIndex: r.orderIndex,
    }));
  }
}
