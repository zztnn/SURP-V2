import { Test } from '@nestjs/testing';

import { CLOCK } from '../../../../common';
import { STORAGE } from '../../../../common/storage';
import { ExportJob } from '../domain/export-job';
import { EXPORT_JOB_REPOSITORY } from '../ports/export-job.repository.port';
import { ExpireDoneExportsUseCase } from './expire-done-exports.use-case';

const NOW = new Date('2026-04-28T12:00:00Z');
const PAST = new Date('2026-04-20T12:00:00Z');

function makeDoneJob(overrides?: { container?: string; key?: string }): ExportJob {
  // Construyo un job en estado `done` directamente desde snapshot.
  return ExportJob.fromSnapshot({
    id: 1n,
    externalId: '11111111-1111-1111-1111-111111111111',
    module: 'incidents',
    format: 'xlsx',
    requestedByUserId: 100n,
    requestedByOrganizationId: 1n,
    filters: {},
    status: 'done',
    progress: 100,
    totalRows: 10,
    rowsDone: 10,
    storage: {
      container: overrides?.container ?? 'surp-reports',
      key: overrides?.key ?? 'incidents/x/2026/04/abc-foo.xlsx',
      fileSizeBytes: 1024,
      filename: 'foo.xlsx',
    },
    errorMessage: null,
    createdAt: PAST,
    startedAt: PAST,
    finishedAt: PAST,
    expiresAt: PAST,
  });
}

describe('ExpireDoneExportsUseCase', () => {
  let useCase: ExpireDoneExportsUseCase;
  const findExpiredDoneJobs = jest.fn<Promise<readonly ExportJob[]>, [Date, number]>();
  const persist = jest.fn<Promise<void>, [ExportJob]>();
  const storageDelete = jest.fn<Promise<void>, [string, string]>();

  beforeEach(async () => {
    findExpiredDoneJobs.mockReset();
    persist.mockReset();
    storageDelete.mockReset();
    persist.mockResolvedValue(undefined);
    storageDelete.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        ExpireDoneExportsUseCase,
        {
          provide: EXPORT_JOB_REPOSITORY,
          useValue: {
            findExpiredDoneJobs,
            persist,
            insert: jest.fn(),
            findByExternalId: jest.fn(),
          },
        },
        {
          provide: STORAGE,
          useValue: {
            delete: storageDelete,
            upload: jest.fn(),
            getDownloadUrl: jest.fn(),
            getStream: jest.fn(),
            head: jest.fn(),
            exists: jest.fn(),
          },
        },
        { provide: CLOCK, useValue: { now: () => NOW } },
      ],
    }).compile();

    useCase = module.get(ExpireDoneExportsUseCase);
  });

  it('borra el blob y marca expired para cada job vencido', async () => {
    const job = makeDoneJob();
    findExpiredDoneJobs.mockResolvedValueOnce([job]);

    const result = await useCase.execute();

    expect(storageDelete).toHaveBeenCalledTimes(1);
    expect(storageDelete).toHaveBeenCalledWith('surp-reports', 'incidents/x/2026/04/abc-foo.xlsx');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0].status).toBe('expired');
    expect(persist.mock.calls[0]?.[0].storage).toBeNull();
    expect(result).toEqual({ scanned: 1, expired: 1, blobDeleteFailures: 0 });
  });

  it('si delete del blob falla igual transiciona a expired (idempotencia)', async () => {
    const job = makeDoneJob();
    findExpiredDoneJobs.mockResolvedValueOnce([job]);
    storageDelete.mockRejectedValueOnce(new Error('boom'));

    const result = await useCase.execute();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0].status).toBe('expired');
    expect(result).toEqual({ scanned: 1, expired: 1, blobDeleteFailures: 1 });
  });

  it('container desconocido: skip blob delete pero igual marca expired', async () => {
    const job = makeDoneJob({ container: 'rogue-container' });
    findExpiredDoneJobs.mockResolvedValueOnce([job]);

    const result = await useCase.execute();

    expect(storageDelete).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0].status).toBe('expired');
    expect(result).toEqual({ scanned: 1, expired: 1, blobDeleteFailures: 0 });
  });

  it('sin candidatos: no toca storage ni repo.persist', async () => {
    findExpiredDoneJobs.mockResolvedValueOnce([]);

    const result = await useCase.execute();

    expect(storageDelete).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, expired: 0, blobDeleteFailures: 0 });
  });

  it('procesa varios jobs en una corrida', async () => {
    findExpiredDoneJobs.mockResolvedValueOnce([
      makeDoneJob({ key: 'a' }),
      makeDoneJob({ key: 'b' }),
      makeDoneJob({ key: 'c' }),
    ]);

    const result = await useCase.execute();

    expect(storageDelete).toHaveBeenCalledTimes(3);
    expect(persist).toHaveBeenCalledTimes(3);
    expect(result.scanned).toBe(3);
    expect(result.expired).toBe(3);
  });
});
