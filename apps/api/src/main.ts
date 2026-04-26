import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { LoggingInterceptor, buildValidationPipe } from './common';
import type { AppConfig } from './config';
import { WorkerModule } from './worker.module';

const BOOTSTRAP_TIMEOUT_MS = 60_000;

async function bootstrap(clearWatchdog: () => void): Promise<void> {
  if (process.env.WORKER_MODE === 'true') {
    const app = await NestFactory.createApplicationContext(WorkerModule);
    await app.init();
    Logger.log('Worker arrancado — sin HTTP listener', 'Bootstrap');
    // Limpiamos el watchdog ANTES de bloquear, porque "init OK + queue
    // listening" ya es bootstrap completo en modo worker. Sin este clear,
    // el setTimeout dispararía a los 60s y mataría al worker en vivo.
    clearWatchdog();
    // Mantenemos el proceso vivo. El worker procesa jobs en background
    // vía los listeners BullMQ que se registraron en `onModuleInit`.
    await new Promise<never>(() => {});
    return;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const appCfg = config.get<AppConfig>('app');
  if (!appCfg) {
    throw new Error('app config no registrada');
  }

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(buildValidationPipe());
  // PostgresErrorFilter se registra como APP_FILTER en app.module.ts
  // (necesita DI para acceder al HttpAdapterHost).
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (appCfg.corsOrigins.length > 0) {
    app.enableCors({
      origin: [...appCfg.corsOrigins],
      credentials: true,
    });
  }

  await app.listen(appCfg.port);
  Logger.log(`HTTP API arrancada en puerto ${String(appCfg.port)}`, 'Bootstrap');
}

const bootWatchdog = setTimeout(() => {
  Logger.error('Bootstrap superó 60s — abortando', 'Bootstrap');
  process.exit(1);
}, BOOTSTRAP_TIMEOUT_MS);

const clearWatchdog = (): void => {
  clearTimeout(bootWatchdog);
};

bootstrap(clearWatchdog)
  .catch((err: unknown) => {
    Logger.error('Fallo durante bootstrap', err instanceof Error ? err.stack : err, 'Bootstrap');
    process.exit(1);
  })
  .finally(() => {
    clearWatchdog();
  });
