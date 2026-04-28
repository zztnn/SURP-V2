import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';

import { DATABASE } from '../../database/database.token';
import type { DB } from '../../database/generated/database.types';

import { SURP_CONTAINERS, type SurpContainer } from './storage.types';

/**
 * Datos que el controller pasa al servicio para auditar una descarga.
 */
export interface RecordBlobDownloadInput {
  container: SurpContainer;
  key: string;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/**
 * Servicio que registra en `audit_logs` cada descarga de blob servida por
 * el `LocalStorageController`. Vive con el módulo de storage porque el
 * controller también vive ahí — pero el conocimiento del cruce blob ↔
 * `export_jobs` (y otras entidades de dominio que generen blobs sensibles)
 * está localizado en este servicio para no contaminar el controller.
 *
 * Defensa Ley 21.719: cada descarga de evidencia, reporte o export queda
 * trazada con quién pidió originalmente el archivo (resuelto desde el
 * `requested_by_user_id` del job), IP del cliente, user-agent, request-id
 * y referencia a la entidad de dominio (`export_jobs.id`).
 *
 * Errores del audit **no** propagan — la descarga ya fue autorizada vía
 * HMAC y nunca debe ser bloqueada por un fallo de telemetría. Cualquier
 * fallo se loguea para alertar.
 */
@Injectable()
export class BlobDownloadAuditService {
  private readonly logger = new Logger(BlobDownloadAuditService.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async recordDownload(input: RecordBlobDownloadInput): Promise<void> {
    try {
      if (input.container === SURP_CONTAINERS.REPORTS) {
        await this.recordExportDownload(input);
        return;
      }
      // Otros containers (evidence, case-docs, etc.) se cubrirán cuando se
      // implementen sus flujos de descarga. Por ahora se loguea un warning
      // para que sea visible si alguien sirve algo que no auditamos.
      this.logger.warn(
        `Descarga sin auditoría específica: container=${input.container} key=${input.key}`,
      );
    } catch (e) {
      this.logger.error(
        `Fallo al registrar audit de descarga (container=${input.container} key=${input.key})`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  /**
   * Cruza (`storage_container`, `storage_key`) contra `export_jobs` para
   * resolver el job, su dueño y su organización. Si no encuentra el job
   * (caso raro: alguien construyó la URL firmada manualmente sin INSERT
   * previo, o el job fue purgado por el cron y todavía hay descargas
   * en vuelo), igual deja un registro genérico para que la actividad no
   * desaparezca.
   */
  private async recordExportDownload(input: RecordBlobDownloadInput): Promise<void> {
    const job = await this.db
      .selectFrom('exportJobs')
      .select([
        'id',
        'externalId',
        'requestedByUserId',
        'requestedByOrganizationId',
        'filename',
        'fileSizeBytes',
        'module',
      ])
      .where('storageContainer', '=', input.container)
      .where('storageKey', '=', input.key)
      .executeTakeFirst();

    const requestUuid = parseUuidOrNull(input.requestId);
    const ip = input.ip;
    const userAgent = input.userAgent;

    if (!job) {
      await this.db
        .insertInto('auditLogs')
        .values({
          source: 'sensitive_read',
          action: 'blob_download_unmatched',
          userId: null,
          organizationId: null,
          requestId: requestUuid,
          ip,
          userAgent,
          entityTable: 'export_jobs',
          metadata: JSON.stringify({
            container: input.container,
            key: input.key,
          }),
        })
        .execute();
      return;
    }

    await this.db
      .insertInto('auditLogs')
      .values({
        source: 'sensitive_read',
        action: actionForModule(job.module),
        userId: job.requestedByUserId,
        organizationId: job.requestedByOrganizationId,
        requestId: requestUuid,
        ip,
        userAgent,
        entityTable: 'export_jobs',
        entityId: job.id,
        entityExternalId: job.externalId,
        metadata: JSON.stringify({
          container: input.container,
          key: input.key,
          filename: job.filename,
          fileSizeBytes: job.fileSizeBytes !== null ? Number(job.fileSizeBytes) : null,
          module: job.module,
        }),
      })
      .execute();
  }
}

function parseUuidOrNull(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value;
}

/**
 * Vocabulario de `audit_logs.action` para descargas de export. Por módulo
 * se distingue para que las consultas de auditoría puedan filtrar (ej.
 * "todos los downloads de incidents en los últimos 90 días" para reporte
 * a la Agencia de Protección de Datos si se solicita).
 */
function actionForModule(module: string): string {
  switch (module) {
    case 'incidents':
      return 'incident_export_download';
    default:
      return `${module}_export_download`;
  }
}
