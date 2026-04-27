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
import { CloseIncidentUseCase } from './close-incident.use-case';

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

const DETAIL = { externalId: 'inc-uuid', state: 'closed' as IncidentState } as never;

interface Mocks {
  incidents: {
    findStateByExternalId: jest.Mock;
    markClosed: jest.Mock;
    findByExternalId: jest.Mock;
  };
  geo: {
    findVisibleZoneIdsForOrganization: jest.Mock;
  };
}

function freshMocks(state: IncidentState = 'submitted', markOk = true): Mocks {
  return {
    incidents: {
      findStateByExternalId: jest.fn().mockResolvedValue({ id: 999n, state, zoneId: 1n }),
      markClosed: jest.fn().mockResolvedValue(markOk),
      findByExternalId: jest.fn().mockResolvedValue(DETAIL),
    },
    geo: { findVisibleZoneIdsForOrganization: jest.fn().mockResolvedValue([]) },
  };
}

async function build(mocks: Mocks): Promise<CloseIncidentUseCase> {
  const m = await Test.createTestingModule({
    providers: [
      CloseIncidentUseCase,
      { provide: INCIDENT_REPOSITORY, useValue: mocks.incidents },
      { provide: GEO_CONTEXT, useValue: mocks.geo },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return m.get(CloseIncidentUseCase);
}

describe('CloseIncidentUseCase', () => {
  it('happy path: cierra desde submitted', async () => {
    const mocks = freshMocks('submitted', true);
    const uc = await build(mocks);
    const r = await uc.execute({ externalId: 'inc-uuid' }, CTX);
    expect(r).toBe(DETAIL);
    expect(mocks.incidents.markClosed).toHaveBeenCalledWith(
      999n,
      ['submitted', 'under_review'],
      NOW,
      100n,
    );
  });

  it('cierra desde under_review', async () => {
    const mocks = freshMocks('under_review', true);
    const uc = await build(mocks);
    await expect(uc.execute({ externalId: 'inc-uuid' }, CTX)).resolves.toBe(DETAIL);
  });

  it('rechaza desde closed con 409', async () => {
    const mocks = freshMocks('closed');
    const uc = await build(mocks);
    try {
      await uc.execute({ externalId: 'inc-uuid' }, CTX);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const r = (e as ConflictException).getResponse() as { code: string };
      expect(r.code).toBe('INCIDENT_NOT_CLOSABLE_FROM_STATE');
    }
  });

  it('rechaza desde voided con 409', async () => {
    const mocks = freshMocks('voided');
    const uc = await build(mocks);
    await expect(uc.execute({ externalId: 'inc-uuid' }, CTX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('404 si el repo no encuentra el incidente', async () => {
    const mocks = freshMocks();
    mocks.incidents.findStateByExternalId.mockResolvedValue(null);
    const uc = await build(mocks);
    await expect(uc.execute({ externalId: 'x' }, CTX)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 race: markClosed retorna false', async () => {
    const mocks = freshMocks('submitted', false);
    const uc = await build(mocks);
    try {
      await uc.execute({ externalId: 'inc-uuid' }, CTX);
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
    await expect(uc.execute({ externalId: 'x' }, anon)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('403 si organizationType=api_consumer', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    const apiCtx: RequestContext = { ...CTX, organizationType: 'api_consumer' };
    await expect(uc.execute({ externalId: 'x' }, apiCtx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('security_provider consulta visibleZoneIds antes de buscar', async () => {
    const mocks = freshMocks();
    mocks.geo.findVisibleZoneIdsForOrganization.mockResolvedValue([1n, 2n]);
    const uc = await build(mocks);
    const sp: RequestContext = { ...CTX, organizationType: 'security_provider' };
    await uc.execute({ externalId: 'x' }, sp);
    expect(mocks.geo.findVisibleZoneIdsForOrganization).toHaveBeenCalledWith(1n);
    expect(mocks.incidents.findStateByExternalId).toHaveBeenCalledWith('x', [1n, 2n]);
  });
});
