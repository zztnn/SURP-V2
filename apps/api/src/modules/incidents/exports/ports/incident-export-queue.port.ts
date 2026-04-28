export const INCIDENT_EXPORT_QUEUE = Symbol('INCIDENT_EXPORT_QUEUE');

/**
 * Payload del job en BullMQ. Mínimo — la fuente de verdad del estado y
 * los filtros vive en `export_jobs` (Postgres). Aquí solo va la
 * referencia para que el processor sepa qué fila leer.
 */
export interface IncidentExportJobPayload {
  /** External_id del export_jobs row. También = `jobId` de BullMQ. */
  exportJobExternalId: string;
}

export interface IncidentExportQueuePort {
  enqueue(payload: IncidentExportJobPayload): Promise<void>;
}
