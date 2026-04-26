import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthPermissionsModule } from './auth';
import {
  AuthContextInterceptor,
  CommonModule,
  JwtAuthGuard,
  PermissionGuard,
  PostgresErrorFilter,
} from './common';
import { appConfig, databaseConfig, jwtConfig, validateEnv } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth';
import { BlocksModule } from './modules/blocks';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { NotificationsModule } from './modules/notifications';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, jwtConfig],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    CommonModule,
    DatabaseModule,
    AuthPermissionsModule,
    AuthModule,
    NotificationsModule.forApi(),
    BlocksModule,
    IncidentsModule,
    HealthModule,
  ],
  providers: [
    // Guards globales — orden importa: JwtAuthGuard primero (autentica
    // y monta surpContext), luego PermissionGuard (lee surpUser).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    // Interceptor global que envuelve el handler en el AsyncLocalStorage
    // de RequestContext (lo lee desde req.surpContext que el guard llenó).
    { provide: APP_INTERCEPTOR, useClass: AuthContextInterceptor },
    // Filter global — atrapa Postgres errors y los mapea a HTTP. No-pg
    // y HttpException los delega al BaseExceptionFilter de NestJS.
    { provide: APP_FILTER, useClass: PostgresErrorFilter },
  ],
})
export class AppModule {}
