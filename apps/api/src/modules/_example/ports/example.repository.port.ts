import type { Example } from '../domain/example';

/**
 * Token de inyección. El use case inyecta `EXAMPLE_REPOSITORY`,
 * NestJS resuelve la implementación registrada en el module.
 */
export const EXAMPLE_REPOSITORY = Symbol('EXAMPLE_REPOSITORY');

/**
 * Contrato del repositorio. La capa de dominio depende de esta
 * interface, no de la implementación Kysely concreta. Esto permite:
 *   - Mockear en tests con un objeto literal.
 *   - Cambiar el driver (ej. introducir cache) sin tocar use cases.
 */
export interface ExampleRepositoryPort {
  findByCode(code: string): Promise<Example | null>;
  save(example: Example): Promise<Example>;
}
