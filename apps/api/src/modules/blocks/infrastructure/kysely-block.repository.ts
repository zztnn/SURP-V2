import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { RequestContextService } from '../../../common';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import { Block, type BlockTargetType } from '../domain/block';
import type {
  BlockListFilters,
  BlockListPage,
  BlockRepositoryPort,
} from '../ports/block.repository.port';

const SELECT_COLUMNS = [
  'id',
  'externalId',
  'targetType',
  'targetId',
  'reason',
  'active',
  'grantedAt',
  'grantedByUserId',
  'revokedAt',
  'revokedByUserId',
  'revokeReason',
  'linkedIncidentId',
] as const;

@Injectable()
export class KyselyBlockRepository implements BlockRepositoryPort {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<DB>,
    private readonly contextService: RequestContextService,
  ) {}

  async findById(id: bigint): Promise<Block | null> {
    const row = await this.db
      .selectFrom('blocks')
      .select(SELECT_COLUMNS)
      .where('id', '=', id.toString())
      .executeTakeFirst();
    return row ? toEntity(row) : null;
  }

  async findActiveByTarget(targetType: BlockTargetType, targetId: bigint): Promise<Block | null> {
    const row = await this.db
      .selectFrom('blocks')
      .select(SELECT_COLUMNS)
      .where('targetType', '=', targetType)
      .where('targetId', '=', targetId.toString())
      .where('active', '=', true)
      .executeTakeFirst();
    return row ? toEntity(row) : null;
  }

  async findPaginated(
    filters: BlockListFilters,
    page: number,
    pageSize: number,
  ): Promise<BlockListPage> {
    let query = this.db.selectFrom('blocks');
    if (filters.targetType !== undefined) {
      query = query.where('targetType', '=', filters.targetType);
    }
    if (filters.active !== undefined) {
      query = query.where('active', '=', filters.active);
    }
    const totalRow = await query
      .select((eb) => eb.fn.countAll<string>().as('cnt'))
      .executeTakeFirstOrThrow();
    const total = Number(totalRow.cnt);
    const offset = (page - 1) * pageSize;
    const rows = await query
      .select(SELECT_COLUMNS)
      .orderBy('grantedAt', 'desc')
      .limit(pageSize)
      .offset(offset)
      .execute();
    return {
      page,
      pageSize,
      total,
      items: rows.map(toEntity),
    };
  }

  async save(block: Block): Promise<Block> {
    const snap = block.toSnapshot();
    return this.runAudited(async (trx) => {
      const row = await trx
        .insertInto('blocks')
        .values({
          targetType: snap.targetType,
          targetId: snap.targetId.toString(),
          reason: snap.reason,
          active: snap.active,
          grantedAt: snap.grantedAt,
          grantedByUserId: snap.grantedByUserId.toString(),
          linkedIncidentId:
            snap.linkedIncidentId !== null ? snap.linkedIncidentId.toString() : null,
          // created_by_id es NOT NULL — usa el grantor como creator.
          createdById: snap.grantedByUserId.toString(),
          updatedById: snap.grantedByUserId.toString(),
        })
        .returning(SELECT_COLUMNS)
        .executeTakeFirstOrThrow();
      return toEntity(row);
    });
  }

  async persist(block: Block): Promise<Block> {
    const snap = block.toSnapshot();
    const id = snap.id;
    if (id === null) {
      throw new Error('persist requiere block con id (usar save para nuevos)');
    }
    return this.runAudited(async (trx) => {
      const row = await trx
        .updateTable('blocks')
        .set({
          active: snap.active,
          revokedAt: snap.revokedAt,
          revokedByUserId: snap.revokedByUserId !== null ? snap.revokedByUserId.toString() : null,
          revokeReason: snap.revokeReason,
          updatedById: snap.revokedByUserId !== null ? snap.revokedByUserId.toString() : null,
        })
        .where('id', '=', id.toString())
        .returning(SELECT_COLUMNS)
        .executeTakeFirstOrThrow();
      return toEntity(row);
    });
  }

  /**
   * Envuelve la mutación en una transacción y setea los GUCs que el
   * trigger genérico `fn_audit_row_changes` (database/schema/05_audit.sql)
   * lee para hidratar `audit_logs.user_id / organization_id / request_id /
   * ip / user_agent`.
   *
   * Nombres de GUC EXACTOS según `fn_current_user_id` / `fn_current_org_id`:
   *   - app.current_user_id   (NO app.user_id)
   *   - app.current_org_id    (NO app.organization_id)
   *   - app.request_id
   *   - app.current_ip
   *   - app.current_user_agent
   *
   * `set_config(..., true)` aplica solo a la transacción actual, así que
   * cada mutación queda con su propio actor sin contaminar el pool.
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
      if (ctx?.ip) {
        await sql`SELECT set_config('app.current_ip', ${ctx.ip}, true)`.execute(trx);
      }
      if (ctx?.userAgent) {
        await sql`SELECT set_config('app.current_user_agent', ${ctx.userAgent}, true)`.execute(trx);
      }
      return fn(trx);
    });
  }
}

interface BlockRow {
  id: string | bigint;
  externalId: string;
  targetType: string;
  targetId: string | bigint;
  reason: string;
  active: boolean;
  grantedAt: Date;
  grantedByUserId: string | bigint;
  revokedAt: Date | null;
  revokedByUserId: string | bigint | null;
  revokeReason: string | null;
  linkedIncidentId: string | bigint | null;
}

function toEntity(row: BlockRow): Block {
  if (row.targetType !== 'party' && row.targetType !== 'vehicle') {
    throw new Error(`targetType inesperado en BD: ${row.targetType}`);
  }
  return Block.fromSnapshot({
    id: BigInt(row.id),
    externalId: row.externalId,
    targetType: row.targetType,
    targetId: BigInt(row.targetId),
    reason: row.reason,
    active: row.active,
    grantedAt: new Date(row.grantedAt),
    grantedByUserId: BigInt(row.grantedByUserId),
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
    revokedByUserId: row.revokedByUserId !== null ? BigInt(row.revokedByUserId) : null,
    revokeReason: row.revokeReason,
    linkedIncidentId: row.linkedIncidentId !== null ? BigInt(row.linkedIncidentId) : null,
  });
}
