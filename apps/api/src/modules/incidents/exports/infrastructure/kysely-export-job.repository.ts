import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';

import { DATABASE } from '../../../../database/database.token';
import type { DB } from '../../../../database/generated/database.types';
import {
  ExportJob,
  type ExportFormat,
  type ExportJobSnapshot,
  type ExportJobStatus,
  type ExportJobStorageRef,
} from '../domain/export-job';
import type { ExportJobRepositoryPort } from '../ports/export-job.repository.port';

@Injectable()
export class KyselyExportJobRepository implements ExportJobRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async insert(job: ExportJob): Promise<ExportJobSnapshot> {
    const snap = job.toSnapshot();
    const row = await this.db
      .insertInto('exportJobs')
      .values({
        externalId: snap.externalId,
        module: snap.module,
        format: snap.format,
        requestedByUserId: snap.requestedByUserId,
        requestedByOrganizationId: snap.requestedByOrganizationId,
        filters: JSON.stringify(snap.filters),
        status: snap.status,
        progress: snap.progress,
        totalRows: snap.totalRows,
        rowsDone: snap.rowsDone,
        storageContainer: snap.storage?.container ?? null,
        storageKey: snap.storage?.key ?? null,
        fileSizeBytes: snap.storage?.fileSizeBytes ?? null,
        filename: snap.storage?.filename ?? null,
        errorMessage: snap.errorMessage,
        createdAt: snap.createdAt,
        startedAt: snap.startedAt,
        finishedAt: snap.finishedAt,
        expiresAt: snap.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return rowToSnapshot(row);
  }

  async findByExternalId(externalId: string): Promise<ExportJob | null> {
    const row = await this.db
      .selectFrom('exportJobs')
      .selectAll()
      .where('externalId', '=', externalId)
      .executeTakeFirst();
    if (row === undefined) {
      return null;
    }
    return ExportJob.fromSnapshot(rowToSnapshot(row));
  }

  async persist(job: ExportJob): Promise<void> {
    const snap = job.toSnapshot();
    await this.db
      .updateTable('exportJobs')
      .set({
        status: snap.status,
        progress: snap.progress,
        totalRows: snap.totalRows,
        rowsDone: snap.rowsDone,
        storageContainer: snap.storage?.container ?? null,
        storageKey: snap.storage?.key ?? null,
        fileSizeBytes: snap.storage?.fileSizeBytes ?? null,
        filename: snap.storage?.filename ?? null,
        errorMessage: snap.errorMessage,
        startedAt: snap.startedAt,
        finishedAt: snap.finishedAt,
      })
      .where('externalId', '=', snap.externalId)
      .execute();
  }
}

interface ExportJobRow {
  id: string | bigint;
  externalId: string;
  module: string;
  format: string;
  requestedByUserId: string | bigint;
  requestedByOrganizationId: string | bigint;
  filters: unknown;
  status: string;
  progress: number;
  totalRows: number | null;
  rowsDone: number;
  storageContainer: string | null;
  storageKey: string | null;
  fileSizeBytes: string | bigint | null;
  filename: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date;
}

function rowToSnapshot(row: ExportJobRow): ExportJobSnapshot {
  const storage: ExportJobStorageRef | null =
    row.storageContainer !== null && row.storageKey !== null
      ? {
          container: row.storageContainer,
          key: row.storageKey,
          fileSizeBytes: Number(row.fileSizeBytes ?? 0),
          filename: row.filename ?? '',
        }
      : null;

  return {
    id: typeof row.id === 'bigint' ? row.id : BigInt(row.id),
    externalId: row.externalId,
    module: row.module,
    format: row.format as ExportFormat,
    requestedByUserId:
      typeof row.requestedByUserId === 'bigint'
        ? row.requestedByUserId
        : BigInt(row.requestedByUserId),
    requestedByOrganizationId:
      typeof row.requestedByOrganizationId === 'bigint'
        ? row.requestedByOrganizationId
        : BigInt(row.requestedByOrganizationId),
    filters:
      row.filters !== null && typeof row.filters === 'object'
        ? (row.filters as Record<string, unknown>)
        : {},
    status: row.status as ExportJobStatus,
    progress: row.progress,
    totalRows: row.totalRows,
    rowsDone: row.rowsDone,
    storage,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
  };
}
