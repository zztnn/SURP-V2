import { RequestContextService } from './request-context.service';
import type { RequestContext } from './request-context.types';

describe('RequestContextService', () => {
  const service = new RequestContextService();

  const sampleCtx: RequestContext = {
    requestId: '00000000-0000-0000-0000-000000000001',
    userId: 1n,
    organizationId: 1n,
    organizationType: 'principal',
    ip: '127.0.0.1',
    userAgent: 'jest',
    source: 'http',
    startedAt: new Date(),
    sessionExternalId: null,
  };

  it('getContext() retorna undefined fuera de runWithContext', () => {
    expect(service.getContext()).toBeUndefined();
  });

  it('getContextOrThrow() lanza fuera de runWithContext', () => {
    expect(() => service.getContextOrThrow()).toThrow(/RequestContext no disponible/);
  });

  it('getContext() retorna el ctx dentro de runWithContext', () => {
    const seen = service.runWithContext(sampleCtx, () => service.getContext());
    expect(seen).toBe(sampleCtx);
  });

  it('contextos paralelos no se mezclan (AsyncLocalStorage)', async () => {
    const a: RequestContext = { ...sampleCtx, requestId: 'a' };
    const b: RequestContext = { ...sampleCtx, requestId: 'b' };

    const [ra, rb] = await Promise.all([
      service.runWithContext(a, async () => {
        await Promise.resolve();
        return service.getContextOrThrow().requestId;
      }),
      service.runWithContext(b, async () => {
        await Promise.resolve();
        return service.getContextOrThrow().requestId;
      }),
    ]);

    expect(ra).toBe('a');
    expect(rb).toBe('b');
  });
});
