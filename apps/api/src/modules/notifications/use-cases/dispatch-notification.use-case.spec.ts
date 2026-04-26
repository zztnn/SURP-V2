import { Test } from '@nestjs/testing';
import { CLOCK, type RequestContext } from '../../../common';
import { Notification } from '../domain/notification';
import type { NotificationTemplate } from '../domain/notification-template';
import { EMAIL_DRIVER } from '../ports/email-driver.port';
import { NOTIFICATION_REPOSITORY } from '../ports/notification.repository.port';
import { TEMPLATE_REPOSITORY } from '../ports/template.repository.port';
import { TEMPLATE_RENDERER } from '../ports/template-renderer.port';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');
const CTX: RequestContext = {
  requestId: 'r',
  userId: null,
  organizationId: null,
  ip: null,
  userAgent: 'bullmq',
  source: 'job',
  startedAt: NOW,
  sessionExternalId: null,
};

const TEMPLATE: NotificationTemplate = {
  code: 'block.granted_without_incident',
  subjectTemplate: 'Bloqueo {{blockId}}',
  bodyMjml: '',
  plainFallbackTemplate: 'Body {{blockId}}',
  enabled: true,
  locale: 'es-CL',
  senderAddress: 'noreply@surp.cl',
  senderDisplayName: 'SURP',
};

function makeQueued(): Notification {
  return Notification.fromSnapshot({
    id: 100n,
    externalId: 'uuid',
    code: TEMPLATE.code,
    recipients: [{ email: 'admin@arauco.cl', userId: null }],
    context: { blockId: '5' },
    status: 'queued',
    attempts: 0,
    lastError: null,
    transportDriver: 'local',
    smtpMessageId: null,
    acsMessageId: null,
    queuedAt: NOW,
    sentAt: null,
    failedAt: null,
    triggeredByUserId: 1n,
    renderedSubject: null,
  });
}

interface Mocks {
  notifications: { findById: jest.Mock; persist: jest.Mock; save: jest.Mock };
  templates: { findByCode: jest.Mock };
  renderer: { render: jest.Mock };
  driver: { send: jest.Mock };
  clock: { now: jest.Mock };
}

function freshMocks(
  opts: { found?: Notification | null; template?: NotificationTemplate | null } = {},
): Mocks {
  const foundValue = 'found' in opts ? opts.found : makeQueued();
  const templateValue = 'template' in opts ? opts.template : TEMPLATE;
  return {
    notifications: {
      findById: jest.fn().mockResolvedValue(foundValue),
      persist: jest.fn().mockImplementation((n: Notification) => Promise.resolve(n)),
      save: jest.fn(),
    },
    templates: { findByCode: jest.fn().mockResolvedValue(templateValue) },
    renderer: {
      render: jest.fn().mockReturnValue({ subject: 'Bloqueo 5', text: 'Body 5' }),
    },
    driver: {
      send: jest.fn().mockResolvedValue({ smtpMessageId: 'msg-1@mailhog', acsMessageId: null }),
    },
    clock: { now: jest.fn().mockReturnValue(NOW) },
  };
}

async function build(mocks: Mocks): Promise<DispatchNotificationUseCase> {
  const m = await Test.createTestingModule({
    providers: [
      DispatchNotificationUseCase,
      { provide: NOTIFICATION_REPOSITORY, useValue: mocks.notifications },
      { provide: TEMPLATE_REPOSITORY, useValue: mocks.templates },
      { provide: TEMPLATE_RENDERER, useValue: mocks.renderer },
      { provide: EMAIL_DRIVER, useValue: mocks.driver },
      { provide: CLOCK, useValue: mocks.clock },
    ],
  }).compile();
  return m.get(DispatchNotificationUseCase);
}

function lastPersisted(persist: jest.Mock): Notification {
  const calls = persist.mock.calls as unknown as unknown[][];
  if (calls.length === 0) throw new Error('persist no fue llamado');
  const last = calls[calls.length - 1];
  if (!last || last.length === 0) throw new Error('persist call sin args');
  const arg = last[0];
  if (!(arg instanceof Notification)) throw new Error('persist arg no es Notification');
  return arg;
}

describe('DispatchNotificationUseCase', () => {
  it('happy path: queued → sending → sent', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    await uc.execute({ notificationId: 100n }, CTX);
    expect(mocks.driver.send).toHaveBeenCalledTimes(1);
    expect(mocks.notifications.persist).toHaveBeenCalledTimes(2);
    const finalNotif = lastPersisted(mocks.notifications.persist);
    expect(finalNotif.status).toBe('sent');
    expect(finalNotif.smtpMessageId).toBe('msg-1@mailhog');
  });

  it('idempotente: notification ya sent, NO procesa', async () => {
    const sent = Notification.fromSnapshot({
      ...makeQueued().toSnapshot(),
      status: 'sent',
      sentAt: NOW,
      smtpMessageId: 'old',
    });
    const mocks = freshMocks({ found: sent });
    const uc = await build(mocks);
    await uc.execute({ notificationId: 100n }, CTX);
    expect(mocks.driver.send).not.toHaveBeenCalled();
    expect(mocks.notifications.persist).not.toHaveBeenCalled();
  });

  it('notification no existe → no lanza', async () => {
    const mocks = freshMocks({ found: null });
    const uc = await build(mocks);
    await expect(uc.execute({ notificationId: 999n }, CTX)).resolves.toBeUndefined();
    expect(mocks.driver.send).not.toHaveBeenCalled();
  });

  it('template borrado tras encolar → markFailed sin enviar', async () => {
    const mocks = freshMocks({ template: null });
    const uc = await build(mocks);
    await uc.execute({ notificationId: 100n }, CTX);
    expect(mocks.driver.send).not.toHaveBeenCalled();
    expect(lastPersisted(mocks.notifications.persist).status).toBe('failed');
  });

  it('driver lanza → markFailed con razón', async () => {
    const mocks = freshMocks();
    mocks.driver.send.mockRejectedValue(new Error('SMTP timeout'));
    const uc = await build(mocks);
    await uc.execute({ notificationId: 100n }, CTX);
    const final = lastPersisted(mocks.notifications.persist);
    expect(final.status).toBe('failed');
    expect(final.lastError).toContain('SMTP timeout');
  });

  it('render lanza → markFailed sin llamar driver', async () => {
    const mocks = freshMocks();
    mocks.renderer.render.mockImplementation(() => {
      throw new Error('Variable {{nada}} sin valor');
    });
    const uc = await build(mocks);
    await uc.execute({ notificationId: 100n }, CTX);
    expect(mocks.driver.send).not.toHaveBeenCalled();
    expect(lastPersisted(mocks.notifications.persist).status).toBe('failed');
  });
});
