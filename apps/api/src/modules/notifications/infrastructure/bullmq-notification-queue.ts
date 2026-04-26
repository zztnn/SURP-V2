import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  type NotificationDispatchJob,
  type NotificationQueuePort,
} from '../ports/notification-queue.port';
import { REDIS_CONFIG, type RedisConfig } from './redis-config.token';

export const NOTIFICATION_DISPATCH_QUEUE = 'notification-dispatch';

@Injectable()
export class BullMQNotificationQueue implements NotificationQueuePort, OnModuleDestroy {
  private readonly queue: Queue<NotificationDispatchJob>;

  constructor(@Inject(REDIS_CONFIG) cfg: RedisConfig) {
    this.queue = new Queue<NotificationDispatchJob>(NOTIFICATION_DISPATCH_QUEUE, {
      connection: { host: cfg.host, port: cfg.port },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 7 * 86_400, count: 1_000 },
        removeOnFail: { age: 30 * 86_400 },
      },
    });
  }

  async enqueueDispatch(job: NotificationDispatchJob): Promise<void> {
    await this.queue.add('dispatch', job, {
      // jobId determinístico → si el use case se ejecuta dos veces con
      // el mismo notificationId, BullMQ deduplica.
      jobId: `notif-${job.notificationId}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
