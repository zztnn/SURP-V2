import { DomainError } from '../../../common';

export type NotificationStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type TransportDriver = 'local' | 'azure_acs';

export interface NotificationRecipient {
  email: string;
  userId: bigint | null;
}

export interface NotificationSnapshot {
  readonly id: bigint | null;
  readonly externalId: string | null;
  readonly code: string;
  readonly recipients: readonly NotificationRecipient[];
  readonly context: Readonly<Record<string, unknown>>;
  readonly status: NotificationStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly transportDriver: TransportDriver;
  readonly smtpMessageId: string | null;
  readonly acsMessageId: string | null;
  readonly queuedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly triggeredByUserId: bigint | null;
  readonly renderedSubject: string | null;
}

/**
 * Notificación encolada/enviada. Una vez creada, los campos `code`,
 * `recipients` y `context` son inmutables (lo enforce un trigger PG).
 *
 * State machine:
 *   queued → sending → sent
 *                    \→ failed   (+ retry: sent o failed final)
 *   queued → cancelled (admin)
 *
 * Las transiciones se aplican vía métodos `markSending()`,
 * `markSent()`, `markFailed()`. La capa de persistencia llama
 * `repo.persist(notification)` después de cada transición.
 */
export class Notification {
  private constructor(
    public readonly id: bigint | null,
    public readonly externalId: string | null,
    public readonly code: string,
    public readonly recipients: readonly NotificationRecipient[],
    public readonly context: Readonly<Record<string, unknown>>,
    private _status: NotificationStatus,
    private _attempts: number,
    private _lastError: string | null,
    public readonly transportDriver: TransportDriver,
    private _smtpMessageId: string | null,
    private _acsMessageId: string | null,
    public readonly queuedAt: Date,
    private _sentAt: Date | null,
    private _failedAt: Date | null,
    public readonly triggeredByUserId: bigint | null,
    private _renderedSubject: string | null,
  ) {}

  static enqueue(input: {
    code: string;
    recipients: readonly NotificationRecipient[];
    context: Record<string, unknown>;
    transportDriver: TransportDriver;
    queuedAt: Date;
    triggeredByUserId: bigint | null;
  }): Notification {
    if (input.code.trim().length === 0) {
      throw new DomainError('code requerido', 'NOTIFICATION_CODE_REQUIRED');
    }
    if (input.recipients.length === 0) {
      throw new DomainError('recipients no puede estar vacío', 'NOTIFICATION_RECIPIENTS_EMPTY');
    }
    for (const r of input.recipients) {
      if (!isValidEmail(r.email)) {
        throw new DomainError(`recipient email inválido: ${r.email}`, 'NOTIFICATION_INVALID_EMAIL');
      }
    }
    return new Notification(
      null,
      null,
      input.code,
      input.recipients,
      input.context,
      'queued',
      0,
      null,
      input.transportDriver,
      null,
      null,
      input.queuedAt,
      null,
      null,
      input.triggeredByUserId,
      null,
    );
  }

  static fromSnapshot(s: NotificationSnapshot): Notification {
    return new Notification(
      s.id,
      s.externalId,
      s.code,
      s.recipients,
      s.context,
      s.status,
      s.attempts,
      s.lastError,
      s.transportDriver,
      s.smtpMessageId,
      s.acsMessageId,
      s.queuedAt,
      s.sentAt,
      s.failedAt,
      s.triggeredByUserId,
      s.renderedSubject,
    );
  }

  get status(): NotificationStatus {
    return this._status;
  }
  get attempts(): number {
    return this._attempts;
  }
  get lastError(): string | null {
    return this._lastError;
  }
  get smtpMessageId(): string | null {
    return this._smtpMessageId;
  }
  get acsMessageId(): string | null {
    return this._acsMessageId;
  }
  get sentAt(): Date | null {
    return this._sentAt;
  }
  get failedAt(): Date | null {
    return this._failedAt;
  }
  get renderedSubject(): string | null {
    return this._renderedSubject;
  }

  /** Pasa a sending tras leer de la cola. Incrementa attempts. */
  markSending(): void {
    if (this._status !== 'queued' && this._status !== 'failed') {
      throw new DomainError(
        `No se puede pasar a sending desde status=${this._status}`,
        'NOTIFICATION_INVALID_TRANSITION',
      );
    }
    this._status = 'sending';
    this._attempts += 1;
  }

  markSent(at: Date, params: { smtpMessageId?: string; acsMessageId?: string }): void {
    if (this._status !== 'sending') {
      throw new DomainError(
        `No se puede pasar a sent desde status=${this._status}`,
        'NOTIFICATION_INVALID_TRANSITION',
      );
    }
    this._status = 'sent';
    this._sentAt = at;
    this._lastError = null;
    if (params.smtpMessageId !== undefined) this._smtpMessageId = params.smtpMessageId;
    if (params.acsMessageId !== undefined) this._acsMessageId = params.acsMessageId;
  }

  markFailed(at: Date, error: string): void {
    if (this._status !== 'sending') {
      throw new DomainError(
        `No se puede pasar a failed desde status=${this._status}`,
        'NOTIFICATION_INVALID_TRANSITION',
      );
    }
    this._status = 'failed';
    this._failedAt = at;
    this._lastError = error.length > 2000 ? error.slice(0, 2000) : error;
  }

  /**
   * Si el render falla antes de enviar, podemos guardar el subject para
   * debug (Ley 21.719: NO guardamos el body — solo subject).
   */
  recordRenderedSubject(subject: string): void {
    this._renderedSubject = subject;
  }

  toSnapshot(): NotificationSnapshot {
    return {
      id: this.id,
      externalId: this.externalId,
      code: this.code,
      recipients: this.recipients,
      context: this.context,
      status: this._status,
      attempts: this._attempts,
      lastError: this._lastError,
      transportDriver: this.transportDriver,
      smtpMessageId: this._smtpMessageId,
      acsMessageId: this._acsMessageId,
      queuedAt: this.queuedAt,
      sentAt: this._sentAt,
      failedAt: this._failedAt,
      triggeredByUserId: this.triggeredByUserId,
      renderedSubject: this._renderedSubject,
    };
  }
}

function isValidEmail(email: string): boolean {
  // Validación pragmática (no exhaustiva — el SMTP final lo valida).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
