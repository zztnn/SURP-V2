import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { format } from 'date-fns';
import type { Kysely } from 'kysely';

import {
  CLOCK,
  RequestContextService,
  type ClockPort,
  type RequestContext,
} from '../../../../common';
import { STORAGE, SURP_CONTAINERS, type StoragePort } from '../../../../common/storage';
import { DATABASE } from '../../../../database/database.token';
import type { DB } from '../../../../database/generated/database.types';
import type { ExportJob } from '../domain/export-job';
import { generateIncidentsExcel, type IncidentExportRow } from '../incidents-excel.generator';
import {
  EXPORT_JOB_REPOSITORY,
  type ExportJobRepositoryPort,
} from '../ports/export-job.repository.port';
import {
  INCIDENT_EXPORT_DATA,
  type IncidentExportDataPort,
  type IncidentExportDataQuery,
} from '../ports/incident-export-data.port';
import type { IncidentExportJobPayload } from '../ports/incident-export-queue.port';
import { INCIDENT_EXPORT_QUEUE_NAME } from './bullmq-incident-export-queue';
import { REDIS_CONFIG, type RedisConfig } from './redis-config.token';

const CONCURRENCY = 2;

/**
 * Worker BullMQ que consume jobs de la cola `incidents-export`.
 *
 * Solo se registra en `WorkerModule` (modo `WORKER_MODE=true`). Flujo:
 *
 *   1. Lee `export_jobs` por `external_id` (mismo ID que el jobId BullMQ).
 *   2. `markRunning` + persist.
 *   3. Resuelve filtros + visibility scope desde `requestedByOrganization`.
 *   4. Fetch enriched rows via `IncidentExportDataPort` (filtros V1: zone,
 *      area, property, semáforo, fechas, tipos).
 *   5. Genera Excel via `generateIncidentsExcel`.
 *   6. Sube el buffer a `surp-reports` via `StoragePort`.
 *   7. `markDone` con la referencia al blob + persist.
 *   8. Errores → `markFailed` + persist.
 *
 * `attempts: 1` (no idempotente — un retry duplicaría el blob); si falla,
 * el usuario re-pide el export.
 */
@Injectable()
export class IncidentExportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentExportProcessor.name);
  private worker: Worker<IncidentExportJobPayload> | null = null;

  constructor(
    @Inject(REDIS_CONFIG) private readonly redisConfig: RedisConfig,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly repo: ExportJobRepositoryPort,
    @Inject(INCIDENT_EXPORT_DATA) private readonly data: IncidentExportDataPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(DATABASE) private readonly db: Kysely<DB>,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly contextService: RequestContextService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<IncidentExportJobPayload>(
      INCIDENT_EXPORT_QUEUE_NAME,
      async (job: Job<IncidentExportJobPayload>) => {
        const ctx: RequestContext = {
          requestId: randomUUID(),
          userId: null,
          organizationId: null,
          organizationType: null,
          ip: null,
          userAgent: 'bullmq-worker',
          source: 'job',
          startedAt: new Date(),
          sessionExternalId: null,
        };
        await this.contextService.runWithContext(ctx, () => this.process(job));
      },
      {
        connection: { host: this.redisConfig.host, port: this.redisConfig.port },
        concurrency: CONCURRENCY,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id ?? '?'} falló (attempts ${String(job?.attemptsMade ?? 0)}): ${err.message}`,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id ?? '?'} completado`);
    });

    this.logger.log(
      `Worker BullMQ corriendo — cola=${INCIDENT_EXPORT_QUEUE_NAME}, concurrency=${String(CONCURRENCY)}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }

  /**
   * Atrapa errores y los persiste como `failed` antes de re-lanzar para
   * que BullMQ los registre. Sin retries (attempts=1 en la cola).
   */
  private async process(job: Job<IncidentExportJobPayload>): Promise<void> {
    const externalId = job.data.exportJobExternalId;
    const exportJob = await this.repo.findByExternalId(externalId);
    if (exportJob === null) {
      throw new Error(`Export job ${externalId} no encontrado en BD`);
    }

    try {
      await this.runExport(exportJob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export ${externalId} falló: ${msg}`);
      try {
        if (exportJob.status === 'queued' || exportJob.status === 'running') {
          exportJob.markFailed(msg.slice(0, 1000), this.clock.now());
          await this.repo.persist(exportJob);
        }
      } catch (persistErr) {
        this.logger.error(
          `Export ${externalId}: además, persist del estado failed falló: ${
            persistErr instanceof Error ? persistErr.message : String(persistErr)
          }`,
        );
      }
      throw err;
    }
  }

  private async runExport(exportJob: ExportJob): Promise<void> {
    exportJob.markRunning(this.clock.now());
    await this.repo.persist(exportJob);

    const visibleZoneIds = await this.resolveVisibleZones(exportJob.requestedByOrganizationId);
    const dataQuery = buildDataQuery(exportJob.filters, visibleZoneIds);

    const rows = await this.data.findManyForExport(dataQuery);
    exportJob.markProgress(rows.length, rows.length);
    await this.repo.persist(exportJob);

    const generatedAt = this.clock.now();
    const requesterName = await this.lookupUserDisplayName(exportJob.requestedByUserId);
    const buffer = await generateIncidentsExcel(rows, {
      generatedAt,
      generatedByDisplayName: requesterName,
      filtersSummary: summarizeFilters(exportJob.filters),
    });

    const filename = `incidentes-${format(generatedAt, 'yyyy-MM-dd-HHmm')}.xlsx`;
    const stored = await this.storage.upload({
      container: SURP_CONTAINERS.REPORTS,
      entityType: 'incidents',
      entityId: exportJob.externalId,
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: buffer,
    });

    exportJob.markDone(
      {
        container: stored.container,
        key: stored.key,
        fileSizeBytes: stored.size,
        filename,
      },
      rows.length,
      this.clock.now(),
    );
    await this.repo.persist(exportJob);
  }

  /**
   * Para `principal` retorna `null` (sin filtro). Para `security_provider`,
   * queryea `organization_zone_assignments` y devuelve los IDs vigentes.
   * Para `api_consumer` o tipo desconocido, retorna array vacío (bloquea todo).
   *
   * Inline aquí para evitar acoplar el módulo de exports al `GEO_CONTEXT`
   * port del módulo `incidents`.
   */
  private async resolveVisibleZones(organizationId: bigint): Promise<readonly bigint[] | null> {
    const org = await this.db
      .selectFrom('organizations')
      .select('type')
      .where('id', '=', organizationId.toString())
      .executeTakeFirst();
    if (org === undefined) return [];
    if (org.type === 'principal') return null;
    if (org.type === 'security_provider') {
      const rows = await this.db
        .selectFrom('organizationZoneAssignments')
        .select('zoneId')
        .where('organizationId', '=', organizationId.toString())
        .where('validTo', 'is', null)
        .execute();
      return rows.map((r) => BigInt(r.zoneId));
    }
    return [];
  }

  private async lookupUserDisplayName(userId: bigint): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('users')
      .select('displayName')
      .where('id', '=', userId.toString())
      .executeTakeFirst();
    return row?.displayName;
  }
}

