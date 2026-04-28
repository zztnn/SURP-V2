import { ExportJob, ExportJobInvalidTransitionError } from './export-job';

const NOW = new Date('2026-04-28T12:00:00Z');
const TTL_7D_SECONDS = 7 * 86_400;

function createQueued(): ExportJob {
  return ExportJob.create({
    externalId: '11111111-1111-1111-1111-111111111111',
    module: 'incidents',
    format: 'xlsx',
    requestedByUserId: 1n,
    requestedByOrganizationId: 1n,
    filters: { semaforo: 'rojo' },
    ttlSeconds: TTL_7D_SECONDS,
    now: NOW,
  });
}

describe('ExportJob', () => {
  it('create() empieza en estado queued con expiresAt = now + ttl', () => {
    const job = createQueued();
    expect(job.status).toBe('queued');
    expect(job.progress).toBe(0);
    expect(job.rowsDone).toBe(0);
    expect(job.startedAt).toBeNull();
    expect(job.expiresAt.getTime() - NOW.getTime()).toBe(TTL_7D_SECONDS * 1000);
  });

  describe('transiciones válidas', () => {
    it('queued → running', () => {
      const job = createQueued();
      const startAt = new Date(NOW.getTime() + 1000);
      job.markRunning(startAt);
      expect(job.status).toBe('running');
      expect(job.startedAt).toEqual(startAt);
    });

    it('running → done con storage + finishedAt', () => {
      const job = createQueued();
      job.markRunning(NOW);
      const finishedAt = new Date(NOW.getTime() + 60_000);
      job.markDone(
        {
          container: 'surp-reports',
          key: 'incidents/abc.xlsx',
          fileSizeBytes: 12_345,
          filename: 'incidentes-2026-04-28.xlsx',
        },
        500,
        finishedAt,
      );
      expect(job.status).toBe('done');
      expect(job.progress).toBe(100);
      expect(job.rowsDone).toBe(500);
      expect(job.totalRows).toBe(500);
      expect(job.finishedAt).toEqual(finishedAt);
      expect(job.storage?.container).toBe('surp-reports');
    });

    it('running → failed con errorMessage', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markFailed('disk full', new Date(NOW.getTime() + 100));
      expect(job.status).toBe('failed');
      expect(job.errorMessage).toBe('disk full');
      expect(job.finishedAt).not.toBeNull();
    });

    it('queued → cancelled', () => {
      const job = createQueued();
      job.markCancelled('user request', new Date(NOW.getTime() + 100));
      expect(job.status).toBe('cancelled');
      expect(job.errorMessage).toBe('user request');
    });

    it('progress capa al 99 cuando running (deja 100 reservado para done)', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markProgress(1000, 1000);
      expect(job.progress).toBe(99);
    });

    it('progress con totalRows null no cambia el porcentaje', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markProgress(50, null);
      expect(job.progress).toBe(0);
      expect(job.rowsDone).toBe(50);
    });
  });

  describe('transiciones inválidas', () => {
    it('queued → done lanza', () => {
      const job = createQueued();
      expect(() => {
        job.markDone({ container: 'x', key: 'y', fileSizeBytes: 1, filename: 'z' }, 1, NOW);
      }).toThrow(ExportJobInvalidTransitionError);
    });

    it('done → running lanza', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markDone({ container: 'x', key: 'y', fileSizeBytes: 1, filename: 'z' }, 1, NOW);
      expect(() => {
        job.markRunning(NOW);
      }).toThrow(ExportJobInvalidTransitionError);
    });

    it('done → failed lanza', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markDone({ container: 'x', key: 'y', fileSizeBytes: 1, filename: 'z' }, 1, NOW);
      expect(() => {
        job.markFailed('late error', NOW);
      }).toThrow(ExportJobInvalidTransitionError);
    });

    it('done → cancelled lanza', () => {
      const job = createQueued();
      job.markRunning(NOW);
      job.markDone({ container: 'x', key: 'y', fileSizeBytes: 1, filename: 'z' }, 1, NOW);
      expect(() => {
        job.markCancelled('too late', NOW);
      }).toThrow(ExportJobInvalidTransitionError);
    });
  });

  it('toSnapshot() y fromSnapshot() son simétricos', () => {
    const job = createQueued();
    job.markRunning(NOW);
    job.markProgress(100, 200);
    const snap = job.toSnapshot();
    const restored = ExportJob.fromSnapshot(snap);
    expect(restored.toSnapshot()).toEqual(snap);
  });
});
