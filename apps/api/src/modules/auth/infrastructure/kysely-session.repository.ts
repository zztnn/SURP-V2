import { Inject, Injectable } from '@nestjs/common';
import { type Kysely } from 'kysely';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import {
  Session,
  type SessionDeviceType,
  type SessionRevokeReason,
  type SessionRow,
} from '../domain/session';
import type {
  CreateSessionInput,
  RotateRefreshInput,
  SessionRepositoryPort,
} from '../ports/session.repository.port';

const SELECT_COLUMNS = [
  'id',
  'externalId',
  'userId',
  'refreshTokenHash',
  'ip',
  'userAgent',
  'issuedAt',
  'lastRefreshedAt',
  'expiresAt',
  'revokedAt',
  'revokeReason',
  'deviceLabel',
  'deviceType',
  'locationLabel',
] as const;

@Injectable()
export class KyselySessionRepository implements SessionRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const row = await this.db
      .insertInto('userSessions')
      .values({
        userId: input.userId.toString(),
        refreshTokenHash: input.refreshTokenHash,
        ip: input.ip,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
        deviceLabel: input.deviceLabel,
        deviceType: input.deviceType,
        locationLabel: input.locationLabel,
      })
      .returning(SELECT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toEntity(row);
  }

  async findByRefreshHash(refreshHash: string): Promise<Session | null> {
    const row = await this.db
      .selectFrom('userSessions')
      .select(SELECT_COLUMNS)
      .where('refreshTokenHash', '=', refreshHash)
      .executeTakeFirst();
    if (!row) return null;
    return toEntity(row);
  }

  async rotateRefresh(input: RotateRefreshInput): Promise<Session> {
    return this.db.transaction().execute(async (trx) => {
      // Idempotente: solo revoca si aún no estaba revocada (evita
      // pisar revoke_reason cuando hay race entre dos refresh).
      await trx
        .updateTable('userSessions')
        .set({ revokedAt: new Date(), revokeReason: 'rotation' })
        .where('id', '=', input.oldSessionId.toString())
        .where('revokedAt', 'is', null)
        .execute();

      // Preservamos los labels de dispositivo de la sesión vieja —
      // el device es el mismo aunque la IP del request rotador
      // difiera momentáneamente (móvil saltando entre Wi-Fi y 4G).
      const oldRow = await trx
        .selectFrom('userSessions')
        .select(['userId', 'deviceLabel', 'deviceType', 'locationLabel'])
        .where('id', '=', input.oldSessionId.toString())
        .executeTakeFirstOrThrow();

      const newRow = await trx
        .insertInto('userSessions')
        .values({
          userId: oldRow.userId,
          refreshTokenHash: input.newRefreshTokenHash,
          ip: input.ip,
          userAgent: input.userAgent,
          expiresAt: input.newExpiresAt,
          deviceLabel: oldRow.deviceLabel,
          deviceType: oldRow.deviceType,
          locationLabel: oldRow.locationLabel,
        })
        .returning(SELECT_COLUMNS)
        .executeTakeFirstOrThrow();

      return toEntity(newRow);
    });
  }

  async revoke(sessionId: bigint, reason: SessionRevokeReason, at: Date): Promise<void> {
    await this.db
      .updateTable('userSessions')
      .set({ revokedAt: at, revokeReason: reason })
      .where('id', '=', sessionId.toString())
      .where('revokedAt', 'is', null)
      .execute();
  }

  async revokeAllForUser(userId: bigint, reason: SessionRevokeReason, at: Date): Promise<number> {
    const result = await this.db
      .updateTable('userSessions')
      .set({ revokedAt: at, revokeReason: reason })
      .where('userId', '=', userId.toString())
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async findActiveByUserId(userId: bigint, now: Date): Promise<Session[]> {
    const rows = await this.db
      .selectFrom('userSessions')
      .select(SELECT_COLUMNS)
      .where('userId', '=', userId.toString())
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', now)
      .orderBy('lastRefreshedAt', 'desc')
      .execute();
    return rows.map(toEntity);
  }

  async revokeByExternalIdForUser(
    externalId: string,
    userId: bigint,
    reason: SessionRevokeReason,
    at: Date,
  ): Promise<boolean> {
    // Filtra por userId para evitar que un usuario revoque sesiones
    // ajenas y para no filtrar la existencia de external_ids ajenos
    // (devolvemos false uniforme).
    const result = await this.db
      .updateTable('userSessions')
      .set({ revokedAt: at, revokeReason: reason })
      .where('externalId', '=', externalId)
      .where('userId', '=', userId.toString())
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}

function toEntity(row: {
  id: string | bigint;
  externalId: string;
  userId: string | bigint;
  refreshTokenHash: string;
  ip: string;
  userAgent: string | null;
  issuedAt: Date;
  lastRefreshedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  deviceLabel: string | null;
  deviceType: string | null;
  locationLabel: string | null;
}): Session {
  const r: SessionRow = {
    id: BigInt(row.id),
    externalId: row.externalId,
    userId: BigInt(row.userId),
    refreshTokenHash: row.refreshTokenHash,
    ip: row.ip,
    userAgent: row.userAgent,
    issuedAt: new Date(row.issuedAt),
    lastRefreshedAt: new Date(row.lastRefreshedAt),
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
    revokeReason: (row.revokeReason as SessionRevokeReason | null) ?? null,
    deviceLabel: row.deviceLabel,
    deviceType: (row.deviceType as SessionDeviceType | null) ?? null,
    locationLabel: row.locationLabel,
  };
  return new Session(
    r.id,
    r.externalId,
    r.userId,
    r.refreshTokenHash,
    r.ip,
    r.userAgent,
    r.issuedAt,
    r.lastRefreshedAt,
    r.expiresAt,
    r.revokedAt,
    r.revokeReason,
    r.deviceLabel,
    r.deviceType,
    r.locationLabel,
  );
}
