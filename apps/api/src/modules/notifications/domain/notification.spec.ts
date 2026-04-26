import { DomainError } from '../../../common';
import { Notification } from './notification';

const NOW = new Date('2026-04-25T12:00:00Z');
const BASE = {
  code: 'block.granted_without_incident',
  recipients: [{ email: 'admin@arauco.cl', userId: 1n }],
  context: { blockId: '5', target: 'party/3' } as Record<string, unknown>,
  transportDriver: 'local' as const,
  queuedAt: NOW,
  triggeredByUserId: 1n,
};

describe('Notification.enqueue', () => {
  it('crea con status=queued y attempts=0', () => {
    const n = Notification.enqueue(BASE);
    expect(n.status).toBe('queued');
    expect(n.attempts).toBe(0);
    expect(n.id).toBeNull();
    expect(n.recipients).toHaveLength(1);
  });

  it('rechaza code vacío', () => {
    expect(() => Notification.enqueue({ ...BASE, code: '   ' })).toThrow(DomainError);
  });

  it('rechaza recipients vacíos', () => {
    expect(() => Notification.enqueue({ ...BASE, recipients: [] })).toThrow(DomainError);
  });

  it('rechaza emails inválidos', () => {
    try {
      Notification.enqueue({
        ...BASE,
        recipients: [{ email: 'not-an-email', userId: null }],
      });
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('NOTIFICATION_INVALID_EMAIL');
    }
  });
});

describe('Notification transitions', () => {
  it('happy path: queued → sending → sent', () => {
    const n = Notification.enqueue(BASE);
    n.markSending();
    expect(n.status).toBe('sending');
    expect(n.attempts).toBe(1);

    const at = new Date(NOW.getTime() + 1000);
    n.markSent(at, { smtpMessageId: 'msg-1@mailhog' });
    expect(n.status).toBe('sent');
    expect(n.sentAt).toBe(at);
    expect(n.smtpMessageId).toBe('msg-1@mailhog');
    expect(n.lastError).toBeNull();
  });

  it('queued → sending → failed', () => {
    const n = Notification.enqueue(BASE);
    n.markSending();
    n.markFailed(NOW, 'SMTP timeout');
    expect(n.status).toBe('failed');
    expect(n.lastError).toBe('SMTP timeout');
    expect(n.failedAt).toBe(NOW);
  });

  it('puede reintentar tras failed: failed → sending → sent', () => {
    const n = Notification.enqueue(BASE);
    n.markSending();
    n.markFailed(NOW, 'SMTP timeout');
    n.markSending(); // retry
    expect(n.status).toBe('sending');
    expect(n.attempts).toBe(2);
    n.markSent(NOW, { smtpMessageId: 'msg-2' });
    expect(n.status).toBe('sent');
    expect(n.lastError).toBeNull();
  });

  it('rechaza markSent desde queued (no pasó por sending)', () => {
    const n = Notification.enqueue(BASE);
    expect(() => {
      n.markSent(NOW, { smtpMessageId: 'x' });
    }).toThrow(DomainError);
  });

  it('rechaza markFailed desde queued', () => {
    const n = Notification.enqueue(BASE);
    expect(() => {
      n.markFailed(NOW, 'x');
    }).toThrow(DomainError);
  });

  it('truncate lastError a 2000 chars', () => {
    const n = Notification.enqueue(BASE);
    n.markSending();
    n.markFailed(NOW, 'x'.repeat(3000));
    expect(n.lastError?.length).toBe(2000);
  });
});

describe('Notification.fromSnapshot / toSnapshot', () => {
  it('roundtrip preserva campos mutados', () => {
    const original = Notification.enqueue(BASE);
    original.markSending();
    original.markSent(NOW, { smtpMessageId: 'id-x' });
    const snap = original.toSnapshot();
    const reconstructed = Notification.fromSnapshot({ ...snap, id: 99n, externalId: 'uuid' });
    expect(reconstructed.id).toBe(99n);
    expect(reconstructed.status).toBe('sent');
    expect(reconstructed.smtpMessageId).toBe('id-x');
    expect(reconstructed.attempts).toBe(1);
  });
});
