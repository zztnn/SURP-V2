import { DomainError } from '../../../common';
import { Session } from './session';

const NOW = new Date('2026-04-25T12:00:00Z');

function makeSession(overrides: { revokedAt?: Date | null; expiresAt?: Date } = {}): Session {
  return new Session(
    1n,
    'sess-uuid',
    100n,
    'hash-x',
    '127.0.0.1',
    'ua',
    new Date(NOW.getTime() - 3600_000),
    new Date(NOW.getTime() - 600_000),
    overrides.expiresAt ?? new Date(NOW.getTime() + 1_800_000),
    overrides.revokedAt ?? null,
    null,
  );
}

describe('Session', () => {
  it('isActive=true cuando no está revocada y no expiró', () => {
    expect(makeSession().isActive(NOW)).toBe(true);
  });

  it('isActive=false si revoked', () => {
    expect(makeSession({ revokedAt: NOW }).isActive(NOW)).toBe(false);
  });

  it('isActive=false si expiró', () => {
    expect(makeSession({ expiresAt: new Date(NOW.getTime() - 1) }).isActive(NOW)).toBe(false);
  });

  it('assertCanRefresh OK en sesión activa', () => {
    expect(() => {
      makeSession().assertCanRefresh(NOW);
    }).not.toThrow();
  });

  it('assertCanRefresh lanza AUTH_SESSION_REVOKED', () => {
    try {
      makeSession({ revokedAt: NOW }).assertCanRefresh(NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('AUTH_SESSION_REVOKED');
    }
  });

  it('assertCanRefresh lanza AUTH_SESSION_EXPIRED', () => {
    try {
      makeSession({ expiresAt: new Date(NOW.getTime() - 1) }).assertCanRefresh(NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('AUTH_SESSION_EXPIRED');
    }
  });
});
