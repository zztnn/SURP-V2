import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { USER_REPOSITORY, type UserWithPermissions } from '../ports/user.repository.port';
import { GetCurrentUserUseCase } from './get-current-user.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');
const FULL_USER: UserWithPermissions = {
  organizationName: 'Forestal Arauco S.A.',
  organizationType: 'principal',
  id: 1n,
  externalId: 'ext',
  organizationId: 10n,
  email: 'a@b.cl',
  displayName: 'A',
  active: true,
  mustResetPassword: false,
  mfaRequired: true,
  mfaEnrolled: false,
  permissions: ['p1', 'p2'],
  roles: ['administrator'],
};

const CTX_AUTH: RequestContext = {
  requestId: 'r',
  userId: 1n,
  organizationId: 10n,
  organizationType: 'principal',
  ip: null,
  userAgent: null,
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

const CTX_ANON: RequestContext = {
  ...CTX_AUTH,
  userId: null,
  organizationId: null,
  organizationType: null,
};

async function build(found: UserWithPermissions | null): Promise<GetCurrentUserUseCase> {
  const m = await Test.createTestingModule({
    providers: [
      GetCurrentUserUseCase,
      {
        provide: USER_REPOSITORY,
        useValue: { findByIdWithPermissions: jest.fn().mockResolvedValue(found) },
      },
    ],
  }).compile();
  return m.get(GetCurrentUserUseCase);
}

describe('GetCurrentUserUseCase', () => {
  it('retorna user proyectado con permisos', async () => {
    const uc = await build(FULL_USER);
    const r = await uc.execute(undefined, CTX_AUTH);
    expect(r.id).toBe('1');
    expect(r.organizationId).toBe('10');
    expect(r.permissions).toEqual(['p1', 'p2']);
    expect(r.roles).toEqual(['administrator']);
  });

  it('lanza 404 si ctx sin userId', async () => {
    const uc = await build(FULL_USER);
    await expect(uc.execute(undefined, CTX_ANON)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si user borrado entre token-issue y request', async () => {
    const uc = await build(null);
    await expect(uc.execute(undefined, CTX_AUTH)).rejects.toBeInstanceOf(NotFoundException);
  });
});
