import { Argon2PasswordHasher } from './argon2-password-hasher';

// Estos tests sí ejecutan argon2 real (es nativo y rápido en hardware
// moderno: ~50ms por hash en M1). Si el CI los siente lentos, mover
// a `*.it.ts` y separar suite.

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hash produce string en formato argon2id', async () => {
    const h = await hasher.hash('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('verify true para password correcta', async () => {
    const plain = 'Surp.Dev.2026!';
    const h = await hasher.hash(plain);
    expect(await hasher.verify(plain, h)).toBe(true);
  });

  it('verify false para password incorrecta', async () => {
    const h = await hasher.hash('correct');
    expect(await hasher.verify('incorrect', h)).toBe(false);
  });

  it('verify false (sin lanzar) cuando hash es null — usa dummy hash', async () => {
    expect(await hasher.verify('anything', null)).toBe(false);
  });

  it('verify false cuando hash tiene formato inválido', async () => {
    expect(await hasher.verify('x', 'not-a-real-hash')).toBe(false);
  });

  it('hash vacío lanza', async () => {
    await expect(hasher.hash('')).rejects.toThrow();
  });

  it('hash > 1024 chars lanza', async () => {
    await expect(hasher.hash('x'.repeat(1025))).rejects.toThrow();
  });

  it('verify de email-no-existe gasta tiempo similar a un mismatch real (timing)', async () => {
    // Mide overhead de verify(null) vs verify(hash-real, password-mala).
    // No es un benchmark estricto — es smoke test: ambos deben demorar
    // del mismo orden de magnitud (≤ 5x).
    const realHash = await hasher.hash('something');
    const t1 = process.hrtime.bigint();
    await hasher.verify('xx', realHash);
    const dur1 = Number(process.hrtime.bigint() - t1);
    const t2 = process.hrtime.bigint();
    await hasher.verify('xx', null);
    const dur2 = Number(process.hrtime.bigint() - t2);
    const ratio = Math.max(dur1, dur2) / Math.min(dur1, dur2);
    expect(ratio).toBeLessThan(5);
  });
});
