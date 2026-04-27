import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { RequestContextService, type RequestContext } from '../../../common';
import { type NotificationDispatchJob } from '../ports/notification-queue.port';
import { DispatchNotificationUseCase } from '../use-cases/dispatch-notification.use-case';
import { NOTIFICATION_DISPATCH_QUEUE } from './bullmq-notification-queue';
import { REDIS_CONFIG, type RedisConfig } from './redis-config.token';

/**
 * Worker BullMQ que consume jobs de la cola `notification-dispatch`.
 *
 * Solo se registra en `WorkerModule` (cuando WORKER_MODE=true). La API
 * HTTP NO lo carga — eso evita que el listener HTTP procese jobs
 * cuando hay workers dedicados en producción.
 *
 * Responsabilidades:
 *   - Construir RequestContext sintético (source: 'job') para que los
 *     loggers / auditors tengan correlation id.
 *   - Delegar a `DispatchNotificationUseCase`.
 *   - Atrapar excepciones — si el use case lanza, BullMQ reintentará
 *     según los `defaultJobOptions` definidos en `bullmq-notification-queue.ts`.
 */
@Injectable()
export class NotificationDispatchProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);
  private worker: Worker<NotificationDispatchJob> | null = null;

  constructor(
    @Inject(REDIS_CONFIG) private readonly redisConfig: RedisConfig,
    private readonly dispatchUseCase: DispatchNotificationUseCase,
    private readonly contextService: RequestContextService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<NotificationDispatchJob>(
      NOTIFICATION_DISPATCH_QUEUE,
      async (job: Job<NotificationDispatchJob>) => {
        const ctx: RequestContext = {
          requestId: randomUUID(),
          userId: null,
          organizationId: null,
          organizationType: null,
          ip: null,
          userAgent: 'bullmq-worker',
          source: 'job',
          startedAt: new Date(),
          sessionExternalId: null,
        };
        await this.contextService.runWithContext(ctx, () =>
          this.dispatchUseCase.execute({ notificationId: BigInt(job.data.notificationId) }, ctx),
        );
      },
      {
        connection: { host: this.redisConfig.host, port: this.redisConfig.port },
        concurrency: 4,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id ?? '?'} falló (attempts ${String(job?.attemptsMade ?? 0)}): ${err.message}`,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id ?? '?'} completado`);
    });

    this.logger.log(`Worker BullMQ corriendo — cola=${NOTIFICATION_DISPATCH_QUEUE}, concurrency=4`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
