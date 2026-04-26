import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import { EMAIL_DRIVER, type EmailDriverPort, type EmailEnvelope } from '../ports/email-driver.port';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from '../ports/notification.repository.port';
import {
  TEMPLATE_REPOSITORY,
  type TemplateRepositoryPort,
} from '../ports/template.repository.port';
import { TEMPLATE_RENDERER, type TemplateRendererPort } from '../ports/template-renderer.port';

export interface DispatchNotificationInput {
  notificationId: bigint;
}

/**
 * Use case ejecutado por el `NotificationDispatchProcessor` del worker:
 *
 *   1. Carga la fila por id (ya persistida por EnqueueNotification).
 *   2. Si no existe o está fuera de queued/failed, NO procesa (idempotente).
 *   3. markSending().
 *   4. Carga template, renderiza subject + body.
 *   5. driver.send().
 *   6. markSent() o markFailed().
 *   7. persist().
 *
 * Cada error se atrapa: el processor NO debe lanzar excepciones que
 * BullMQ tomaría como retry agresivo. Si llegamos a un estado
 * irrecuperable (template borrado, etc.), markFailed con razón clara.
 */
@Injectable()
export class DispatchNotificationUseCase {
  private readonly logger = new Logger(DispatchNotificationUseCase.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepositoryPort,
    @Inject(TEMPLATE_REPOSITORY) private readonly templates: TemplateRepositoryPort,
    @Inject(TEMPLATE_RENDERER) private readonly renderer: TemplateRendererPort,
    @Inject(EMAIL_DRIVER) private readonly driver: EmailDriverPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: DispatchNotificationInput, _ctx: RequestContext): Promise<void> {
    const notification = await this.notifications.findById(input.notificationId);
    if (!notification) {
      this.logger.warn(`Notification ${input.notificationId.toString()} no existe — job ignorado`);
      return;
    }
    if (notification.status !== 'queued' && notification.status !== 'failed') {
      this.logger.warn(
        `Notification ${input.notificationId.toString()} en status=${notification.status} — job ignorado (idempotente)`,
      );
      return;
    }

    notification.markSending();
    await this.notifications.persist(notification);

    const template = await this.templates.findByCode(notification.code);
    if (!template || !template.enabled) {
      const reason = !template
        ? `Template ${notification.code} ya no existe`
        : `Template ${notification.code} fue deshabilitada`;
      notification.markFailed(this.clock.now(), reason);
      await this.notifications.persist(notification);
      return;
    }

    let envelope: EmailEnvelope;
    try {
      const rendered = this.renderer.render({
        subjectTemplate: template.subjectTemplate,
        plainTemplate: template.plainFallbackTemplate ?? '',
        context: notification.context,
      });
      notification.recordRenderedSubject(rendered.subject);
      envelope = {
        from: { address: template.senderAddress, displayName: template.senderDisplayName },
        to: notification.recipients.map((r) => r.email),
        subject: rendered.subject,
        text: rendered.text,
      };
    } catch (e) {
      notification.markFailed(this.clock.now(), `Render falló: ${(e as Error).message}`);
      await this.notifications.persist(notification);
      return;
    }

    try {
      const result = await this.driver.send(envelope);
      notification.markSent(this.clock.now(), {
        ...(result.smtpMessageId !== null ? { smtpMessageId: result.smtpMessageId } : {}),
        ...(result.acsMessageId !== null ? { acsMessageId: result.acsMessageId } : {}),
      });
      await this.notifications.persist(notification);
      this.logger.log(
        `Notification ${input.notificationId.toString()} enviada (smtp=${result.smtpMessageId ?? 'n/a'})`,
      );
    } catch (e) {
      notification.markFailed(this.clock.now(), `Driver falló: ${(e as Error).message}`);
      await this.notifications.persist(notification);
      this.logger.error(
        `Notification ${input.notificationId.toString()} falló: ${(e as Error).message}`,
      );
    }
  }
}
