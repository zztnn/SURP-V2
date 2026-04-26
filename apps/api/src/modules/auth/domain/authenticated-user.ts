import { DomainError } from '../../../common';

/**
 * Resultado del lookup por email durante login. Contiene los campos
 * mínimos necesarios para evaluar invariantes de auth (active,
 * locked_until, must_reset_password, mfa) sin filtrar el password_hash
 * fuera del módulo auth.
 *
 * Esta entidad NO se expone al exterior — `LoginUseCase` produce un
 * AuthenticatedUserDto público que omite campos sensibles.
 */
export class AuthenticatedUser {
  constructor(
    public readonly id: bigint,
    public readonly externalId: string,
    public readonly organizationId: bigint,
    public readonly email: string,
    public readonly displayName: string,
    public readonly passwordHash: string | null,
    public readonly mustResetPassword: boolean,
    public readonly mfaRequired: boolean,
    public readonly mfaEnrolled: boolean,
    public readonly active: boolean,
    public readonly lockedUntil: Date | null,
  ) {}

  /**
   * Reglas universales que deben cumplirse antes de emitir tokens:
   *   1. Cuenta activa (no soft-deleted ni desactivada por admin).
   *   2. Sin lockout vigente.
   *   3. Password seteada (must_reset_password=false implica password_hash != NULL).
   *
   * MFA enrollment no se enforce aquí — F6 deja MFA opcional. Cuando
   * F6.5 implemente TOTP, se agregará: `mfa_required && !mfa_enrolled
   * → AUTH_MFA_ENROLLMENT_REQUIRED`.
   */
  assertCanLogin(now: Date): void {
    if (!this.active) {
      throw new DomainError('Usuario inactivo', 'AUTH_USER_INACTIVE');
    }
    if (this.lockedUntil !== null && this.lockedUntil > now) {
      throw new DomainError('Usuario bloqueado por intentos fallidos', 'AUTH_USER_LOCKED');
    }
    if (this.passwordHash === null) {
      throw new DomainError(
        'Usuario sin password — completar onboarding (must_reset_password)',
        'AUTH_PASSWORD_NOT_SET',
      );
    }
  }

  /**
   * `mustResetPassword=true` no impide login, pero el response indica
   * al frontend que el siguiente paso obligatorio es cambiar password.
   * El controller usa este flag para anotar el response.
   */
  needsPasswordReset(): boolean {
    return this.mustResetPassword;
  }

  /**
   * Cuando F6.5 active TOTP, este predicado decide si el JWT lleva
   * `mfa_used=true` o si el response es `requires_mfa_challenge`.
   * Hoy retorna false siempre (MFA off-by-default en F6).
   */
  needsMfaChallenge(): boolean {
    return this.mfaRequired && this.mfaEnrolled;
  }
}
