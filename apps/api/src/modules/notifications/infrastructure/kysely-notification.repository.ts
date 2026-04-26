import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { RequestContextService } from '../../../common';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import {
  Notification,
  type NotificationRecipient,
  type NotificationStatus,
  type TransportDriver,
} from '../domain/notification';
import type { NotificationRepositoryPort } from '../ports/notification.repository.port';

const ALL_COLUMNS = [
  'id',
  'externalId',
  'code',
  'recipientsSnapshot',
  'contextSnapshot',
  'status',
  'attempts',
  'lastError',
  'transportDriver',
  'smtpMessageId',
  'acsMessageId',
  'queuedAt',
  'sentAt',
  'failedAt',
  'triggeredByUserId',
  'renderedSubject',
] as const;

@Injectable()
export class KyselyNotificationRepository implements NotificationRepositoryPort {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<DB>,
    private readonly contextService: RequestContextService,
  ) {}

  async save(notification: Notification): Promise<Notification> {
    const snap = notification.toSnapshot();
    return this.runAudited(async (trx) => {
      const row = await trx
        .insertInto('notifications')
        .values({
          code: snap.code,
          recipientsSnapshot: JSON.stringify(
            snap.recipients.map((r) => ({
              email: r.email,
              user_id: r.userId !== null ? r.userId.toString() : null,
            })),
          ),
          contextSnapshot: JSON.stringify(snap.context),
          status: snap.status,
          attempts: snap.attempts,
          transportDriver: snap.transportDriver,
          queuedAt: snap.queuedAt,
          triggeredByUserId:
            snap.triggeredByUserId !== null ? snap.triggeredByUserId.toString() : null,
        })
        .returning(ALL_COLUMNS)
        .executeTakeFirstOrThrow();
      return toEntity(row);
    });
  }

  async persist(notification: Notification): Promise<Notification> {
    const snap = notification.toSnapshot();
    const id = snap.id;
    if (id === null) {
      throw new Error('persist requiere notification con id');
    }
    return this.runAudited(async (trx) => {
      const row = await trx
        .updateTable('notifications')
        .set({
          status: snap.status,
          attempts: snap.attempts,
          lastError: snap.lastError,
          smtpMessageId: snap.smtpMessageId,
          acsMessageId: snap.acsMessageId,
          sentAt: snap.sentAt,
          failedAt: snap.failedAt,
          renderedSubject: snap.renderedSubject,
        })
        .where('id', '=', id.toString())
        .returning(ALL_COLUMNS)
        .executeTakeFirstOrThrow();
      return toEntity(row);
    });
  }

  async findById(id: bigint): Promise<Notification | null> {
    const row = await this.db
      .selectFrom('notifications')
      .select(ALL_COLUMNS)
      .where('id', '=', id.toString())
      .executeTakeFirst();
    return row ? toEntity(row) : null;
  }

  /**
   * SET LOCAL `app.current_user_id` etc — el trigger de auditoría no
   * está enganchado a `notifications` pero el patrón se mantiene
   * consistente con KyselyBlockRepository.
   */
  private async runAudited<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      const ctx = this.contextService.getContext();
      if (ctx?.userId) {
        await sql`SELECT set_config('app.current_user_id', ${ctx.userId.toString()}, true)`.execute(
          trx,
        );
      }
      if (ctx?.organizationId) {
        await sql`SELECT set_config('app.current_org_id', ${ctx.organizationId.toString()}, true)`.execute(
          trx,
        );
      }
      if (ctx?.requestId) {
        await sql`SELECT set_config('app.request_id', ${ctx.requestId}, true)`.execute(trx);
      }
      return fn(trx);
    });
  }
}

interface RecipientJson {
  email: string;
  user_id?: string | null;
}

interface NotificationRow {
  id: string | bigint;
  externalId: string;
  code: string;
  recipientsSnapshot: unknown;
  contextSnapshot: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  transportDriver: string;
  smtpMessageId: string | null;
  acsMessageId: string | null;
  queuedAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  triggeredByUserId: string | bigint | null;
  renderedSubject: string | null;
}

function toEntity(row: NotificationRow): Notification {
  if (!isStatus(row.status)) {
    throw new Error(`status inesperado en BD: ${row.status}`);
  }
  if (!isTransport(row.transportDriver)) {
    throw new Error(`transport_driver inesperado: ${row.transportDriver}`);
  }
  const recipients: NotificationRecipient[] = parseRecipients(row.recipientsSnapshot);
  const context = parseContext(row.contextSnapshot);

  return Notification.fromSnapshot({
    id: BigInt(row.id),
    externalId: row.externalId,
    code: row.code,
    recipients,
    context,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    transportDriver: row.transportDriver,
    smtpMessageId: row.smtpMessageId,
    acsMessageId: row.acsMessageId,
    queuedAt: new Date(row.queuedAt),
    sentAt: row.sentAt ? new Date(row.sentAt) : null,
    failedAt: row.failedAt ? new Date(row.failedAt) : null,
    triggeredByUserId: row.triggeredByUserId !== null ? BigInt(row.triggeredByUserId) : null,
    renderedSubject: row.renderedSubject,
  });
}

function isStatus(s: string): s is NotificationStatus {
  return ['queued', 'sending', 'sent', 'failed', 'cancelled'].includes(s);
}

function isTransport(t: string): t is TransportDriver {
  return t === 'local' || t === 'azure_acs';
}

function parseRecipients(raw: unknown): NotificationRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is RecipientJson => typeof r === 'object' && r !== null && 'email' in r)
    .map((r) => ({
      email: r.email,
      userId: r.user_id !== undefined && r.user_id !== null ? BigInt(r.user_id) : null,
    }));
}

function parseContext(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return {};
  return raw as Record<string, unknown>;
}
