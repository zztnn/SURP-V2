import { Test } from '@nestjs/testing';
import type { RequestContext } from '../../../common';
import { Session } from '../domain/session';
import { CLOCK } from '../../../common';
import { SESSION_REPOSITORY } from '../ports/session.repository.port';
import { TOKEN_ISSUER } from '../ports/token-issuer.port';
import { LogoutUseCase } from './logout.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');
const CTX: RequestContext = {
  requestId: 'r',
  userId: null,
  organizationId: null,
  organizationType: null,
  ip: null,
  userAgent: null,
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

function makeSession(revokedAt: Date | null = null): Session {
  return new Session(
    100n,
    'ses',
    1n,
    'h',
    '1.1.1.1',
    null,
    NOW,
    NOW,
    new Date(NOW.getTime() + 86_400_000),
    revokedAt,
    null,
  );
}

async function build(session: Session | null): Promise<{ uc: LogoutUseCase; revoke: jest.Mock }> {
  const revoke = jest.fn().mockResolvedValue(undefined);
  const m = await Test.createTestingModule({
    providers: [
      LogoutUseCase,
      {
        provide: SESSION_REPOSITORY,
        useValue: { findByRefreshHash: jest.fn().mockResolvedValue(session), revoke },
      },
      { provide: TOKEN_ISSUER, useValue: { hashRefreshToken: () => 'h' } },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return { uc: m.get(LogoutUseCase), revoke };
}

describe('LogoutUseCase', () => {
  it('revoca sesión activa', async () => {
    const { uc, revoke } = await build(makeSession());
    await uc.execute({ refreshToken: 'x' }, CTX);
    expect(revoke).toHaveBeenCalledWith(100n, 'logout', NOW);
  });

  it('idempotente: refresh desconocido no falla', async () => {
    const { uc, revoke } = await build(null);
    await expect(uc.execute({ refreshToken: 'x' }, CTX)).resolves.toBeUndefined();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('idempotente: sesión ya revocada no re-revoca', async () => {
    const { uc, revoke } = await build(makeSession(NOW));
    await uc.execute({ refreshToken: 'x' }, CTX);
    expect(revoke).not.toHaveBeenCalled();
  });
});
