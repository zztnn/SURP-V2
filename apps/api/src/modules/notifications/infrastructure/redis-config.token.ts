export const REDIS_CONFIG = Symbol('REDIS_CONFIG');

export interface RedisConfig {
  host: string;
  port: number;
}
