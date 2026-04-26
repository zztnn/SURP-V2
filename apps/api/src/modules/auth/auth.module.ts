import { Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CommonModule } from '../../common';
import type { JwtConfig } from '../../config';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { JWT_CONFIG, type JwtAuthConfig } from './infrastructure/jwt-config.token';
import { JwtTokenIssuer } from './infrastructure/jwt-token-issuer';
import { KyselySessionRepository } from './infrastructure/kysely-session.repository';
import { KyselyUserRepository } from './infrastructure/kysely-user.repository';
import { UaParserDeviceDetector } from './infrastructure/ua-parser-device-detector';
import { DEVICE_DETECTOR } from './ports/device-detector.port';
import { PASSWORD_HASHER } from './ports/password-hasher.port';
import { SESSION_REPOSITORY } from './ports/session.repository.port';
import { TOKEN_ISSUER } from './ports/token-issuer.port';
import { USER_REPOSITORY } from './ports/user.repository.port';
import { GetCurrentUserUseCase } from './use-cases/get-current-user.use-case';
import { ListMyLoginAttemptsUseCase } from './use-cases/list-my-login-attempts.use-case';
import { ListMySessionsUseCase } from './use-cases/list-my-sessions.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokenUseCase } from './use-cases/refresh-token.use-case';
import { RevokeMySessionUseCase } from './use-cases/revoke-my-session.use-case';

const ISSUER = 'surp-api';
const AUDIENCE = 'surp-web';

const jwtConfigProvider: Provider = {
  provide: JWT_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): JwtAuthConfig => {
    const cfg = config.get<JwtConfig>('jwt');
    if (!cfg) throw new Error('jwt config no registrada');
    if (!cfg.secret) {
      throw new Error('JWT_SECRET no seteado — auth requiere secret en todos los entornos');
    }
    return {
      secret: cfg.secret,
      accessExpiresIn: cfg.expiresIn,
      issuer: ISSUER,
      audience: AUDIENCE,
    };
  },
};

@Module({
  imports: [CommonModule, DatabaseModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    // config
    jwtConfigProvider,
    // use cases
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    ListMyLoginAttemptsUseCase,
    ListMySessionsUseCase,
    RevokeMySessionUseCase,
    // adaptadores ↔ puertos
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: SESSION_REPOSITORY, useClass: KyselySessionRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
    { provide: DEVICE_DETECTOR, useClass: UaParserDeviceDetector },
    // CLOCK viene del CommonModule (registrado en common.module.ts).
  ],
  // TOKEN_ISSUER se exporta para que F6.6 (JwtAuthGuard) lo inyecte
  // sin tener que duplicar el provider.
  exports: [TOKEN_ISSUER, USER_REPOSITORY, GetCurrentUserUseCase],
})
export class AuthModule {}
