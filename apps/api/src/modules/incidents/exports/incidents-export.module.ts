import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CommonModule } from '../../../common';
import { DatabaseModule } from '../../../database/database.module';
import { BullMQIncidentExportQueue } from './infrastructure/bullmq-incident-export-queue';
import { KyselyExportJobRepository } from './infrastructure/kysely-export-job.repository';
import { REDIS_CONFIG, type RedisConfig } from './infrastructure/redis-config.token';
import { EXPORT_JOB_REPOSITORY } from './ports/export-job.repository.port';
import { INCIDENT_EXPORT_QUEUE } from './ports/incident-export-queue.port';
import { EnqueueIncidentExportUseCase } from './use-cases/enqueue-incident-export.use-case';
import { GetExportJobStatusUseCase } from './use-cases/get-export-job-status.use-case';

const redisConfigProvider: Provider = {
  provide: REDIS_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisConfig => ({
    host: config.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(config.get<string>('REDIS_PORT') ?? '6379'),
  }),
};

const SHARED_PROVIDERS: Provider[] = [
  redisConfigProvider,
  { provide: EXPORT_JOB_REPOSITORY, useClass: KyselyExportJobRepository },
  { provide: INCIDENT_EXPORT_QUEUE, useClass: BullMQIncidentExportQueue },
];

const API_USE_CASES: Provider[] = [EnqueueIncidentExportUseCase, GetExportJobStatusUseCase];

/**
 * `IncidentsExportModule.forApi()` — productor: encola jobs y lee status.
 * `IncidentsExportModule.forWorker()` — incluye el processor (paso 4b).
 *
 * Ambos comparten el repository + queue port. La diferencia es que el
 * worker registra el `IncidentExportProcessor` que consume.
 */
@Module({})
export class IncidentsExportModule {
  static forApi(): DynamicModule {
    return {
      module: IncidentsExportModule,
      imports: [CommonModule, DatabaseModule],
      providers: [...SHARED_PROVIDERS, ...API_USE_CASES],
      exports: [EnqueueIncidentExportUseCase, GetExportJobStatusUseCase],
    };
  }

  static forWorker(): DynamicModule {
    // En 4b se agrega `IncidentExportProcessor` y `IncidentExportDataPort`
    // adapter. Por ahora solo expone los providers compartidos para que
    // el worker pueda persistir transiciones de estado cuando esté listo.
    return {
      module: IncidentsExportModule,
      imports: [CommonModule, DatabaseModule],
      providers: SHARED_PROVIDERS,
      exports: [EXPORT_JOB_REPOSITORY],
    };
  }
}
