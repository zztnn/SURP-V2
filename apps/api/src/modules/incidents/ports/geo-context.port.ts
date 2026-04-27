export const GEO_CONTEXT = Symbol('GEO_CONTEXT');

/**
 * Resolución de la jerarquía territorial al registrar un incidente.
 *
 * El cliente puede enviar:
 *   - Solo `zoneExternalId` (+ lat/lng) → backend auto-resuelve
 *     `area`/`property`/`commune` por `ST_Contains`.
 *   - Cualquiera de los IDs explícitos → backend valida pertenencia
 *     jerárquica (zone⊃area⊃property; commune independiente) y respeta el
 *     ID dado sin sobreescribir.
 *
 * La fuente de verdad es Postgres + PostGIS.
 */
export interface GeoContextPort {
  resolveZoneByExternalId(externalId: string): Promise<ResolvedZone | null>;
  resolveAreaByExternalId(externalId: string): Promise<ResolvedArea | null>;
  resolvePropertyByExternalId(externalId: string): Promise<ResolvedProperty | null>;
  resolveCommuneByExternalId(externalId: string): Promise<ResolvedCommune | null>;
  resolveIncidentTypeByExternalId(externalId: string): Promise<ResolvedIncidentType | null>;

  /**
   * Encuentra la propiedad cuyo `boundary` contiene el punto. Si hay varias
   * (overlap entre predios), devuelve la primera por id ascendente. NULL si
   * el punto no cae en ningún predio.
   */
  findPropertyContaining(lat: number, lng: number): Promise<ResolvedProperty | null>;

  /**
   * Encuentra el área cuyo `boundary` contiene el punto. Útil cuando el
   * punto cae en zona pero no en ningún predio.
   */
  findAreaContaining(lat: number, lng: number): Promise<ResolvedArea | null>;

  /**
   * Encuentra la comuna cuyo `geometry` contiene el punto.
   */
  findCommuneContaining(lat: number, lng: number): Promise<ResolvedCommune | null>;

  /**
   * Devuelve los `zone.id` (BIGINT) cuya asignación a la organización está
   * vigente (`valid_to IS NULL`) en `organization_zone_assignments`. Lo usa
   * el filtro de visibilidad para `security_provider`. `principal` no llama
   * este método (ve todo).
   */
  findVisibleZoneIdsForOrganization(organizationId: bigint): Promise<readonly bigint[]>;
}

export interface ResolvedZone {
  id: bigint;
  externalId: string;
  shortCode: string;
  active: boolean;
}

export interface ResolvedArea {
  id: bigint;
  externalId: string;
  zoneId: bigint;
  active: boolean;
}

export interface ResolvedProperty {
  id: bigint;
  externalId: string;
  zoneId: bigint;
  areaId: bigint;
  communeId: bigint | null;
  active: boolean;
}

export interface ResolvedCommune {
  id: bigint;
  externalId: string;
  regionId: bigint;
}

export interface ResolvedIncidentType {
  id: bigint;
  externalId: string;
  active: boolean;
}
