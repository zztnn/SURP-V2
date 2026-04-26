import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Kysely } from 'kysely';
import { DATABASE } from '../database/database.token';
import type { DB } from '../database/generated/database.types';
import { PERMISSIONS_CATALOG } from './permissions.catalog';

/**
 * Reconcilia el catálogo de permisos en código (`PERMISSIONS_CATALOG`)
 * con la tabla `permissions` de la BD al arranque.
 *
 *   - INSERT permisos faltantes.
 *   - UPDATE description/is_sensitive/module/resource/action si cambiaron.
 *   - NUNCA borra permisos extra: un permiso huérfano (en BD, no en código)
 *     queda; lo logueamos como WARN para revisión manual. Borrarlo
 *     automáticamente sería catastrófico — los `role_permissions` apuntan
 *     a él y arrastraría con `ON DELETE CASCADE` los grants.
 *
 * Este sync corre en API y worker (ambos arrancan AppModule). Es
 * idempotente — múltiples arranques en paralelo no se pisan (ON CONFLICT).
 */
@Injectable()
export class PermissionsSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async onModuleInit(): Promise<void> {
    const result = await this.sync();
    this.logger.log(
      `Permisos sincronizados — inserted=${String(result.inserted)} updated=${String(result.updated)} unchanged=${String(result.unchanged)} orphan=${String(result.orphan)}`,
    );
    if (result.orphan > 0) {
      this.logger.warn(
        `${String(result.orphan)} permisos en BD sin contraparte en código — revisar PERMISSIONS_CATALOG`,
      );
    }
  }

  async sync(): Promise<SyncResult> {
    const dbRows = await this.db
      .selectFrom('permissions')
      .select(['code', 'module', 'resource', 'action', 'description', 'isSensitive'])
      .execute();

    const byCode = new Map(dbRows.map((r) => [r.code, r]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const def of PERMISSIONS_CATALOG) {
      const existing = byCode.get(def.code);

      if (!existing) {
        await this.db
          .insertInto('permissions')
          .values({
            code: def.code,
            module: def.module,
            resource: def.resource,
            action: def.action,
            description: def.description,
            isSensitive: def.isSensitive,
          })
          .onConflict((oc) => oc.column('code').doNothing())
          .execute();
        inserted += 1;
        continue;
      }

      const drift =
        existing.module !== def.module ||
        existing.resource !== def.resource ||
        existing.action !== def.action ||
        existing.description !== def.description ||
        existing.isSensitive !== def.isSensitive;

      if (drift) {
        await this.db
          .updateTable('permissions')
          .set({
            module: def.module,
            resource: def.resource,
            action: def.action,
            description: def.description,
            isSensitive: def.isSensitive,
          })
          .where('code', '=', def.code)
          .execute();
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    const codesInCatalog = new Set(PERMISSIONS_CATALOG.map((p) => p.code));
    const orphanCodes = dbRows.map((r) => r.code).filter((c) => !codesInCatalog.has(c));
    if (orphanCodes.length > 0) {
      this.logger.warn(`Permisos huérfanos: ${orphanCodes.join(', ')}`);
    }

    return {
      inserted,
      updated,
      unchanged,
      orphan: orphanCodes.length,
    };
  }
}

export interface SyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  orphan: number;
}
