import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CLOCK, type RequestContext } from '../../../common';
import type { IncidentState } from '../domain/incident';
import { GEO_CONTEXT } from '../ports/geo-context.port';
import { INCIDENT_REPOSITORY } from '../ports/incident.repository.port';
import { VoidIncidentUseCase } from './void-incident.use-case';

const NOW = new Date('2026-04-26T20:00:00Z');

const CTX: RequestContext = {
  requestId: 'r',
  userId: 100n,
  organizationId: 1n,
  organizationType: 'principal',
  ip: '10.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: 'sess-1',
};

const DETAIL = { externalId: 'inc-uuid', state: 'voided' as IncidentState } as never;
const REASON = 'Reporte duplicado por error de captura del guardia';

interface Mocks {
  incidents: {
    findStateByExternalId: jest.Mock;
    markVoided: jest.Mock;
    findByExternalId: jest.Mock;
  };
  geo: {
    findVisibleZoneIdsForOrganization: jest.Mock;
  };
}

function freshMocks(state: IncidentState = 'active', markOk = true): Mocks {
  return {
    incidents: {
      findStateByExternalId: jest.fn().mockResolvedValue({ id: 999n, state, zoneId: 1n }),
      markVoided: jest.fn().mockResolvedValue(markOk),
      findByExternalId: jest.fn().mockResolvedValue(DETAIL),
    },
    geo: { findVisibleZoneIdsForOrganization: jest.fn().mockResolvedValue([]) },
  };
}

async function build(mocks: Mocks): Promise<VoidIncidentUseCase> {
  const m = await Test.createTestingModule({
    providers: [
      VoidIncidentUseCase,
      { provide: INCIDENT_REPOSITORY, useValue: mocks.incidents },
      { provide: GEO_CONTEXT, useValue: mocks.geo },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return m.get(VoidIncidentUseCase);
}

describe('VoidIncidentUseCase', () => {
  it('happy path: anula desde active con razón', async () => {
    const mocks = freshMocks('active', true);
    const uc = await build(mocks);
    const r = await uc.execute({ externalId: 'inc-uuid', voidReason: REASON }, CTX);
    expect(r).toBe(DETAIL);
    expect(mocks.incidents.markVoided).toHaveBeenCalledWith(999n, ['active'], REASON, NOW, 100n);
  });

  it('rechaza desde voided con 409', async () => {
    const mocks = freshMocks('voided');
    const uc = await build(mocks);
    try {
      await uc.execute({ externalId: 'inc-uuid', voidReason: REASON }, CTX);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const r = (e as ConflictException).getResponse() as { code: string };
      expect(r.code).toBe('INCIDENT_NOT_VOIDABLE_FROM_STATE');
    }
  });

  it('rechaza desde draft con 409 (use hard-delete)', async () => {
    const mocks = freshMocks('draft');
    const uc = await build(mocks);
    await expect(
      uc.execute({ externalId: 'inc-uuid', voidReason: REASON }, CTX),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404 si no existe', async () => {
    const mocks = freshMocks();
    mocks.incidents.findStateByExternalId.mockResolvedValue(null);
    const uc = await build(mocks);
    await expect(uc.execute({ externalId: 'x', voidReason: REASON }, CTX)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409 race: markVoided retorna false', async () => {
    const mocks = freshMocks('active', false);
    const uc = await build(mocks);
    try {
      await uc.execute({ externalId: 'inc-uuid', voidReason: REASON }, CTX);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const r = (e as ConflictException).getResponse() as { code: string };
      expect(r.code).toBe('INCIDENT_STATE_CHANGED');
    }
  });

  it('401 si user anónimo', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    const anon: RequestContext = {
      ...CTX,
      userId: null,
      organizationId: null,
      organizationType: null,
    };
    await expect(uc.execute({ externalId: 'x', voidReason: REASON }, anon)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('403 si organizationType=api_consumer', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    const apiCtx: RequestContext = { ...CTX, organizationType: 'api_consumer' };
    await expect(
      uc.execute({ externalId: 'x', voidReason: REASON }, apiCtx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
