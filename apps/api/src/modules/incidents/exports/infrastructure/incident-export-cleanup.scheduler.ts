import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { ExpireDoneExportsUseCase } from '../use-cases/expire-done-exports.use-case';

/**
 * Cadencia del cleanup. 1 hora es suficiente:
 *   - El TTL son 7 días — un retraso de hasta 1h en el borrado es ruido.
 *   - Una corrida procesa hasta `batchSize` jobs; si hay backlog (raro),
 *     la siguiente hora termina de drenar.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Scheduler en proceso que invoca `ExpireDoneExportsUseCase` cada hora.
 * Se registra solo en `WorkerModule` (modo `WORKER_MODE=true`).
 *
 * Por simplicidad usa `setInterval` en vez de BullMQ JobScheduler — el
 * cleanup es local al worker y no necesita coordinación distribuida (los
 * UPDATE/DELETE del use case son idempotentes; correr dos veces no daña).
 *
 * Si más adelante hay múltiples instancias del worker, se puede mover a
 * un BullMQ repeat con jobId fijo para ejecutar una vez por intervalo
 * sin importar cuántas instancias haya — pero V1 no lo requiere.
 */
@Injectable()
export class IncidentExportCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentExportCleanupScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly useCase: ExpireDoneExportsUseCase) {}

  onModuleInit(): void {
    // Primer sweep tras un delay corto para no competir con el bootstrap.
    setTimeout(() => {
      void this.tick();
    }, 30_000);

    this.timer = setInterval(() => {
      void this.tick();
    }, SWEEP_INTERVAL_MS);

    this.logger.log(`Cleanup scheduler activo — interval=${String(SWEEP_INTERVAL_MS / 1000)}s`);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Sweep anterior aún corriendo — skip esta corrida');
      return;
    }
    this.running = true;
    try {
      const result = await this.useCase.execute();
      if (result.scanned > 0) {
        this.logger.log(
          `Cleanup: scanned=${String(result.scanned)} expired=${String(result.expired)} blobDeleteFailures=${String(result.blobDeleteFailures)}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Cleanup falló: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
