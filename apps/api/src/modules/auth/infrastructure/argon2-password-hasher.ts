import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasherPort } from '../ports/password-hasher.port';

/**
 * Argon2id con parámetros OWASP 2024 (memory ≥ 19 MiB, iterations ≥ 2,
 * parallelism = 1). Trade-off entre seguridad y latencia (~50-100ms
 * por hash en hardware moderno).
 *
 * Refs:
 *   - https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *   - RFC 9106 §4 (recommended parameters)
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

const MAX_PLAIN_LENGTH = 1024;

/**
 * Hash dummy precomputado en el primer verify(null) y memoizado. Lo
 * usamos cuando el email no existe (mitiga enumeración por timing).
 * No lo precomputamos en el constructor para no bloquear el arranque
 * de la API ~50ms; el primer login con email inexistente paga el costo
 * una sola vez (concurrent-safe vía promise compartida).
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('placeholder-for-timing-attack-mitigation', ARGON2_OPTIONS);
  }
  return dummyHashPromise;
}

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    if (plain.length === 0) throw new Error('Password vacía');
    if (plain.length > MAX_PLAIN_LENGTH) {
      throw new Error(`Password excede ${String(MAX_PLAIN_LENGTH)} chars`);
    }
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(plain: string, hash: string | null): Promise<boolean> {
    // Compara contra dummy hash precomputado si null, para mantener
    // tiempo constante (mismo CPU work que un mismatch real).
    const target = hash ?? (await getDummyHash());
    try {
      // argon2.verify lanza si el hash tiene formato inválido.
      return await argon2.verify(target, plain);
    } catch {
      return false;
    }
  }
}
