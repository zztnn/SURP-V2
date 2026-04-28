import { randomUUID } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { CLOCK, type ClockPort, type RequestContext } from '../../../../common';
import { ExportJob, type ExportFormat } from '../domain/export-job';
import {
  EXPORT_JOB_REPOSITORY,
  type ExportJobRepositoryPort,
} from '../ports/export-job.repository.port';
import {
  INCIDENT_EXPORT_QUEUE,
  type IncidentExportQueuePort,
} from '../ports/incident-export-queue.port';

const TTL_SECONDS = 7 * 86_400;

export interface EnqueueIncidentExportInput {
  /** Filtros aplicados al listado al momento de pedir el export. */
  filters: Readonly<Record<string, unknown>>;
  format: ExportFormat;
}

export interface EnqueueIncidentExportResult {
  externalId: string;
  status: 'queued';
}

/**
 * Crea una fila en `export_jobs` (status='queued') y encola el job en
 * BullMQ. El processor del worker (paso 4b) consume y completa el flujo.
 *
 * Invariantes:
 *   - `external_id` (UUID) es la única referencia que ve el cliente. Es
 *     también el `jobId` de BullMQ, así que el processor encuentra la
 *     fila por ese mismo UUID.
 *   - TTL del archivo resultante: 7 días desde `created_at`. Cleanup
 *     diario (paso 7).
 *   - El `requested_by_organization_id` se conserva para auditoría incluso
 *     si el usuario después cambia de org.
 */
@Injectable()
export class EnqueueIncidentExportUseCase {
  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly repo: ExportJobRepositoryPort,
    @Inject(INCIDENT_EXPORT_QUEUE) private readonly queue: IncidentExportQueuePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: EnqueueIncidentExportInput,
    ctx: RequestContext,
  ): Promise<EnqueueIncidentExportResult> {
    if (ctx.userId === null || ctx.organizationId === null) {
      throw new UnauthorizedException('Sesión sin usuario');
    }

    const job = ExportJob.create({
      externalId: randomUUID(),
      module: 'incidents',
      format: input.format,
      requestedByUserId: ctx.userId,
      requestedByOrganizationId: ctx.organizationId,
      filters: input.filters,
      ttlSeconds: TTL_SECONDS,
      now: this.clock.now(),
    });

    // INSERT primero. Si BullMQ falla, igual queda la fila en queued y un
    // cron de janitorial podría re-encolar. (V1 sin re-encolado automático;
    // si pasa, status queda en 'queued' y nunca avanza — visible para admin.)
    await this.repo.insert(job);

    await this.queue.enqueue({ exportJobExternalId: job.externalId });

    return { externalId: job.externalId, status: 'queued' };
  }
}
