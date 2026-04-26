import { Inject, Injectable } from '@nestjs/common';
import { type Kysely } from 'kysely';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import type { NotificationTemplate } from '../domain/notification-template';
import type { TemplateRepositoryPort } from '../ports/template.repository.port';

@Injectable()
export class KyselyTemplateRepository implements TemplateRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async findByCode(code: string): Promise<NotificationTemplate | null> {
    const row = await this.db
      .selectFrom('notificationTemplates')
      .select([
        'code',
        'subjectTemplate',
        'bodyMjml',
        'plainFallbackTemplate',
        'enabled',
        'locale',
        'senderAddress',
        'senderDisplayName',
      ])
      .where('code', '=', code)
      .executeTakeFirst();
    if (!row) return null;
    return {
      code: row.code,
      subjectTemplate: row.subjectTemplate,
      bodyMjml: row.bodyMjml,
      plainFallbackTemplate: row.plainFallbackTemplate,
      enabled: row.enabled,
      locale: row.locale,
      senderAddress: row.senderAddress,
      senderDisplayName: row.senderDisplayName,
    };
  }
}
