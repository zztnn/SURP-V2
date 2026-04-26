import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, type RequestContext } from '../../../common';
import { Session } from '../domain/session';
import { SESSION_REPOSITORY } from '../ports/session.repository.port';
import { ListMySessionsUseCase } from './list-my-sessions.use-case';

const NOW = new Date('2026-04-26T12:00:00Z');

function makeSession(overrides: Partial<{ externalId: string; deviceLabel: string }>): Session {
  return new Session(
    1n,
    overrides.externalId ?? 'sess-A',
    1n,
    'hash',
    '10.0.0.1',
    'jest',
    NOW,
    NOW,
    new Date(NOW.getTime() + 86_400_000),
    null,
    null,
    overrides.deviceLabel ?? 'Chrome en Mac',
    'desktop',
    'Concepción, Chile',
  );
}

async function build(active: Session[]): Promise<{
  uc: ListMySessionsUseCase;
  findActive: jest.Mock;
}> {
  const findActive = jest.fn().mockResolvedValue(active);
  const moduleRef = await Test.createTestingModule({
    providers: [
      ListMySessionsUseCase,
      { provide: SESSION_REPOSITORY, useValue: { findActiveByUserId: findActive } },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return { uc: moduleRef.get(ListMySessionsUseCase), findActive };
}

describe('ListMySessionsUseCase', () => {
  const ctxAuth: RequestContext = {
    requestId: 'r',
    userId: 1n,
    organizationId: 10n,
    ip: null,
    userAgent: null,
    source: 'http',
    startedAt: NOW,
    sessionExternalId: 'sess-A',
  };

  it('marca isCurrent=true en la sesión cuyo externalId coincide con ctx.sessionExternalId', async () => {
    const sessA = makeSession({ externalId: 'sess-A', deviceLabel: 'Chrome en Mac' });
    const sessB = makeSession({ externalId: 'sess-B', deviceLabel: 'Safari en iPhone' });
    const { uc } = await build([sessA, sessB]);

    const result = await uc.execute(undefined, ctxAuth);

    expect(result).toHaveLength(2);
    expect(result[0]?.externalId).toBe('sess-A');
    expect(result[0]?.isCurrent).toBe(true);
    expect(result[1]?.externalId).toBe('sess-B');
    expect(result[1]?.isCurrent).toBe(false);
  });

  it('mapea deviceLabel/deviceType/locationLabel desde la entity', async () => {
    const { uc } = await build([makeSession({ externalId: 'sess-A' })]);
    const result = await uc.execute(undefined, ctxAuth);
    expect(result[0]).toMatchObject({
      deviceLabel: 'Chrome en Mac',
      deviceType: 'desktop',
      locationLabel: 'Concepción, Chile',
    });
  });

  it('lanza 401 si ctx.userId es null', async () => {
    const { uc, findActive } = await build([]);
    const ctxAnon: RequestContext = { ...ctxAuth, userId: null, sessionExternalId: null };
    await expect(uc.execute(undefined, ctxAnon)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findActive).not.toHaveBeenCalled();
  });

  it('si ctx.sessionExternalId es null, ninguna sesión queda marcada como actual', async () => {
    const { uc } = await build([makeSession({ externalId: 'sess-A' })]);
    const ctxNoSid: RequestContext = { ...ctxAuth, sessionExternalId: null };
    const result = await uc.execute(undefined, ctxNoSid);
    expect(result[0]?.isCurrent).toBe(false);
  });
});
