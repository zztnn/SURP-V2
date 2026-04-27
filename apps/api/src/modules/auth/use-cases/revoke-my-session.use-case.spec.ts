import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, type RequestContext } from '../../../common';
import { SESSION_REPOSITORY } from '../ports/session.repository.port';
import { RevokeMySessionUseCase } from './revoke-my-session.use-case';

const NOW = new Date('2026-04-26T12:00:00Z');

async function build(revokeResult: boolean): Promise<{
  uc: RevokeMySessionUseCase;
  revoke: jest.Mock;
}> {
  const revoke = jest.fn().mockResolvedValue(revokeResult);
  const moduleRef = await Test.createTestingModule({
    providers: [
      RevokeMySessionUseCase,
      {
        provide: SESSION_REPOSITORY,
        useValue: { revokeByExternalIdForUser: revoke },
      },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return { uc: moduleRef.get(RevokeMySessionUseCase), revoke };
}

const CTX_AUTH: RequestContext = {
  requestId: 'r',
  userId: 1n,
  organizationId: 10n,
  organizationType: 'principal',
  ip: null,
  userAgent: null,
  source: 'http',
  startedAt: NOW,
  sessionExternalId: 'sess-current',
};

describe('RevokeMySessionUseCase', () => {
  it('happy path: revoca otra sesión del usuario', async () => {
    const { uc, revoke } = await build(true);
    await uc.execute({ externalId: 'sess-other' }, CTX_AUTH);
    expect(revoke).toHaveBeenCalledWith('sess-other', 1n, 'admin', NOW);
  });

  it('lanza 401 si ctx.userId es null', async () => {
    const { uc, revoke } = await build(true);
    await expect(
      uc.execute({ externalId: 'x' }, { ...CTX_AUTH, userId: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('lanza 400 AUTH_CANNOT_REVOKE_CURRENT si externalId == sesión actual', async () => {
    const { uc, revoke } = await build(true);
    try {
      await uc.execute({ externalId: 'sess-current' }, CTX_AUTH);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { code: string };
      expect(resp.code).toBe('AUTH_CANNOT_REVOKE_CURRENT');
    }
    expect(revoke).not.toHaveBeenCalled();
  });

  it('lanza 404 si la sesión no existe / no es del usuario / ya revocada', async () => {
    const { uc } = await build(false);
    await expect(uc.execute({ externalId: 'sess-other' }, CTX_AUTH)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
