export const CLOCK = Symbol('CLOCK');

/**
 * Reloj inyectable. Existe para que los tests congelen el tiempo y
 * que las invariantes que dependen de "now" (lockout vencido, sesión
 * expirada, ventana de fails, etc.) sean determinísticas.
 *
 * Vive en `common/` porque cualquier módulo de dominio que use ports
 * temporales lo necesita; sin esto la regla `no-restricted-imports`
 * forzaría a duplicar el port por módulo.
 */
export interface ClockPort {
  now(): Date;
}
