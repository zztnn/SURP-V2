import type { Incident, IncidentSnapshot, IncidentState, Semaforo } from '../domain/incident';

export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');

export interface IncidentRepositoryPort {
  /**
   * Inserta el incidente bajo lock atómico de `incident_sequences`. Recibe un
   * `Incident` con correlativo PRE-CALCULADO por el use case y se encarga
   * únicamente de la escritura SQL — la transacción + lock + cálculo del
   * número viven en `withSequenceLock`.
   */
  insert(incident: Incident): Promise<IncidentSnapshot>;

  /**
   * Ejecuta `fn` dentro de una transacción que primero hace UPSERT atómico
   * sobre `incident_sequences (zone_id, year)` con `last_number + 1` y
   * pasa el número resultante al callback. El callback típico es el use
   * case que construye el `Incident` y llama `insert`.
   *
   * El UPSERT con `ON CONFLICT ... DO UPDATE` garantiza que dos requests
   * concurrentes para la misma `(zone, year)` reciban números consecutivos
   * sin duplicar.
   */
  withSequenceLock<T>(
    zoneId: bigint,
    year: number,
    fn: (nextNumber: number) => Promise<T>,
  ): Promise<T>;

  /**
   * Lista incidentes con filtros + paginación. El use case ya aplicó el
   * filtro de visibilidad (zonas asignadas para `security_provider`) y
   * pasa la lista de zoneIds permitidos en `visibleZoneIds`. NULL =
   * acceso total (caso `principal`).
   */
  list(query: ListIncidentsQuery): Promise<ListIncidentsPage>;

  /**
   * Detalle por external_id con joins. Aplica el mismo filtro de
   * visibilidad por zonas: si el incidente no está en
   * `visibleZoneIds`, retorna NULL aunque exista.
   */
  findByExternalId(
    externalId: string,
    visibleZoneIds: readonly bigint[] | null,
  ): Promise<IncidentDetail | null>;

  /**
   * Snapshot mínimo (id, state, zone_id) para que el use case decida
   * transiciones. Aplica el filtro de visibilidad. Retorna NULL si no
   * existe o está fuera de las zonas visibles.
   */
  findStateByExternalId(
    externalId: string,
    visibleZoneIds: readonly bigint[] | null,
  ): Promise<{ id: bigint; state: IncidentState; zoneId: bigint } | null>;

  /**
   * Transiciona a 'voided' con razón obligatoria. NO libera el
   * correlativo (invariante del schema). Retorna `true` si efectivamente
   * actualizó (1 row); `false` si el state cambió mientras tanto
   * (concurrencia).
   */
  markVoided(
    incidentId: bigint,
    fromStates: readonly IncidentState[],
    voidReason: string,
    at: Date,
    voidedByUserId: bigint,
  ): Promise<boolean>;
}

export interface ListIncidentsQuery {
  page: number;
  pageSize: number;
  visibleZoneIds: readonly bigint[] | null;
  zoneId: bigint | null;
  areaId: bigint | null;
  propertyId: bigint | null;
  semaforo: Semaforo | null;
  occurredFrom: Date | null;
  occurredTo: Date | null;
  // NULL = sin filtro de tipo. Array vacío también equivale a "sin filtro"
  // (nadie debería pasar uno vacío en producción — el use case no lo permite).
  incidentTypeIds: readonly bigint[] | null;
  // Free text que matchea contra description, correlative_code, zone.name,
  // area.name, property.name. NULL = sin filtro.
  freeTextSearch: string | null;
  // Match en parties.rut / parties.display_name / natural_persons.{given_names,
  // paternal_surname, maternal_surname} de las personas vinculadas al incidente.
  personSearch: string | null;
  // Match en vehicles.license_plate y incident_vehicle_links.observed_plate
  // de los vehículos vinculados al incidente.
  vehicleSearch: string | null;
}

export interface ListIncidentsPage {
  items: readonly IncidentListItem[];
  total: number;
}

export interface IncidentListItem {
  externalId: string;
  correlativeCode: string | null;
  occurredAt: Date;
  state: IncidentState;
  semaforo: Semaforo;
  incidentTypeCode: string;
  incidentTypeName: string;
  zoneShortCode: string;
  zoneName: string;
  areaName: string | null;
  propertyName: string | null;
  communeName: string | null;
  capturedByUserDisplayName: string;
  descriptionExcerpt: string;
  location: { lat: number; lng: number };
}

export interface IncidentDetail {
  externalId: string;
  correlativeCode: string | null;
  state: IncidentState;
  semaforo: Semaforo;
  occurredAt: Date;
  detectedAt: Date | null;
  reportedAt: Date;
  submittedAt: Date | null;
  description: string;
  location: { lat: number; lng: number };
  locationSource: string;
  gpsAccuracyMeters: number | null;
  aggravatingFactors: readonly string[];
  timberFate: string | null;
  zone: { externalId: string; shortCode: string; name: string };
  area: { externalId: string; name: string } | null;
  property: { externalId: string; name: string } | null;
  commune: { externalId: string; name: string } | null;
  incidentType: { externalId: string; code: string; name: string };
  capturedByUser: { externalId: string; displayName: string };
  createdByOrganization: {
    externalId: string;
    name: string;
    type: 'principal' | 'security_provider' | 'api_consumer';
  };
}
