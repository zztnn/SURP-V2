import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { REDIS_CONFIG, type RedisConfig } from './redis-config.token';
import {
  type IncidentExportJobPayload,
  type IncidentExportQueuePort,
} from '../ports/incident-export-queue.port';

export const INCIDENT_EXPORT_QUEUE_NAME = 'incidents-export';

@Injectable()
export class BullMQIncidentExportQueue implements IncidentExportQueuePort, OnModuleDestroy {
  private readonly queue: Queue<IncidentExportJobPayload>;

  constructor(@Inject(REDIS_CONFIG) cfg: RedisConfig) {
    this.queue = new Queue<IncidentExportJobPayload>(INCIDENT_EXPORT_QUEUE_NAME, {
      connection: { host: cfg.host, port: cfg.port },
      defaultJobOptions: {
        // Exports no son idempotentes — no se reintentan automáticamente.
        // Si fallan, el usuario re-pide.
        attempts: 1,
        // Mantiene jobs completados 1 día (visibilidad ops); fallidos 7 días (debug).
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  async enqueue(payload: IncidentExportJobPayload): Promise<void> {
    // jobId determinístico = external_id de export_jobs. Si BullMQ ya tiene
    // un job con ese ID, deduplica (idempotencia natural si el use case
    // se ejecuta dos veces).
    await this.queue.add('export', payload, {
      jobId: payload.exportJobExternalId,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
