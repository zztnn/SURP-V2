import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  poolMax: number;
}

export default registerAs('database', (): DatabaseConfig => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL no está definida');
  }
  return {
    url,
    poolMax: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
  };
});
