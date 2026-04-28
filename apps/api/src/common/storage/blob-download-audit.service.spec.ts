import type { Kysely } from 'kysely';

import type { DB } from '../../database/generated/database.types';

import { BlobDownloadAuditService } from './blob-download-audit.service';
import { SURP_CONTAINERS } from './storage.types';

interface InsertedAuditRow {
  source: string;
  action: string;
  userId: string | bigint | null;
  organizationId: string | bigint | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  entityTable: string | null;
  entityId?: string | bigint | null;
  entityExternalId?: string | null;
  metadata: string;
}

describe('BlobDownloadAuditService', () => {
  let inserts: InsertedAuditRow[];
  let exportJobLookup: jest.Mock;
  let service: BlobDownloadAuditService;

  beforeEach(() => {
    inserts = [];
    exportJobLookup = jest.fn();

    const fakeDb = {
      selectFrom: (_: 'exportJobs') => {
        return {
          select: (_cols: string[]) => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: () => exportJobLookup() as Promise<unknown>,
              }),
            }),
          }),
        };
      },
      insertInto: (_: 'auditLogs') => {
        return {
          values: (row: InsertedAuditRow) => ({
            execute: () => {
              inserts.push(row);
              return Promise.resolve();
            },
          }),
        };
      },
    };

    service = new BlobDownloadAuditService(fakeDb as unknown as Kysely<DB>);
  });

  it('escribe audit con user/org del export job para container reports', async () => {
    exportJobLookup.mockResolvedValueOnce({
      id: '42',
      externalId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      requestedByUserId: '7',
      requestedByOrganizationId: '3',
      filename: 'incidents-2026-04-28.xlsx',
      fileSizeBytes: '12345',
      module: 'incidents',
    });

    await service.recordDownload({
      container: SURP_CONTAINERS.REPORTS,
      key: 'incidents/7/2026/04/uuid-name.xlsx',
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: '11111111-2222-3333-4444-555555555555',
    });

    expect(inserts).toHaveLength(1);
    const row = inserts[0];
    if (!row) throw new Error('expected an insert');
    expect(row.source).toBe('sensitive_read');
    expect(row.action).toBe('incident_export_download');
    expect(row.userId).toBe('7');
    expect(row.organizationId).toBe('3');
    expect(row.entityTable).toBe('export_jobs');
    expect(row.entityId).toBe('42');
    expect(row.entityExternalId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(row.requestId).toBe('11111111-2222-3333-4444-555555555555');
    expect(row.ip).toBe('10.0.0.1');
    const metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    expect(metadata['filename']).toBe('incidents-2026-04-28.xlsx');
    expect(metadata['fileSizeBytes']).toBe(12345);
  });

  it('escribe registro unmatched cuando no hay export_job para el (container,key)', async () => {
    exportJobLookup.mockResolvedValueOnce(undefined);

    await service.recordDownload({
      container: SURP_CONTAINERS.REPORTS,
      key: 'incidents/0/2026/04/orphan.xlsx',
      ip: '127.0.0.1',
      userAgent: null,
      requestId: null,
    });

    expect(inserts).toHaveLength(1);
    const row = inserts[0];
    if (!row) throw new Error('expected an insert');
    expect(row.action).toBe('blob_download_unmatched');
    expect(row.userId).toBeNull();
    expect(row.entityTable).toBe('export_jobs');
  });

  it('descarta requestId que no es UUID válido', async () => {
    exportJobLookup.mockResolvedValueOnce(undefined);

    await service.recordDownload({
      container: SURP_CONTAINERS.REPORTS,
      key: 'foo',
      ip: null,
      userAgent: null,
      requestId: 'not-a-uuid',
    });

    const r = inserts[0];
    if (!r) throw new Error('expected an insert');
    expect(r.requestId).toBeNull();
  });

  it('no auditar cuando container no es REPORTS (warning interno, sin insert)', async () => {
    await service.recordDownload({
      container: SURP_CONTAINERS.EVIDENCE,
      key: 'incidents/1/foo.jpg',
      ip: null,
      userAgent: null,
      requestId: null,
    });

    expect(inserts).toHaveLength(0);
    expect(exportJobLookup).not.toHaveBeenCalled();
  });

  it('no propaga errores del DB — log y retorna', async () => {
    exportJobLookup.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.recordDownload({
        container: SURP_CONTAINERS.REPORTS,
        key: 'x',
        ip: null,
        userAgent: null,
        requestId: null,
      }),
    ).resolves.toBeUndefined();

    expect(inserts).toHaveLength(0);
  });
});
