import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validBase = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/surp',
    JWT_SECRET: 'a'.repeat(32),
    STORAGE_LOCAL_HMAC_SECRET: 'b'.repeat(32),
  };

  it('acepta defaults razonables en development', () => {
    const env = validateEnv({ ...validBase, NODE_ENV: 'development' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.JWT_SECRET).toHaveLength(32);
  });

  it('rechaza DATABASE_URL faltante', () => {
    expect(() => validateEnv({ JWT_SECRET: 'a'.repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it('rechaza DATABASE_URL no válida', () => {
    expect(() => validateEnv({ DATABASE_URL: 'no-es-url', JWT_SECRET: 'a'.repeat(32) })).toThrow(
      /URL válido/,
    );
  });

  it('rechaza JWT_SECRET faltante en cualquier entorno', () => {
    expect(() => validateEnv({ DATABASE_URL: validBase.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('rechaza JWT_SECRET < 32 chars', () => {
    expect(() => validateEnv({ ...validBase, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });

  it('rechaza NODE_ENV inválido', () => {
    expect(() => validateEnv({ ...validBase, NODE_ENV: 'staging' })).toThrow();
  });

  it('coerce PORT desde string', () => {
    const env = validateEnv({ ...validBase, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('rechaza PORT no positivo', () => {
    expect(() => validateEnv({ ...validBase, PORT: '-1' })).toThrow();
  });

  it('exige JWT_SECRET >= 64 chars en production', () => {
    expect(() => validateEnv({ ...validBase, NODE_ENV: 'production' })).toThrow(/64 caracteres/);
    expect(() =>
      validateEnv({ ...validBase, NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(50) }),
    ).toThrow(/64 caracteres/);
  });

  it('acepta production con JWT_SECRET >= 64 chars', () => {
    const env = validateEnv({
      ...validBase,
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(64),
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.JWT_SECRET).toHaveLength(64);
  });

  it('rechaza LOG_LEVEL inválido', () => {
    expect(() => validateEnv({ ...validBase, LOG_LEVEL: 'verbose' })).toThrow();
  });

  it('parsea WORKER_MODE solo como string true/false', () => {
    expect(validateEnv({ ...validBase, WORKER_MODE: 'true' }).WORKER_MODE).toBe('true');
    expect(validateEnv({ ...validBase, WORKER_MODE: 'false' }).WORKER_MODE).toBe('false');
    expect(() => validateEnv({ ...validBase, WORKER_MODE: '1' })).toThrow();
  });
});
