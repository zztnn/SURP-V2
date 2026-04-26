import type { Notification } from '../domain/notification';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationRepositoryPort {
  /** INSERT — devuelve la entidad con id/externalId hidratados. */
  save(notification: Notification): Promise<Notification>;

  /** UPDATE de columnas mutables (status, attempts, last_error, sent_at, failed_at, message ids, rendered_subject). */
  persist(notification: Notification): Promise<Notification>;

  findById(id: bigint): Promise<Notification | null>;
}
