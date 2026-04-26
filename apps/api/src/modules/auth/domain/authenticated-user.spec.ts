import { DomainError } from '../../../common';
import { AuthenticatedUser } from './authenticated-user';

const NOW = new Date('2026-04-25T12:00:00Z');

function makeUser(): AuthenticatedUser {
  return new AuthenticatedUser(
    1n,
    'ext-uuid',
    10n,
    'jquiero@softe.cl',
    'Juan Quiero',
    '$argon2id$dummy$hash',
    false,
    true,
    false,
    true,
    null,
  );
}

describe('AuthenticatedUser', () => {
  it('assertCanLogin OK con cuenta activa, sin lockout, con password', () => {
    const u = makeUser();
    expect(() => {
      u.assertCanLogin(NOW);
    }).not.toThrow();
  });

  it('lanza AUTH_USER_INACTIVE si active=false', () => {
    const u = new AuthenticatedUser(1n, 'x', 10n, 'a@b', 'A', 'h', false, true, false, false, null);
    try {
      u.assertCanLogin(NOW);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('AUTH_USER_INACTIVE');
    }
  });

  it('lanza AUTH_USER_LOCKED si lockedUntil > now', () => {
    const future = new Date(NOW.getTime() + 60_000);
    const u = new AuthenticatedUser(
      1n,
      'x',
      10n,
      'a@b',
      'A',
      'h',
      false,
      true,
      false,
      true,
      future,
    );
    try {
      u.assertCanLogin(NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('AUTH_USER_LOCKED');
    }
  });

  it('NO lanza si lockedUntil ya venció', () => {
    const past = new Date(NOW.getTime() - 60_000);
    const u = new AuthenticatedUser(1n, 'x', 10n, 'a@b', 'A', 'h', false, true, false, true, past);
    expect(() => {
      u.assertCanLogin(NOW);
    }).not.toThrow();
  });

  it('lanza AUTH_PASSWORD_NOT_SET si password_hash es NULL', () => {
    const u = new AuthenticatedUser(1n, 'x', 10n, 'a@b', 'A', null, true, true, false, true, null);
    try {
      u.assertCanLogin(NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('AUTH_PASSWORD_NOT_SET');
    }
  });

  it('needsPasswordReset refleja must_reset_password', () => {
    expect(makeUser().needsPasswordReset()).toBe(false);
    const u = new AuthenticatedUser(1n, 'x', 10n, 'a@b', 'A', 'h', true, true, false, true, null);
    expect(u.needsPasswordReset()).toBe(true);
  });

  it('needsMfaChallenge solo cuando mfa_required && mfa_enrolled', () => {
    expect(makeUser().needsMfaChallenge()).toBe(false);
    const enrolled = new AuthenticatedUser(
      1n,
      'x',
      10n,
      'a@b',
      'A',
      'h',
      false,
      true,
      true,
      true,
      null,
    );
    expect(enrolled.needsMfaChallenge()).toBe(true);
    const notRequired = new AuthenticatedUser(
      1n,
      'x',
      10n,
      'a@b',
      'A',
      'h',
      false,
      false,
      true,
      true,
      null,
    );
    expect(notRequired.needsMfaChallenge()).toBe(false);
  });
});
