import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonModule } from '../../common';
import { DatabaseModule } from '../../database/database.module';
import { BullMQNotificationQueue } from './infrastructure/bullmq-notification-queue';
import { HandlebarsTemplateRenderer } from './infrastructure/handlebars-template-renderer';
import { KyselyNotificationRepository } from './infrastructure/kysely-notification.repository';
import { KyselyTemplateRepository } from './infrastructure/kysely-template.repository';
import { NodemailerLocalDriver } from './infrastructure/nodemailer-local-driver';
import { NotificationDispatchProcessor } from './infrastructure/notification-dispatch.processor';
import { REDIS_CONFIG, type RedisConfig } from './infrastructure/redis-config.token';
import { SMTP_CONFIG, type SmtpConfig } from './infrastructure/smtp-config.token';
import { EMAIL_DRIVER } from './ports/email-driver.port';
import { NOTIFICATION_QUEUE } from './ports/notification-queue.port';
import { NOTIFICATION_REPOSITORY } from './ports/notification.repository.port';
import { TEMPLATE_RENDERER } from './ports/template-renderer.port';
import { TEMPLATE_REPOSITORY } from './ports/template.repository.port';
import { DispatchNotificationUseCase } from './use-cases/dispatch-notification.use-case';
import { EnqueueNotificationUseCase } from './use-cases/enqueue-notification.use-case';

const redisConfigProvider: Provider = {
  provide: REDIS_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisConfig => ({
    host: config.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(config.get<string>('REDIS_PORT') ?? '6379'),
  }),
};

const smtpConfigProvider: Provider = {
  provide: SMTP_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SmtpConfig => ({
    host: config.get<string>('SMTP_HOST') ?? 'localhost',
    port: Number(config.get<string>('SMTP_PORT') ?? '1025'),
  }),
};

const PROVIDERS: Provider[] = [
  // config
  redisConfigProvider,
  smtpConfigProvider,
  // adapters ↔ ports
  { provide: NOTIFICATION_REPOSITORY, useClass: KyselyNotificationRepository },
  { provide: TEMPLATE_REPOSITORY, useClass: KyselyTemplateRepository },
  { provide: NOTIFICATION_QUEUE, useClass: BullMQNotificationQueue },
  { provide: TEMPLATE_RENDERER, useClass: HandlebarsTemplateRenderer },
  { provide: EMAIL_DRIVER, useClass: NodemailerLocalDriver },
  // use cases (siempre disponibles — el worker usa Dispatch, la API usa Enqueue)
  EnqueueNotificationUseCase,
  DispatchNotificationUseCase,
];

/**
 * `NotificationsModule.forApi()` — solo el lado API: encola jobs.
 * `NotificationsModule.forWorker()` — incluye el processor que consume.
 *
 * Ambos comparten dominio + adapters de BD/SMTP. El processor
 * adicional (`NotificationDispatchProcessor`) es lo único que diverge.
 */
@Module({})
export class NotificationsModule {
  static forApi(): DynamicModule {
    return {
      module: NotificationsModule,
      // global=true para que cualquier módulo de dominio pueda inyectar
      // EnqueueNotificationUseCase sin re-importar este módulo (lo que
      // crearía instancias duplicadas y BullMQ Queue duplicado).
      global: true,
      imports: [CommonModule, DatabaseModule],
      providers: PROVIDERS,
      exports: [EnqueueNotificationUseCase],
    };
  }

  static forWorker(): DynamicModule {
    return {
      module: NotificationsModule,
      global: true,
      imports: [CommonModule, DatabaseModule],
      providers: [...PROVIDERS, NotificationDispatchProcessor],
      exports: [],
    };
  }
}
