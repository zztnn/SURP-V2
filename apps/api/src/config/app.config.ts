import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsOrigins: readonly string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv'] | undefined) ?? 'development',
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    corsOrigins:
      process.env.CORS_ORIGIN?.split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0) ?? [],
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel'] | undefined) ?? 'info',
  }),
);
