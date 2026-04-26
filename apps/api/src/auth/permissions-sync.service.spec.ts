import { Test } from '@nestjs/testing';
import { DATABASE } from '../database/database.token';
import { PermissionsSyncService } from './permissions-sync.service';
import { PERMISSIONS_CATALOG } from './permissions.catalog';

// Helper: builder mockable de Kysely. No usamos jest.Mocked<Kysely<DB>>
// porque el query builder es una cadena fluent compleja; en su lugar,
// stubbeamos cada chain root que el sync usa.
interface SyncedRow {
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  isSensitive: boolean;
}

function makeDbMock(initialRows: SyncedRow[]): {
  db: unknown;
  inserts: SyncedRow[];
  updates: { code: string; patch: Partial<SyncedRow> }[];
} {
  const inserts: SyncedRow[] = [];
  const updates: { code: string; patch: Partial<SyncedRow> }[] = [];

  const selectChain = {
    select: () => selectChain,
    execute: () => Promise.resolve(initialRows),
  };

  const insertChain = {
    values: (row: SyncedRow) => {
      inserts.push(row);
      return insertChain;
    },
    onConflict: () => insertChain,
    execute: () => Promise.resolve(),
  };

  const updateChain = (table: string) => {
    let pendingPatch: Partial<SyncedRow> = {};
    let pendingCode = '';
    const chain = {
      set: (patch: Partial<SyncedRow>) => {
        pendingPatch = patch;
        return chain;
      },
      where: (_col: string, _op: string, code: string) => {
        pendingCode = code;
        return chain;
      },
      execute: () => {
        updates.push({ code: pendingCode, patch: pendingPatch });
        return Promise.resolve();
      },
    };
    void table;
    return chain;
  };

  const db = {
    selectFrom: () => selectChain,
    insertInto: () => insertChain,
    updateTable: (t: string) => updateChain(t),
  };

  return { db, inserts, updates };
}

describe('PermissionsSyncService', () => {
  it('inserta todos los permisos cuando la BD está vacía', async () => {
    const { db, inserts, updates } = makeDbMock([]);
    const moduleRef = await Test.createTestingModule({
      providers: [PermissionsSyncService, { provide: DATABASE, useValue: db }],
    }).compile();

    const service = moduleRef.get(PermissionsSyncService);
    const result = await service.sync();

    expect(result.inserted).toBe(PERMISSIONS_CATALOG.length);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.orphan).toBe(0);
    expect(inserts.length).toBe(PERMISSIONS_CATALOG.length);
    expect(updates.length).toBe(0);
  });

  it('marca todo unchanged cuando BD coincide con catálogo', async () => {
    const initial: SyncedRow[] = PERMISSIONS_CATALOG.map((p) => ({
      code: p.code,
      module: p.module,
      resource: p.resource,
      action: p.action,
      description: p.description,
      isSensitive: p.isSensitive,
    }));
    const { db, inserts, updates } = makeDbMock(initial);
    const moduleRef = await Test.createTestingModule({
      providers: [PermissionsSyncService, { provide: DATABASE, useValue: db }],
    }).compile();

    const result = await moduleRef.get(PermissionsSyncService).sync();

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(PERMISSIONS_CATALOG.length);
    expect(result.orphan).toBe(0);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('actualiza permisos con drift (description distinta)', async () => {
    const target = PERMISSIONS_CATALOG[0];
    if (!target) throw new Error('catalog vacío — imposible');
    const initial: SyncedRow[] = PERMISSIONS_CATALOG.map((p) => ({
      code: p.code,
      module: p.module,
      resource: p.resource,
      action: p.action,
      description: p.code === target.code ? 'descripción vieja' : p.description,
      isSensitive: p.isSensitive,
    }));
    const { db, inserts, updates } = makeDbMock(initial);
    const result = await Test.createTestingModule({
      providers: [PermissionsSyncService, { provide: DATABASE, useValue: db }],
    })
      .compile()
      .then((m) => m.get(PermissionsSyncService).sync());

    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(PERMISSIONS_CATALOG.length - 1);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.code).toBe(target.code);
    expect(updates[0]?.patch.description).toBe(target.description);
    expect(inserts).toHaveLength(0);
  });

  it('detecta permisos huérfanos (en BD, no en código) sin borrarlos', async () => {
    const initial: SyncedRow[] = [
      ...PERMISSIONS_CATALOG.map((p) => ({
        code: p.code,
        module: p.module,
        resource: p.resource,
        action: p.action,
        description: p.description,
        isSensitive: p.isSensitive,
      })),
      {
        code: 'legacy.deprecated.read',
        module: 'legacy',
        resource: 'deprecated',
        action: 'read',
        description: 'Permiso retirado del catálogo',
        isSensitive: false,
      },
    ];
    const { db, inserts, updates } = makeDbMock(initial);
    const result = await Test.createTestingModule({
      providers: [PermissionsSyncService, { provide: DATABASE, useValue: db }],
    })
      .compile()
      .then((m) => m.get(PermissionsSyncService).sync());

    expect(result.orphan).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
