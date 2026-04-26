import { Inject, Logger, Module, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DatabaseConfig } from '../config';
import type { DB } from './generated/database.types';
import { DATABASE } from './database.token';

const logger = new Logger('DatabaseModule');

const databaseProvider: Provider = {
  provide: DATABASE,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Kysely<DB> => {
    const dbConfig = config.get<DatabaseConfig>('database');
    if (!dbConfig) {
      throw new Error('database config no registrada — verificar load: [databaseConfig]');
    }

    const pool = new Pool({
      connectionString: dbConfig.url,
      max: dbConfig.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err: Error) => {
      logger.error('Pool error', err.stack);
    });

    // CamelCasePlugin convierte camelCase ↔ snake_case en runtime para
    // matchear la convención de los tipos generados por kysely-codegen
    // (que usamos con --camel-case). Sin este plugin, las queries
    // generan SQL con identificadores camelCase literales y Postgres
    // (snake_case) los rechaza con `column "..." does not exist`.
    return new Kysely<DB>({
      dialect: new PostgresDialect({ pool }),
      plugins: [new CamelCasePlugin()],
    });
  },
};

@Module({
  providers: [databaseProvider],
  exports: [DATABASE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
    logger.log('Kysely pool cerrado');
  }
}
