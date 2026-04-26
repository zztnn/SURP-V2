import type { NotificationTemplate } from '../domain/notification-template';

export const TEMPLATE_REPOSITORY = Symbol('TEMPLATE_REPOSITORY');

export interface TemplateRepositoryPort {
  findByCode(code: string): Promise<NotificationTemplate | null>;
}
