import { Controller, Get, Query } from '@nestjs/common';

import {
  CatalogService,
  type CatalogArea,
  type CatalogIncidentType,
  type CatalogProperty,
  type CatalogZone,
} from './catalog.service';

/**
 * Lecturas tipadas de los catálogos del SURP. Endpoints triviales que
 * el frontend consume para poblar dropdowns y filtros (zones, tipos de
 * incidente, etc.). Permiso = autenticado (sin código adicional —
 * ningún rol legítimo del sistema necesita estar bloqueado de leer
 * los catálogos para funcionar).
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('zones')
  async zones(): Promise<{ items: readonly CatalogZone[] }> {
    const items = await this.catalog.listZones();
    return { items };
  }

  @Get('incident-types')
  async incidentTypes(): Promise<{ items: readonly CatalogIncidentType[] }> {
    const items = await this.catalog.listIncidentTypes();
    return { items };
  }

  @Get('areas')
  async areas(
    @Query('zoneExternalId') zoneExternalId?: string,
  ): Promise<{ items: readonly CatalogArea[] }> {
    const items = await this.catalog.listAreas(emptyToNull(zoneExternalId));
    return { items };
  }

  @Get('properties')
  async properties(
    @Query('areaExternalId') areaExternalId?: string,
    @Query('zoneExternalId') zoneExternalId?: string,
  ): Promise<{ items: readonly CatalogProperty[] }> {
    const items = await this.catalog.listProperties(
      emptyToNull(areaExternalId),
      emptyToNull(zoneExternalId),
    );
    return { items };
  }
}

function emptyToNull(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}
