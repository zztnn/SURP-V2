import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import {
  Notification,
  type NotificationRecipient,
  type TransportDriver,
} from '../domain/notification';
import { NOTIFICATION_QUEUE, type NotificationQueuePort } from '../ports/notification-queue.port';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from '../ports/notification.repository.port';
import {
  TEMPLATE_REPOSITORY,
  type TemplateRepositoryPort,
} from '../ports/template.repository.port';

export interface EnqueueNotificationInput {
  code: string;
  recipients: readonly NotificationRecipient[];
  context: Record<string, unknown>;
}

export interface EnqueueNotificationResult {
  notificationId: string;
  externalId: string;
  status: string;
}

const TRANSPORT_DRIVER: TransportDriver = 'local';

@Injectable()
export class EnqueueNotificationUseCase {
  private readonly logger = new Logger(EnqueueNotificationUseCase.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepositoryPort,
    @Inject(TEMPLATE_REPOSITORY) private readonly templates: TemplateRepositoryPort,
    @Inject(NOTIFICATION_QUEUE) private readonly queue: NotificationQueuePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: EnqueueNotificationInput,
    ctx: RequestContext,
  ): Promise<EnqueueNotificationResult> {
    const template = await this.templates.findByCode(input.code);
    if (!template) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'NOTIFICATION_TEMPLATE_NOT_FOUND',
        message: `Template ${input.code} no existe`,
      });
    }
    if (!template.enabled) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'NOTIFICATION_TEMPLATE_DISABLED',
        message: `Template ${input.code} está deshabilitada`,
      });
    }

    const notification = Notification.enqueue({
      code: input.code,
      recipients: input.recipients,
      context: input.context,
      transportDriver: TRANSPORT_DRIVER,
      queuedAt: this.clock.now(),
      triggeredByUserId: ctx.userId,
    });

    const persisted = await this.notifications.save(notification);
    const id = persisted.id;
    const externalId = persisted.externalId;
    if (id === null || externalId === null) {
      throw new Error('Notification persistida sin id/externalId — bug en repo.save');
    }

    try {
      await this.queue.enqueueDispatch({ notificationId: id.toString() });
    } catch (e) {
      // Si la cola está caída, dejamos la fila como queued y un job
      // periódico (post-MVP) la re-encola. NO lanzamos para no bloquear
      // al caller — el bloqueo de F7 ya quedó persistido.
      this.logger.error(
        `Falló enqueue de notification ${id.toString()} en BullMQ — quedará pendiente para retry: ${(e as Error).message}`,
      );
    }

    return {
      notificationId: id.toString(),
      externalId,
      status: persisted.status,
    };
  }
}
