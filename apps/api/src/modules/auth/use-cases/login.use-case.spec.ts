import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { Session } from '../domain/session';
import { CLOCK } from '../../../common';
import { DEVICE_DETECTOR } from '../ports/device-detector.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { SESSION_REPOSITORY } from '../ports/session.repository.port';
import { TOKEN_ISSUER } from '../ports/token-issuer.port';
import { USER_REPOSITORY, type UserWithPermissions } from '../ports/user.repository.port';
import { LoginUseCase } from './login.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');

const CTX: RequestContext = {
  requestId: 'req-1',
  userId: null,
  organizationId: null,
  ip: '10.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

function makeSessionEntity(externalId = 'sess-uuid'): Session {
  return new Session(
    1n,
    externalId,
    1n,
    'refresh-hash',
    '10.0.0.1',
    'jest',
    NOW,
    NOW,
    new Date(NOW.getTime() + 30 * 86_400_000),
    null,
    null,
    'Chrome en Mac',
    'desktop',
    null,
  );
}

function makeUser(
  overrides: Partial<{ active: boolean; passwordHash: string | null; locked: Date | null }> = {},
): AuthenticatedUser {
  return new AuthenticatedUser(
    1n,
    'ext-uuid',
    10n,
    'jquiero@softe.cl',
    'Juan Quiero',
    overrides.passwordHash !== undefined ? overrides.passwordHash : '$argon2id$valid',
    false,
    true,
    false,
    overrides.active ?? true,
    overrides.locked ?? null,
  );
}

const FULL_USER: UserWithPermissions = {
  id: 1n,
  externalId: 'ext-uuid',
  organizationId: 10n,
  email: 'jquiero@softe.cl',
  displayName: 'Juan Quiero',
  active: true,
  mustResetPassword: false,
  mfaRequired: true,
  mfaEnrolled: false,
  permissions: ['audit.logs.read', 'incidents.incidents.read'],
  roles: ['administrator'],
};

interface Mocks {
  users: {
    findByEmail: jest.Mock;
    findByIdWithPermissions: jest.Mock;
    registerLoginAttempt: jest.Mock;
    countRecentFailures: jest.Mock;
    lockUser: jest.Mock;
    touchLastLogin: jest.Mock;
  };
  sessions: {
    create: jest.Mock;
    findByRefreshHash: jest.Mock;
    rotateRefresh: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
    findActiveByUserId: jest.Mock;
    revokeByExternalIdForUser: jest.Mock;
  };
  hasher: { hash: jest.Mock; verify: jest.Mock };
  tokens: {
    signAccessToken: jest.Mock;
    verifyAccessToken: jest.Mock;
    generateOpaqueRefreshToken: jest.Mock;
    hashRefreshToken: jest.Mock;
  };
  devices: { detect: jest.Mock };
  clock: { now: jest.Mock };
}

async function buildUseCase(mocks: Mocks): Promise<LoginUseCase> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LoginUseCase,
      { provide: USER_REPOSITORY, useValue: mocks.users },
      { provide: SESSION_REPOSITORY, useValue: mocks.sessions },
      { provide: PASSWORD_HASHER, useValue: mocks.hasher },
      { provide: TOKEN_ISSUER, useValue: mocks.tokens },
      { provide: DEVICE_DETECTOR, useValue: mocks.devices },
      { provide: CLOCK, useValue: mocks.clock },
    ],
  }).compile();
  return moduleRef.get(LoginUseCase);
}

function freshMocks(): Mocks {
  return {
    users: {
      findByEmail: jest.fn(),
      findByIdWithPermissions: jest.fn().mockResolvedValue(FULL_USER),
      registerLoginAttempt: jest.fn().mockResolvedValue(undefined),
      countRecentFailures: jest.fn().mockResolvedValue(0),
      lockUser: jest.fn().mockResolvedValue(undefined),
      touchLastLogin: jest.fn().mockResolvedValue(undefined),
    },
    sessions: {
      create: jest.fn().mockResolvedValue(makeSessionEntity()),
      findByRefreshHash: jest.fn(),
      rotateRefresh: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      findActiveByUserId: jest.fn(),
      revokeByExternalIdForUser: jest.fn(),
    },
    hasher: {
      hash: jest.fn(),
      verify: jest.fn(),
    },
    tokens: {
      signAccessToken: jest.fn().mockResolvedValue('jwt.token.fake'),
      verifyAccessToken: jest.fn(),
      generateOpaqueRefreshToken: jest.fn().mockReturnValue('refresh-plain'),
      hashRefreshToken: jest.fn().mockReturnValue('refresh-hash'),
    },
    devices: {
      detect: jest.fn().mockReturnValue({
        deviceLabel: 'Chrome en Mac',
        deviceType: 'desktop',
        locationLabel: null,
      }),
    },
    clock: { now: jest.fn().mockReturnValue(NOW) },
  };
}

