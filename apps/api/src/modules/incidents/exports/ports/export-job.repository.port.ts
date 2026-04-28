import type { ExportJob, ExportJobSnapshot } from '../domain/export-job';

export const EXPORT_JOB_REPOSITORY = Symbol('EXPORT_JOB_REPOSITORY');

export interface ExportJobRepositoryPort {
  /**
   * Inserta el job. Devuelve el snapshot con `id` poblado.
   */
  insert(job: ExportJob): Promise<ExportJobSnapshot>;

  /**
   * Recupera por external_id. Retorna `null` si no existe.
   */
  findByExternalId(externalId: string): Promise<ExportJob | null>;

  /**
   * Persiste el snapshot actual del job (UPDATE por external_id). Usado
   * tras transiciones de estado: markRunning, markProgress, markDone,
   * markFailed, markCancelled.
   */
  persist(job: ExportJob): Promise<void>;

  /**
   * Busca jobs `done` cuyo `expires_at` ya pasó. Usado por el cron de
   * cleanup. `limit` evita procesar miles en un solo barrido.
   */
  findExpiredDoneJobs(now: Date, limit: number): Promise<readonly ExportJob[]>;
}
