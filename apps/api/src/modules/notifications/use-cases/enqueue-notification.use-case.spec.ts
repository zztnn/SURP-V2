import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { CLOCK, type RequestContext } from '../../../common';
import { Notification } from '../domain/notification';
import type { NotificationTemplate } from '../domain/notification-template';
import { NOTIFICATION_QUEUE } from '../ports/notification-queue.port';
import { NOTIFICATION_REPOSITORY } from '../ports/notification.repository.port';
import { TEMPLATE_REPOSITORY } from '../ports/template.repository.port';
import { EnqueueNotificationUseCase } from './enqueue-notification.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');
const CTX: RequestContext = {
  requestId: 'r',
  userId: 1n,
  organizationId: 10n,
  ip: null,
  userAgent: null,
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

const TEMPLATE: NotificationTemplate = {
  code: 'block.granted_without_incident',
  subjectTemplate: 'Bloqueo {{blockId}} sin incidente',
  bodyMjml: '',
  plainFallbackTemplate: 'Hola {{userName}}, hay un bloqueo {{blockId}}.',
  enabled: true,
  locale: 'es-CL',
  senderAddress: 'donotreply@surp.cl',
  senderDisplayName: 'SURP',
};

interface Mocks {
  notifications: { save: jest.Mock; persist: jest.Mock; findById: jest.Mock };
  templates: { findByCode: jest.Mock };
  queue: { enqueueDispatch: jest.Mock };
  clock: { now: jest.Mock };
}

function freshMocks(template: NotificationTemplate | null): Mocks {
  return {
    notifications: {
      save: jest
        .fn()
        .mockImplementation((n: Notification) =>
          Promise.resolve(
            Notification.fromSnapshot({ ...n.toSnapshot(), id: 100n, externalId: 'uuid-100' }),
          ),
        ),
      persist: jest.fn(),
      findById: jest.fn(),
    },
    templates: { findByCode: jest.fn().mockResolvedValue(template) },
    queue: { enqueueDispatch: jest.fn().mockResolvedValue(undefined) },
    clock: { now: jest.fn().mockReturnValue(NOW) },
  };
}

async function build(mocks: Mocks): Promise<EnqueueNotificationUseCase> {
  const m = await Test.createTestingModule({
    providers: [
      EnqueueNotificationUseCase,
      { provide: NOTIFICATION_REPOSITORY, useValue: mocks.notifications },
      { provide: TEMPLATE_REPOSITORY, useValue: mocks.templates },
      { provide: NOTIFICATION_QUEUE, useValue: mocks.queue },
      { provide: CLOCK, useValue: mocks.clock },
    ],
  }).compile();
  return m.get(EnqueueNotificationUseCase);
}

describe('EnqueueNotificationUseCase', () => {
  it('happy path: persiste y encola', async () => {
    const mocks = freshMocks(TEMPLATE);
    const uc = await build(mocks);

    const r = await uc.execute(
      {
        code: TEMPLATE.code,
        recipients: [{ email: 'admin@arauco.cl', userId: null }],
        context: { blockId: '5' },
      },
      CTX,
    );

    expect(r.notificationId).toBe('100');
    expect(r.status).toBe('queued');
    expect(mocks.notifications.save).toHaveBeenCalledTimes(1);
    expect(mocks.queue.enqueueDispatch).toHaveBeenCalledWith({ notificationId: '100' });
  });

  it('rechaza si template no existe (422)', async () => {
    const mocks = freshMocks(null);
    const uc = await build(mocks);
    await expect(
      uc.execute(
        {
          code: 'no.existe',
          recipients: [{ email: 'a@b.cl', userId: null }],
          context: {},
        },
        CTX,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(mocks.notifications.save).not.toHaveBeenCalled();
  });

  it('rechaza si template está disabled (422)', async () => {
    const mocks = freshMocks({ ...TEMPLATE, enabled: false });
    const uc = await build(mocks);
    await expect(
      uc.execute(
        {
          code: TEMPLATE.code,
          recipients: [{ email: 'a@b.cl', userId: null }],
          context: {},
        },
        CTX,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('si la cola falla, NO lanza (best-effort) — la fila queda queued', async () => {
    const mocks = freshMocks(TEMPLATE);
    mocks.queue.enqueueDispatch.mockRejectedValue(new Error('Redis down'));
    const uc = await build(mocks);

    const r = await uc.execute(
      {
        code: TEMPLATE.code,
        recipients: [{ email: 'a@b.cl', userId: null }],
        context: {},
      },
      CTX,
    );
    expect(r.status).toBe('queued');
    expect(mocks.notifications.save).toHaveBeenCalledTimes(1);
  });
});
