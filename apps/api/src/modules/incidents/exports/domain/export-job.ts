import { DomainError } from '../../../../common';

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';

export type ExportFormat = 'xlsx' | 'pdf' | 'csv';

export interface ExportJobStorageRef {
  container: string;
  key: string;
  fileSizeBytes: number;
  filename: string;
}

export interface ExportJobSnapshot {
  readonly id: bigint | null;
  readonly externalId: string;
  readonly module: string;
  readonly format: ExportFormat;
  readonly requestedByUserId: bigint;
  readonly requestedByOrganizationId: bigint;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly status: ExportJobStatus;
  readonly progress: number;
  readonly totalRows: number | null;
  readonly rowsDone: number;
  readonly storage: ExportJobStorageRef | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly expiresAt: Date;
}

interface CreateInput {
  externalId: string;
  module: string;
  format: ExportFormat;
  requestedByUserId: bigint;
  requestedByOrganizationId: bigint;
  filters: Readonly<Record<string, unknown>>;
  ttlSeconds: number;
  now: Date;
}

/**
 * Job de exportación. State machine:
 *
 *   queued → running → done
 *                    ↘ failed
 *   queued → cancelled            (admin / cleanup)
 *   done    → expired             (cron de cleanup)
 *
 * Pattern B — la lógica de transición vive aquí, los adapters solo
 * persisten el snapshot resultante. Crear con `ExportJob.create(...)`
 * y mutar con `markRunning`, `markProgress`, `markDone`, `markFailed`.
 */
export class ExportJob {
  private constructor(
    public readonly id: bigint | null,
    public readonly externalId: string,
    public readonly module: string,
    public readonly format: ExportFormat,
    public readonly requestedByUserId: bigint,
    public readonly requestedByOrganizationId: bigint,
    public readonly filters: Readonly<Record<string, unknown>>,
    private _status: ExportJobStatus,
    private _progress: number,
    private _totalRows: number | null,
    private _rowsDone: number,
    private _storage: ExportJobStorageRef | null,
    private _errorMessage: string | null,
    public readonly createdAt: Date,
    private _startedAt: Date | null,
    private _finishedAt: Date | null,
    public readonly expiresAt: Date,
  ) {}

  static create(input: CreateInput): ExportJob {
    return new ExportJob(
      null,
      input.externalId,
      input.module,
      input.format,
      input.requestedByUserId,
      input.requestedByOrganizationId,
      input.filters,
      'queued',
      0,
      null,
      0,
      null,
      null,
      input.now,
      null,
      null,
      new Date(input.now.getTime() + input.ttlSeconds * 1000),
    );
  }

  static fromSnapshot(snap: ExportJobSnapshot): ExportJob {
    return new ExportJob(
      snap.id,
      snap.externalId,
      snap.module,
      snap.format,
      snap.requestedByUserId,
      snap.requestedByOrganizationId,
      snap.filters,
      snap.status,
      snap.progress,
      snap.totalRows,
      snap.rowsDone,
      snap.storage,
      snap.errorMessage,
      snap.createdAt,
      snap.startedAt,
      snap.finishedAt,
      snap.expiresAt,
    );
  }

  get status(): ExportJobStatus {
    return this._status;
  }
  get progress(): number {
    return this._progress;
  }
  get totalRows(): number | null {
    return this._totalRows;
  }
  get rowsDone(): number {
    return this._rowsDone;
  }
  get storage(): ExportJobStorageRef | null {
    return this._storage;
  }
  get errorMessage(): string | null {
    return this._errorMessage;
  }
  get startedAt(): Date | null {
    return this._startedAt;
  }
  get finishedAt(): Date | null {
    return this._finishedAt;
  }

  markRunning(at: Date): void {
    if (this._status !== 'queued') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'running');
    }
    this._status = 'running';
    this._startedAt = at;
  }

  markProgress(rowsDone: number, totalRows: number | null): void {
    if (this._status !== 'running') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'progress');
    }
    if (rowsDone < 0) {
      throw new DomainError('rowsDone no puede ser negativo', 'EXPORT_JOB_INVALID_PROGRESS');
    }
    this._rowsDone = rowsDone;
    this._totalRows = totalRows;
    if (totalRows !== null && totalRows > 0) {
      const pct = Math.round((rowsDone / totalRows) * 100);
      this._progress = Math.min(99, Math.max(0, pct));
    }
  }

  markDone(storage: ExportJobStorageRef, totalRows: number, at: Date): void {
    if (this._status !== 'running') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'done');
    }
    this._status = 'done';
    this._progress = 100;
    this._rowsDone = totalRows;
    this._totalRows = totalRows;
    this._storage = storage;
    this._finishedAt = at;
    this._errorMessage = null;
  }

  markFailed(errorMessage: string, at: Date): void {
    if (this._status !== 'queued' && this._status !== 'running') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'failed');
    }
    this._status = 'failed';
    this._errorMessage = errorMessage;
    this._finishedAt = at;
  }

  markCancelled(reason: string, at: Date): void {
    if (this._status === 'done' || this._status === 'expired') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'cancelled');
    }
    this._status = 'cancelled';
    this._errorMessage = reason;
    this._finishedAt = at;
  }

  /**
   * Transición disparada por el cron de cleanup. Solo aplica desde `done`.
   * Limpia la referencia al storage (el blob ya fue borrado) — el row queda
   * en BD para auditoría histórica con `status='expired'`.
   */
  markExpired(): void {
    if (this._status !== 'done') {
      throw new ExportJobInvalidTransitionError(this.externalId, this._status, 'expired');
    }
    this._status = 'expired';
    this._storage = null;
  }

  toSnapshot(): ExportJobSnapshot {
    return {
      id: this.id,
      externalId: this.externalId,
      module: this.module,
      format: this.format,
      requestedByUserId: this.requestedByUserId,
      requestedByOrganizationId: this.requestedByOrganizationId,
      filters: this.filters,
      status: this._status,
      progress: this._progress,
      totalRows: this._totalRows,
      rowsDone: this._rowsDone,
      storage: this._storage,
      errorMessage: this._errorMessage,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      expiresAt: this.expiresAt,
    };
  }
}

export class ExportJobInvalidTransitionError extends DomainError {
  readonly externalId: string;
  readonly fromStatus: ExportJobStatus;
  readonly attemptedTransition: string;
  constructor(externalId: string, from: ExportJobStatus, attempted: string) {
    super(
      `Export job ${externalId}: transición inválida desde "${from}" hacia "${attempted}"`,
      'EXPORT_JOB_INVALID_TRANSITION',
    );
    this.externalId = externalId;
    this.fromStatus = from;
    this.attemptedTransition = attempted;
  }
}
