export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * Algoritmo de hashing de passwords. Implementación canónica:
 * argon2id (ver ADR-B-* — Argon2 es el estándar OWASP 2024).
 *
 * El verify acepta un hash null para mantener tiempo constante: si el
 * email no existe, el use case llama `verify(plain, null)` igual,
 * para no leakear vía timing si el email existe en BD o no.
 */
export interface PasswordHasherPort {
  /**
   * Hashea password en claro. Lanza si el plain está vacío o > 1024
   * chars (mitigación de DoS por inputs gigantes).
   */
  hash(plain: string): Promise<string>;

  /**
   * Verifica password contra hash. Retorna false (nunca lanza) en:
   *   - hash null (lookup falló, comparamos contra dummy hash interno).
   *   - hash con formato inválido.
   *   - mismatch.
   *
   * Tiempo de respuesta debe ser similar para hits/misses.
   */
  verify(plain: string, hash: string | null): Promise<boolean>;
}
