import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError, type RequestContext } from '../../../common';
import type { LoginOutcome } from '../domain/login-attempt';
import { CLOCK, type ClockPort } from '../../../common';
import { DEVICE_DETECTOR, type DeviceDetectorPort } from '../ports/device-detector.port';
import { PASSWORD_HASHER, type PasswordHasherPort } from '../ports/password-hasher.port';
import { SESSION_REPOSITORY, type SessionRepositoryPort } from '../ports/session.repository.port';
import { TOKEN_ISSUER, type TokenIssuerPort } from '../ports/token-issuer.port';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
  type UserWithPermissions,
} from '../ports/user.repository.port';

/**
 * Política de lockout (según schema/COMMENT user_login_attempts):
 *   - 5 fallos en 10 minutos → bloqueo de 15 min.
 *   - El conteo solo considera `bad_password` y `mfa_failed` (no
 *     `unknown_email` para evitar lockear cuentas legítimas vía
 *     enumeración de emails).
 *   - El bloqueo se levanta automáticamente al vencer `locked_until`;
 *     no requiere intervención admin.
 */
const FAILURE_WINDOW_MIN = 10;
const MAX_FAILURES = 5;
const LOCKOUT_MIN = 15;
const REFRESH_TTL_DAYS = 30;

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUserSnapshot;
  requiresPasswordReset: boolean;
}

export interface PublicUserSnapshot {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  organizationType: 'principal' | 'security_provider' | 'api_consumer';
  permissions: readonly string[];
  roles: readonly string[];
}

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuerPort,
    @Inject(DEVICE_DETECTOR) private readonly devices: DeviceDetectorPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: LoginInput, ctx: RequestContext): Promise<LoginResult> {
    const now = this.clock.now();
    const ip = ctx.ip ?? '0.0.0.0';
    const ua = ctx.userAgent;
    const emailNormalized = input.email.trim().toLowerCase();

    const user = await this.users.findByEmail(emailNormalized);

    // Verify dummy hash igual cuando user es null para mantener tiempo
    // constante (evita enumeración por timing). El verify retorna false
    // pero gasta el mismo tiempo que un mismatch real.
    if (!user) {
      await this.hasher.verify(input.password, null);
      await this.recordAttempt({
        userId: null,
        emailAttempted: emailNormalized,
        ip,
        userAgent: ua,
        outcome: 'unknown_email',
        mfaUsed: false,
      });
      throw this.unauthorizedGeneric();
    }

    try {
      user.assertCanLogin(now);
    } catch (e) {
      const outcome = mapDomainErrorToOutcome(e);
      await this.recordAttempt({
        userId: user.id,
        emailAttempted: emailNormalized,
        ip,
        userAgent: ua,
        outcome,
        mfaUsed: false,
      });
      // assertCanLogin lanza DomainError; lo mapeamos a 401 genérico.
      throw this.unauthorizedGeneric();
    }

    const passwordOk = await this.hasher.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      await this.recordAttempt({
        userId: user.id,
        emailAttempted: emailNormalized,
        ip,
        userAgent: ua,
        outcome: 'bad_password',
        mfaUsed: false,
      });
      await this.maybeLock(user.id, now);
      throw this.unauthorizedGeneric();
    }

    // MFA challenge: F6 lo deja off (decisión usuario, ver memoria).
    // Cuando F6.5 active TOTP, aquí se ramifica:
    //   if (user.needsMfaChallenge()) { record outcome=mfa_required;
    //   return { challenge: '...' }; }

    const fullUser = await this.users.findByIdWithPermissions(user.id);
    if (!fullUser) {
      // Imposible si findByEmail acaba de devolver el user, pero defensa
      // contra borrado concurrente.
      this.logger.warn(
        `User ${String(user.id)} desapareció entre findByEmail y findByIdWithPermissions`,
      );
      throw this.unauthorizedGeneric();
    }

    const refreshPlain = this.tokens.generateOpaqueRefreshToken();
    const refreshHash = this.tokens.hashRefreshToken(refreshPlain);
    const expiresAt = new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);
    const fingerprint = this.devices.detect(ua, ip);
    const session = await this.sessions.create({
      userId: user.id,
      refreshTokenHash: refreshHash,
      ip,
      userAgent: ua,
      expiresAt,
      deviceLabel: fingerprint.deviceLabel,
      deviceType: fingerprint.deviceType,
      locationLabel: fingerprint.locationLabel,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id.toString(),
      org: user.organizationId.toString(),
      jti: randomUUID(),
      sid: session.externalId,
      mfa: false,
    });

    await this.users.touchLastLogin(user.id, ip, now);
    await this.recordAttempt({
      userId: user.id,
      emailAttempted: emailNormalized,
      ip,
      userAgent: ua,
      outcome: 'success',
      mfaUsed: false,
    });

    return {
      accessToken,
      refreshToken: refreshPlain,
      expiresIn: 15 * 60,
      user: toPublicSnapshot(fullUser),
      requiresPasswordReset: user.needsPasswordReset(),
    };
  }

  private async maybeLock(userId: bigint, now: Date): Promise<void> {
    const failures = await this.users.countRecentFailures(userId, FAILURE_WINDOW_MIN);
    // El intento actual aún no se contó (registerLoginAttempt fue antes
    // que esta llamada y countRecentFailures lo incluye). Por eso
    // `failures >= MAX_FAILURES` (no `>`).
    if (failures >= MAX_FAILURES) {
      const until = new Date(now.getTime() + LOCKOUT_MIN * 60_000);
      await this.users.lockUser(userId, until);
      this.logger.warn(
        `User ${String(userId)} bloqueado hasta ${until.toISOString()} tras ${String(failures)} fallos`,
      );
    }
  }

  private async recordAttempt(attempt: {
    userId: bigint | null;
    emailAttempted: string;
    ip: string;
    userAgent: string | null;
    outcome: LoginOutcome;
    mfaUsed: boolean;
  }): Promise<void> {
    await this.users.registerLoginAttempt(attempt);
  }

  private unauthorizedGeneric(): UnauthorizedException {
    // Mensaje genérico — nunca distinguir email-no-existe de password-mala
    // de cuenta-bloqueada. La info exacta queda en login_attempts (audit).
    return new UnauthorizedException({
      error: 'Unauthorized',
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Credenciales inválidas',
    });
  }
}

function mapDomainErrorToOutcome(e: unknown): LoginOutcome {
  if (e instanceof DomainError) {
    if (e.code === 'AUTH_USER_LOCKED') return 'locked';
    if (e.code === 'AUTH_USER_INACTIVE') return 'inactive';
  }
  return 'bad_password';
}

function toPublicSnapshot(u: UserWithPermissions): PublicUserSnapshot {
  return {
    id: u.id.toString(),
    externalId: u.externalId,
    email: u.email,
    displayName: u.displayName,
    organizationId: u.organizationId.toString(),
    organizationName: u.organizationName,
    organizationType: u.organizationType,
    permissions: u.permissions,
    roles: u.roles,
  };
}
