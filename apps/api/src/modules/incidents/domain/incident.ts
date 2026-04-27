/**
 * Dominio del informe de incidente — core funcional del SURP.
 *
 * Invariantes encapsulados aquí:
 *   - `state='submitted'` exige `correlative_*` poblados (asignados server-side
 *     bajo lock atómico de `incident_sequences`).
 *   - `state='voided'` exige `voided_at/by/reason` y NO libera el correlativo.
 *   - `location` siempre tiene `location_source` declarado (gps directo o
 *     fallback en cascada predio→área→zona resuelto en `RegisterIncidentUseCase`).
 *   - `aggravating_factors` viene del catálogo cerrado documentado en
 *     `LEGAL-INVARIANTS-INCIDENTS.md` §8.3.
 *
 * El correlativo `{NN}-{YYYY}-Z{XX}` se asigna en el use case con lock sobre
 * `incident_sequences`. Aquí solo lo expone como propiedad inmutable.
 */

export type IncidentState =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'closed'
  | 'escalated'
  | 'voided';
export type LocationSource =
  | 'gps'
  | 'property_centroid'
  | 'area_centroid'
  | 'zone_centroid'
  | 'manual';
export type Semaforo = 'no_determinado' | 'verde' | 'amarillo' | 'rojo';
export type TimberFate = 'extracted' | 'felled_only' | 'partially_extracted' | 'unknown';

export interface IncidentLocation {
  lat: number;
  lng: number;
}

export interface IncidentSnapshot {
  id: bigint | null;
  externalId: string | null;
  correlativeCode: string | null;
  correlativeNumber: number | null;
  correlativeYear: number | null;
  zoneId: bigint;
  areaId: bigint | null;
  propertyId: bigint | null;
  communeId: bigint | null;
  incidentTypeId: bigint;
  operationTypeId: bigint | null;
  occurredAt: Date;
  detectedAt: Date | null;
  reportedAt: Date;
  submittedAt: Date | null;
  location: IncidentLocation;
  locationSource: LocationSource;
  gpsAccuracyMeters: number | null;
  description: string;
  semaforo: Semaforo;
  /** NOT NULL si `semaforo != 'no_determinado'` (constraint del schema). */
  semaforoSetAt: Date | null;
  semaforoSetByUserId: bigint | null;
  state: IncidentState;
  timberFate: TimberFate | null;
  aggravatingFactors: readonly string[];
  createdByOrganizationId: bigint;
  capturedByUserId: bigint;
}

export class Incident {
  private constructor(private readonly snapshot: IncidentSnapshot) {}

  static fromSnapshot(s: IncidentSnapshot): Incident {
    return new Incident(s);
  }

  /**
   * Crea un incidente listo para INSERT en estado `submitted` con correlativo
   * asignado. Lo invoca `RegisterIncidentUseCase` después de hacer el lock
   * atómico sobre `incident_sequences` y derivar el código del schema
   * `{number}-{year}-Z{shortCode}`.
   */
  static registerSubmitted(input: {
    correlativeCode: string;
    correlativeNumber: number;
    correlativeYear: number;
    zoneId: bigint;
    areaId: bigint | null;
    propertyId: bigint | null;
    communeId: bigint | null;
    incidentTypeId: bigint;
    operationTypeId: bigint | null;
    occurredAt: Date;
    detectedAt: Date | null;
    reportedAt: Date;
    submittedAt: Date;
    location: IncidentLocation;
    locationSource: LocationSource;
    gpsAccuracyMeters: number | null;
    description: string;
    semaforo: Semaforo;
    semaforoSetAt: Date | null;
    semaforoSetByUserId: bigint | null;
    timberFate: TimberFate | null;
    aggravatingFactors: readonly string[];
    createdByOrganizationId: bigint;
    capturedByUserId: bigint;
  }): Incident {
    return new Incident({
      id: null,
      externalId: null,
      correlativeCode: input.correlativeCode,
      correlativeNumber: input.correlativeNumber,
      correlativeYear: input.correlativeYear,
      zoneId: input.zoneId,
      areaId: input.areaId,
      propertyId: input.propertyId,
      communeId: input.communeId,
      incidentTypeId: input.incidentTypeId,
      operationTypeId: input.operationTypeId,
      occurredAt: input.occurredAt,
      detectedAt: input.detectedAt,
      reportedAt: input.reportedAt,
      submittedAt: input.submittedAt,
      location: input.location,
      locationSource: input.locationSource,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      description: input.description,
      semaforo: input.semaforo,
      semaforoSetAt: input.semaforoSetAt,
      semaforoSetByUserId: input.semaforoSetByUserId,
      state: 'submitted',
      timberFate: input.timberFate,
      aggravatingFactors: input.aggravatingFactors,
      createdByOrganizationId: input.createdByOrganizationId,
      capturedByUserId: input.capturedByUserId,
    });
  }

  toSnapshot(): IncidentSnapshot {
    return this.snapshot;
  }

  // Lecturas convenientes para use cases (read-only).
  get id(): bigint | null {
    return this.snapshot.id;
  }
  get externalId(): string | null {
    return this.snapshot.externalId;
  }
  get correlativeCode(): string | null {
    return this.snapshot.correlativeCode;
  }
  get state(): IncidentState {
    return this.snapshot.state;
  }
}
