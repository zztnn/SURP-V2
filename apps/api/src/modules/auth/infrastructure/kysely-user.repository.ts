import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import { AuthenticatedUser } from '../domain/authenticated-user';
import type { LoginAttempt, LoginOutcome } from '../domain/login-attempt';
import type {
  LoginAttemptRecord,
  UserRepositoryPort,
  UserWithPermissions,
} from '../ports/user.repository.port';

@Injectable()
export class KyselyUserRepository implements UserRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async findByEmail(email: string): Promise<AuthenticatedUser | null> {
    const row = await this.db
      .selectFrom('users')
      .select([
        'id',
        'externalId',
        'organizationId',
        'email',
        'displayName',
        'passwordHash',
        'mustResetPassword',
        'mfaRequired',
        'mfaEnrolled',
        'active',
        'lockedUntil',
      ])
      .where('email', '=', email)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) return null;

    return new AuthenticatedUser(
      BigInt(row.id),
      row.externalId,
      BigInt(row.organizationId),
      row.email,
      row.displayName,
      row.passwordHash,
      row.mustResetPassword,
      row.mfaRequired,
      row.mfaEnrolled,
      row.active,
      row.lockedUntil ? new Date(row.lockedUntil) : null,
    );
  }

  async findByIdWithPermissions(userId: bigint): Promise<UserWithPermissions | null> {
    const userRow = await this.db
      .selectFrom('users')
      .select([
        'id',
        'externalId',
        'organizationId',
        'email',
        'displayName',
        'active',
        'mustResetPassword',
        'mfaRequired',
        'mfaEnrolled',
      ])
      .where('id', '=', userId.toString())
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!userRow) return null;

    const roleRows = await this.db
      .selectFrom('userRoles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .select(['r.name'])
      .where('ur.userId', '=', userId.toString())
      .where('r.active', '=', true)
      .where('r.deletedAt', 'is', null)
      .execute();

    const permRows = await this.db
      .selectFrom('userRoles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .innerJoin('rolePermissions as rp', 'rp.roleId', 'r.id')
      .innerJoin('permissions as p', 'p.id', 'rp.permissionId')
      .select(['p.code'])
      .where('ur.userId', '=', userId.toString())
      .where('r.active', '=', true)
      .where('r.deletedAt', 'is', null)
      .distinct()
      .orderBy('p.code')
      .execute();

    return {
      id: BigInt(userRow.id),
      externalId: userRow.externalId,
      organizationId: BigInt(userRow.organizationId),
      email: userRow.email,
      displayName: userRow.displayName,
      active: userRow.active,
      mustResetPassword: userRow.mustResetPassword,
      mfaRequired: userRow.mfaRequired,
      mfaEnrolled: userRow.mfaEnrolled,
      permissions: permRows.map((r) => r.code),
      roles: roleRows.map((r) => r.name),
    };
  }

  async registerLoginAttempt(attempt: LoginAttempt): Promise<void> {
    await this.db
      .insertInto('userLoginAttempts')
      .values({
        userId: attempt.userId !== null ? attempt.userId.toString() : null,
        emailAttempted: attempt.emailAttempted,
        ip: attempt.ip,
        userAgent: attempt.userAgent,
        outcome: attempt.outcome,
        mfaUsed: attempt.mfaUsed,
      })
      .execute();
  }

  async countRecentFailures(userId: bigint, sinceMinutesAgo: number): Promise<number> {
    const row = await this.db
      .selectFrom('userLoginAttempts')
      .select(({ fn }) => fn.countAll<string>().as('cnt'))
      .where('userId', '=', userId.toString())
      .where('outcome', 'in', ['bad_password', 'mfa_failed'])
      .where('attemptedAt', '>=', sql<Date>`now() - make_interval(mins => ${sinceMinutesAgo})`)
      .executeTakeFirstOrThrow();
    return Number(row.cnt);
  }

  async lockUser(userId: bigint, until: Date): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ lockedUntil: until })
      .where('id', '=', userId.toString())
      .execute();
  }

  async touchLastLogin(userId: bigint, ip: string, at: Date): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ lastLoginAt: at, lastLoginIp: ip })
      .where('id', '=', userId.toString())
      .execute();
  }

  async findRecentLoginAttempts(userId: bigint, limit: number): Promise<LoginAttemptRecord[]> {
    const rows = await this.db
      .selectFrom('userLoginAttempts')
      .select(['outcome', 'mfaUsed', 'ip', 'userAgent', 'attemptedAt'])
      .where('userId', '=', userId.toString())
      .orderBy('attemptedAt', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      outcome: row.outcome as LoginOutcome,
      mfaUsed: row.mfaUsed,
      ip: typeof row.ip === 'string' ? row.ip : String(row.ip),
      userAgent: row.userAgent,
      attemptedAt: new Date(row.attemptedAt),
    }));
  }
}
