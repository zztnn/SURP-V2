import type { IncidentExportRow } from '../incidents-excel.generator';

export const INCIDENT_EXPORT_DATA = Symbol('INCIDENT_EXPORT_DATA');

export interface IncidentExportDataQuery {
  /**
   * IDs de zonas visibles. NULL = sin filtro de visibilidad (org `principal`).
   * Array vacío = bloquea todo (`security_provider` sin asignaciones).
   */
  visibleZoneIds: readonly bigint[] | null;

  /** Filtros del usuario, todos por external_id (lo que envía el frontend). */
  zoneExternalId: string | null;
  areaExternalId: string | null;
  propertyExternalId: string | null;
  semaforo: 'no_determinado' | 'verde' | 'amarillo' | 'rojo' | null;
  occurredFrom: Date | null;
  occurredTo: Date | null;
  incidentTypeExternalIds: readonly string[] | null;
}

export interface IncidentExportDataPort {
  /**
   * Trae todas las filas que matchean los filtros, sin paginación. El
   * processor BullMQ las pasa al generator de Excel.
   *
   * V1 NO soporta búsquedas (free-text / person / vehicle) — esos exports
   * dispararían SQL caros. Si el listado tenía esos filtros activos al
   * momento del export, el processor los ignora silenciosamente — el
   * export sale con un superset de filas. (V2: streaming + soporte
   * completo.)
   */
  findManyForExport(query: IncidentExportDataQuery): Promise<readonly IncidentExportRow[]>;
}
