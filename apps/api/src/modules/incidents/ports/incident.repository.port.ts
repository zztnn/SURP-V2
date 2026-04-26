import type { Incident, IncidentSnapshot } from '../domain/incident';

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
}