/**
 * Mapea el JSONB `filters` (snapshot serializado del listado) al query
 * tipado del data port. V1 acepta los filtros simples — los IDs se
 * pasan como números en `bigint`. Filtros de búsqueda (free-text,
 * person, vehicle) se ignoran.
 */
function buildDataQuery(
  filters: Readonly<Record<string, unknown>>,
  visibleZoneIds: readonly bigint[] | null,
): IncidentExportDataQuery {
  return {
    visibleZoneIds,
    zoneId: pickBigInt(filters['zoneId']),
    areaId: pickBigInt(filters['areaId']),
    propertyId: pickBigInt(filters['propertyId']),
    semaforo: pickSemaforo(filters['semaforo']),
    occurredFrom: pickDate(filters['occurredFrom']),
    occurredTo: pickDate(filters['occurredTo']),
    incidentTypeIds: pickBigIntArray(filters['incidentTypeIds']),
  };
}

function pickBigInt(value: unknown): bigint | null {
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  if (typeof value === 'number') return BigInt(value);
  return null;
}

function pickBigIntArray(value: unknown): readonly bigint[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((v) => pickBigInt(v)).filter((v): v is bigint => v !== null);
}

function pickSemaforo(value: unknown): IncidentExportDataQuery['semaforo'] {
  if (value === 'no_determinado' || value === 'verde' || value === 'amarillo' || value === 'rojo') {
    return value;
  }
  return null;
}

function pickDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resumen humano de los filtros para el header del Excel. V1 muestra
 * solo lo que es identificable sin lookups adicionales.
 */
function summarizeFilters(filters: Readonly<Record<string, unknown>>): string | undefined {
  const parts: string[] = [];
  if (typeof filters['semaforo'] === 'string') {
    parts.push(`Semáforo: ${filters['semaforo']}`);
  }
  if (typeof filters['occurredFrom'] === 'string') {
    parts.push(`Desde: ${filters['occurredFrom'].slice(0, 10)}`);
  }
  if (typeof filters['occurredTo'] === 'string') {
    parts.push(`Hasta: ${filters['occurredTo'].slice(0, 10)}`);
  }
  if (Array.isArray(filters['incidentTypeIds']) && filters['incidentTypeIds'].length > 0) {
    parts.push(`Tipos: ${String(filters['incidentTypeIds'].length)} seleccionados`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

// Re-export type para que IncidentExportRow no quede solo en el generator.
export type { IncidentExportRow };
