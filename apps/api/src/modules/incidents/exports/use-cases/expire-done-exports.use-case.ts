import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../common';
import {
  STORAGE,
  isKnownContainer,
  type StoragePort,
  type SurpContainer,
} from '../../../../common/storage';
import {
  EXPORT_JOB_REPOSITORY,
  type ExportJobRepositoryPort,
} from '../ports/export-job.repository.port';

export interface ExpireDoneExportsResult {
  scanned: number;
  expired: number;
  blobDeleteFailures: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * Cron de cleanup. Para cada job `done` con `expires_at < now()`:
 *   1. Borra el blob via `STORAGE.delete()`.
 *   2. Transiciona el job a `expired` (limpia la ref al storage).
 *   3. Persiste.
 *
 * Errores al borrar el blob NO bloquean la transición: el blob puede ya
 * no existir (alguien lo borró manualmente, restore parcial, etc.) y aún
 * así queremos marcar el job como expired para que no se vuelva a tocar.
 *
 * Idempotente — si corre dos veces seguidas, la segunda no encuentra
 * jobs `done` ya expirados (todos pasaron a `expired`).
 *
 * Defensa Ley 21.719 — Política de retención: los blobs con datos
 * personales (export de incidentes incluye RUT/PPU del legacy) se
 * destruyen automáticamente al pasar el TTL. La fila en `export_jobs`
 * queda como evidencia auditable de que el export ocurrió, sin retener
 * los datos personales.
 */
@Injectable()
export class ExpireDoneExportsUseCase {
  private readonly logger = new Logger(ExpireDoneExportsUseCase.name);

  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly repo: ExportJobRepositoryPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(batchSize: number = DEFAULT_BATCH_SIZE): Promise<ExpireDoneExportsResult> {
    const now = this.clock.now();
    const candidates = await this.repo.findExpiredDoneJobs(now, batchSize);

    let blobDeleteFailures = 0;
    let expired = 0;

    for (const job of candidates) {
      const storage = job.storage;
      if (storage !== null) {
        if (!isKnownContainer(storage.container)) {
          this.logger.warn(
            `Job ${job.externalId} con container desconocido ${storage.container} — skip blob delete`,
          );
        } else {
          const container: SurpContainer = storage.container;
          try {
            await this.storage.delete(container, storage.key);
          } catch (err) {
            blobDeleteFailures++;
            this.logger.warn(
              `Job ${job.externalId}: fallo al borrar blob (${storage.container}/${storage.key}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }

      try {
        job.markExpired();
        await this.repo.persist(job);
        expired++;
      } catch (err) {
        this.logger.error(
          `Job ${job.externalId}: fallo al persistir transición a expired: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      scanned: candidates.length,
      expired,
      blobDeleteFailures,
    };
  }
}
