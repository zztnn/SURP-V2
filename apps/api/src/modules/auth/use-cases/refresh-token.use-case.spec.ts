import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { Session } from '../domain/session';
import { CLOCK } from '../../../common';
import { SESSION_REPOSITORY } from '../ports/session.repository.port';
import { TOKEN_ISSUER } from '../ports/token-issuer.port';
import { USER_REPOSITORY, type UserWithPermissions } from '../ports/user.repository.port';
import { RefreshTokenUseCase } from './refresh-token.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');
const CTX: RequestContext = {
  requestId: 'r',
  userId: null,
  organizationId: null,
  ip: '1.1.1.1',
  userAgent: null,
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

const FULL_USER: UserWithPermissions = {
  id: 1n,
  externalId: 'ext',
  organizationId: 10n,
  organizationName: 'Forestal Arauco S.A.',
  organizationType: 'principal',
  email: 'a@b.cl',
  displayName: 'A',
  active: true,
  mustResetPassword: false,
  mfaRequired: true,
  mfaEnrolled: false,
  permissions: [],
  roles: [],
};

function makeSession(opts: { revokedAt?: Date | null; expiresAt?: Date } = {}): Session {
  return new Session(
    100n,
    'ses',
    1n,
    'hash-old',
    '1.1.1.1',
    null,
    new Date(NOW.getTime() - 86_400_000),
    new Date(NOW.getTime() - 1_000),
    opts.expiresAt ?? new Date(NOW.getTime() + 1_000_000),
    opts.revokedAt ?? null,
    null,
  );
}

async function buildUseCase(opts: {
  session?: Session | null;
  user?: UserWithPermissions | null;
}): Promise<{
  uc: RefreshTokenUseCase;
  rotate: jest.Mock;
  hashRefresh: jest.Mock;
  generate: jest.Mock;
  sign: jest.Mock;
}> {
  const newSession = new Session(
    101n,
    'sess-new-uuid',
    1n,
    'hash-new',
    '1.1.1.1',
    null,
    NOW,
    NOW,
    new Date(NOW.getTime() + 30 * 86_400_000),
    null,
    null,
    'Chrome en Mac',
    'desktop',
    null,
  );
  const rotate = jest.fn().mockResolvedValue(newSession);
  const hashRefresh = jest.fn().mockReturnValue('hash-old');
  const generate = jest.fn().mockReturnValue('refresh-new');
  const sign = jest.fn().mockResolvedValue('jwt-new');
  const moduleRef = await Test.createTestingModule({
    providers: [
      RefreshTokenUseCase,
      {
        provide: USER_REPOSITORY,
        useValue: { findByIdWithPermissions: jest.fn().mockResolvedValue(opts.user ?? FULL_USER) },
      },
      {
        provide: SESSION_REPOSITORY,
        useValue: {
          findByRefreshHash: jest.fn().mockResolvedValue(opts.session ?? null),
          rotateRefresh: rotate,
        },
      },
      {
        provide: TOKEN_ISSUER,
        useValue: {
          signAccessToken: sign,
          generateOpaqueRefreshToken: generate,
          hashRefreshToken: hashRefresh,
        },
      },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return { uc: moduleRef.get(RefreshTokenUseCase), rotate, hashRefresh, generate, sign };
}

describe('RefreshTokenUseCase', () => {
  it('happy path: rota refresh + emite nuevo access', async () => {
    const session = makeSession();
    const { uc, rotate, sign } = await buildUseCase({ session });

    const r = await uc.execute({ refreshToken: 'old-plain' }, CTX);

    expect(r.accessToken).toBe('jwt-new');
    expect(r.refreshToken).toBe('refresh-new');
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldSessionId: 100n,
        ip: '1.1.1.1',
      }),
    );
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({ sid: 'sess-new-uuid', sub: '1' }));
  });

  it('refresh desconocido: 401', async () => {
    const { uc } = await buildUseCase({ session: null });
    await expect(uc.execute({ refreshToken: 'x' }, CTX)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('sesión revocada: 401 sin rotar', async () => {
    const { uc, rotate } = await buildUseCase({ session: makeSession({ revokedAt: NOW }) });
    await expect(uc.execute({ refreshToken: 'x' }, CTX)).rejects.toThrow(UnauthorizedException);
    expect(rotate).not.toHaveBeenCalled();
  });

  it('sesión expirada: 401', async () => {
    const { uc } = await buildUseCase({
      session: makeSession({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    await expect(uc.execute({ refreshToken: 'x' }, CTX)).rejects.toThrow(UnauthorizedException);
  });

  it('user inactivo: 401', async () => {
    const { uc } = await buildUseCase({
      session: makeSession(),
      user: { ...FULL_USER, active: false },
    });
    await expect(uc.execute({ refreshToken: 'x' }, CTX)).rejects.toThrow(UnauthorizedException);
  });
});
