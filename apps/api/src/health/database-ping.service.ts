import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { DATABASE, type DB } from '../database';

@Injectable()
export class DatabasePingService {
  private readonly logger = new Logger(DatabasePingService.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async ping(): Promise<'ok' | 'unreachable'> {
    try {
      await sql`SELECT 1`.execute(this.db);
      return 'ok';
    } catch (err: unknown) {
      this.logger.error('DB ping falló', err instanceof Error ? err.stack : err);
      return 'unreachable';
    }
  }
}
