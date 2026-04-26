/**
 * Error de dominio. Lo lanzan las invariantes en la capa `domain/` o
 * `use-cases/` cuando se viola una regla de negocio.
 *
 * Diferencia con HttpException:
 *   - DomainError no conoce HTTP. Es puro dominio.
 *   - El controller atrapa DomainError y lo mapea a 400 Bad Request
 *     (o el filter global lo hace por nosotros).
 *   - Permite reutilizar use cases desde processors BullMQ sin tener
 *     que importar @nestjs/common para los errores.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
