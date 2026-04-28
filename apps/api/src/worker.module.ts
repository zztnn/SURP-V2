import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common';
import { StorageModule } from './common/storage';
import { appConfig, databaseConfig, jwtConfig, validateEnv } from './config';
import { DatabaseModule } from './database/database.module';
import { IncidentsExportModule } from './modules/incidents/exports/incidents-export.module';
import { NotificationsModule } from './modules/notifications';

/**
 * WorkerModule — bootstrap dual-mode con `WORKER_MODE=true`.
 *
 * Diferencia con AppModule:
 *   - NO carga HealthModule, AuthModule, BlocksModule (esos son para HTTP).
 *   - SÍ carga ConfigModule + DatabaseModule (necesarios para que repos funcionen).
 *   - SÍ carga NotificationsModule.forWorker() — registra el processor BullMQ.
 *
 * Conforme se sumen workers (statistics-views-refresh, etc.), cada uno
 * agrega su `Module.forWorker()` aquí.
 */
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
    StorageModule.forRoot(),
    DatabaseModule,
    NotificationsModule.forWorker(),
    IncidentsExportModule.forWorker(),
  ],
})
export class WorkerModule {}
