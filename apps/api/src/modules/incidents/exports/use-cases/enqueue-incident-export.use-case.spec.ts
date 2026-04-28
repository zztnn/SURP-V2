import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CLOCK, type RequestContext } from '../../../../common';
import { ExportJob } from '../domain/export-job';
import { EXPORT_JOB_REPOSITORY } from '../ports/export-job.repository.port';
import {
  INCIDENT_EXPORT_QUEUE,
  type IncidentExportJobPayload,
} from '../ports/incident-export-queue.port';
import { EnqueueIncidentExportUseCase } from './enqueue-incident-export.use-case';

const NOW = new Date('2026-04-28T12:00:00Z');

const CTX: RequestContext = {
  requestId: 'req-1',
  userId: 100n,
  organizationId: 1n,
  organizationType: 'principal',
  ip: '10.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: 'sess-1',
};

const CTX_NO_USER: RequestContext = { ...CTX, userId: null, organizationId: null };

describe('EnqueueIncidentExportUseCase', () => {
  let useCase: EnqueueIncidentExportUseCase;
  const repoInsert = jest.fn<Promise<void>, [ExportJob]>();
  const queueEnqueue = jest.fn<Promise<void>, [IncidentExportJobPayload]>();

  beforeEach(async () => {
    repoInsert.mockReset();
    queueEnqueue.mockReset();
    repoInsert.mockResolvedValue(undefined);
    queueEnqueue.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        EnqueueIncidentExportUseCase,
        { provide: EXPORT_JOB_REPOSITORY, useValue: { insert: repoInsert } },
        { provide: INCIDENT_EXPORT_QUEUE, useValue: { enqueue: queueEnqueue } },
        { provide: CLOCK, useValue: { now: () => NOW } },
      ],
    }).compile();
    useCase = module.get(EnqueueIncidentExportUseCase);
  });

  it('crea ExportJob queued, lo persiste, encola y devuelve externalId', async () => {
    const result = await useCase.execute({ filters: { semaforo: 'rojo' }, format: 'xlsx' }, CTX);

    expect(result.status).toBe('queued');
    expect(result.externalId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    expect(repoInsert).toHaveBeenCalledTimes(1);
    const persisted = repoInsert.mock.calls[0]?.[0] as ExportJob;
    expect(persisted.status).toBe('queued');
    expect(persisted.module).toBe('incidents');
    expect(persisted.format).toBe('xlsx');
    expect(persisted.requestedByUserId).toBe(100n);
    expect(persisted.requestedByOrganizationId).toBe(1n);
    expect(persisted.filters).toEqual({ semaforo: 'rojo' });
    expect(persisted.expiresAt.getTime() - NOW.getTime()).toBe(7 * 86_400 * 1000);

    expect(queueEnqueue).toHaveBeenCalledTimes(1);
    expect(queueEnqueue.mock.calls[0]?.[0]).toEqual({
      exportJobExternalId: result.externalId,
    });
  });

  it('lanza UnauthorizedException sin sesión', async () => {
    await expect(
      useCase.execute({ filters: {}, format: 'xlsx' }, CTX_NO_USER),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repoInsert).not.toHaveBeenCalled();
    expect(queueEnqueue).not.toHaveBeenCalled();
  });

  it('externalId del job creado matchea el payload encolado (mismo UUID en BD y BullMQ)', async () => {
    const result = await useCase.execute({ filters: {}, format: 'xlsx' }, CTX);
    const job = repoInsert.mock.calls[0]?.[0] as ExportJob;
    expect(job.externalId).toBe(result.externalId);
    const payload = queueEnqueue.mock.calls[0]?.[0] as IncidentExportJobPayload;
    expect(payload.exportJobExternalId).toBe(result.externalId);
  });
});
