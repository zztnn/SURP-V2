import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { type RequestContext } from '../../../../common';
import { STORAGE, type StoragePort } from '../../../../common/storage';
import { type SurpContainer, isKnownContainer } from '../../../../common/storage';
import type { ExportJobStatus } from '../domain/export-job';
import {
  EXPORT_JOB_REPOSITORY,
  type ExportJobRepositoryPort,
} from '../ports/export-job.repository.port';

export interface GetExportJobStatusInput {
  externalId: string;
}

export interface GetExportJobStatusResult {
  externalId: string;
  status: ExportJobStatus;
  progress: number;
  totalRows: number | null;
  rowsDone: number;
  /** Presente solo cuando `status === 'done'` y el blob no está expirado. */
  downloadUrl: string | null;
  /** Presente solo cuando `status === 'done'`. */
  filename: string | null;
  /** Presente cuando `status === 'failed'` o `'cancelled'`. */
  errorMessage: string | null;
  expiresAt: Date;
}

const DOWNLOAD_TTL_SECONDS = 15 * 60;

/**
 * Lee el estado de un export job. Auth: el usuario solo puede ver sus
 * propios exports (V1 — admins lo veremos en una segunda iteración).
 *
 * Cuando `status='done'`, genera una URL firmada con TTL corto (15 min)
 * delegando en `StoragePort`. Misma firma del puerto local y Azure: el
 * frontend redirige el browser a esa URL para descargar.
 */
@Injectable()
export class GetExportJobStatusUseCase {
  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly repo: ExportJobRepositoryPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  async execute(
    input: GetExportJobStatusInput,
    ctx: RequestContext,
  ): Promise<GetExportJobStatusResult> {
    if (ctx.userId === null) {
      throw new UnauthorizedException('Sesión sin usuario');
    }

    const job = await this.repo.findByExternalId(input.externalId);
    if (job === null) {
      throw new NotFoundException('Export job no encontrado');
    }

    if (job.requestedByUserId !== ctx.userId) {
      // Mismo opaco que un 404 — no filtra existencia.
      throw new ForbiddenException();
    }

    let downloadUrl: string | null = null;
    if (job.status === 'done' && job.storage !== null) {
      // El container guardado en BD debería ser uno del catálogo, pero
      // validamos por defensa antes de invocar el storage.
      if (!isKnownContainer(job.storage.container)) {
        throw new Error(`Container desconocido en export_jobs: ${job.storage.container}`);
      }
      const container: SurpContainer = job.storage.container;
      downloadUrl = await this.storage.getDownloadUrl(container, job.storage.key, {
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        filename: job.storage.filename,
      });
    }

    return {
      externalId: job.externalId,
      status: job.status,
      progress: job.progress,
      totalRows: job.totalRows,
      rowsDone: job.rowsDone,
      downloadUrl,
      filename: job.storage?.filename ?? null,
      errorMessage: job.errorMessage,
      expiresAt: job.expiresAt,
    };
  }
}
