/**
 * Resultado de un intento de login. Mapea 1:1 a la columna `outcome` de
 * `user_login_attempts` (CHECK constraint en el schema).
 *
 * - `success`         → password+MFA OK, JWT emitido.
 * - `bad_password`    → email existe pero password incorrecta.
 * - `unknown_email`   → email no existe (registro genérico para detección de enumeración).
 * - `locked`          → cuenta bloqueada por intentos previos.
 * - `mfa_required`    → password OK pero MFA pendiente (challenge enviado).
 * - `mfa_failed`      → MFA OTP incorrecto.
 * - `inactive`        → cuenta desactivada por admin (active=false).
 */
export type LoginOutcome =
  | 'success'
  | 'bad_password'
  | 'unknown_email'
  | 'locked'
  | 'mfa_required'
  | 'mfa_failed'
  | 'inactive';

export interface LoginAttempt {
  userId: bigint | null;
  emailAttempted: string;
  ip: string;
  userAgent: string | null;
  outcome: LoginOutcome;
  mfaUsed: boolean;
}