describe('LoginUseCase', () => {
  it('happy path: emite tokens, registra success, touch last_login', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser());
    mocks.hasher.verify.mockResolvedValue(true);
    const uc = await buildUseCase(mocks);

    const result = await uc.execute({ email: 'jquiero@softe.cl', password: 'pw' }, CTX);

    expect(result.accessToken).toBe('jwt.token.fake');
    expect(result.refreshToken).toBe('refresh-plain');
    expect(result.expiresIn).toBe(900);
    expect(result.user.email).toBe('jquiero@softe.cl');
    expect(result.user.permissions).toEqual(['audit.logs.read', 'incidents.incidents.read']);
    expect(result.requiresPasswordReset).toBe(false);

    expect(mocks.sessions.create).toHaveBeenCalledTimes(1);
    expect(mocks.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1n,
        refreshTokenHash: 'refresh-hash',
        ip: '10.0.0.1',
        deviceLabel: 'Chrome en Mac',
        deviceType: 'desktop',
        locationLabel: null,
      }),
    );
    expect(mocks.devices.detect).toHaveBeenCalledWith('jest', '10.0.0.1');
    expect(mocks.tokens.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'sess-uuid', sub: '1', org: '10' }),
    );
    expect(mocks.users.touchLastLogin).toHaveBeenCalledWith(1n, '10.0.0.1', NOW);
    expect(mocks.users.registerLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success', userId: 1n }),
    );
  });

  it('email no existe: 401 + outcome unknown_email + verify dummy llamado (timing)', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(null);
    mocks.hasher.verify.mockResolvedValue(false);
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'nadie@x.cl', password: 'pw' }, CTX)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(mocks.hasher.verify).toHaveBeenCalledWith('pw', null);
    expect(mocks.users.registerLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'unknown_email', userId: null }),
    );
    expect(mocks.sessions.create).not.toHaveBeenCalled();
  });

  it('password incorrecta: 401 + outcome bad_password', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser());
    mocks.hasher.verify.mockResolvedValue(false);
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'a@b.cl', password: 'wrong' }, CTX)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mocks.users.registerLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'bad_password' }),
    );
    expect(mocks.sessions.create).not.toHaveBeenCalled();
  });

  it('cuenta inactiva: 401 + outcome inactive (sin verify de password)', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser({ active: false }));
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'a@b.cl', password: 'pw' }, CTX)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mocks.users.registerLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'inactive' }),
    );
    expect(mocks.hasher.verify).not.toHaveBeenCalled();
  });

  it('cuenta bloqueada por lockout vigente: 401 + outcome locked', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(
      makeUser({ locked: new Date(NOW.getTime() + 60_000) }),
    );
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'a@b.cl', password: 'pw' }, CTX)).rejects.toThrow();
    expect(mocks.users.registerLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'locked' }),
    );
  });

  it('5to fallo seguido: bloquea cuenta por 15 min', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser());
    mocks.hasher.verify.mockResolvedValue(false);
    mocks.users.countRecentFailures.mockResolvedValue(5);
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'a@b.cl', password: 'wrong' }, CTX)).rejects.toThrow();
    expect(mocks.users.lockUser).toHaveBeenCalledTimes(1);
    const expectedUntil = new Date(NOW.getTime() + 15 * 60_000);
    expect(mocks.users.lockUser).toHaveBeenCalledWith(1n, expectedUntil);
  });

  it('4to fallo: registra pero NO bloquea', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser());
    mocks.hasher.verify.mockResolvedValue(false);
    mocks.users.countRecentFailures.mockResolvedValue(4);
    const uc = await buildUseCase(mocks);

    await expect(uc.execute({ email: 'a@b.cl', password: 'wrong' }, CTX)).rejects.toThrow();
    expect(mocks.users.lockUser).not.toHaveBeenCalled();
  });

  it('email se normaliza a lowercase + trim', async () => {
    const mocks = freshMocks();
    mocks.users.findByEmail.mockResolvedValue(makeUser());
    mocks.hasher.verify.mockResolvedValue(true);
    const uc = await buildUseCase(mocks);

    await uc.execute({ email: '  Jquiero@SOFTE.cl  ', password: 'pw' }, CTX);

    expect(mocks.users.findByEmail).toHaveBeenCalledWith('jquiero@softe.cl');
  });

  it('expone requiresPasswordReset cuando must_reset_password=true', async () => {
    const mocks = freshMocks();
    const u = new AuthenticatedUser(
      1n,
      'ext',
      10n,
      'a@b.cl',
      'A',
      '$argon2id$h',
      true,
      true,
      false,
      true,
      null,
    );
    mocks.users.findByEmail.mockResolvedValue(u);
    mocks.hasher.verify.mockResolvedValue(true);
    const uc = await buildUseCase(mocks);

    const r = await uc.execute({ email: 'a@b.cl', password: 'pw' }, CTX);
    expect(r.requiresPasswordReset).toBe(true);
  });
});
