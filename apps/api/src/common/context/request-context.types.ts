/**
 * Contexto de la request actual disponible vía AsyncLocalStorage.
 *
 * Lo setea el AuditInterceptor al inicio de cada request HTTP y los use
 * cases lo reciben como segundo parámetro (`execute(input, ctx)`). Los
 * processors BullMQ construyen su propio RequestContext sintético al
 * empezar a procesar un job.
 *
 * Este archivo define solo el tipo. El servicio que provee acceso al
 * contexto está en request-context.service.ts.
 */
export interface RequestContext {
  /** Identificador único de la request (UUID v4). Se usa como correlation ID en logs y audit_logs. */
  readonly requestId: string;

  /** Usuario autenticado. NULL en requests no autenticadas (health, /auth/login). */
  readonly userId: bigint | null;

  /** Organización a la que pertenece el usuario (scope multi-tenant). NULL si userId es NULL. */
  readonly organizationId: bigint | null;

  /**
   * Tipo de organización (`principal` | `security_provider` | `api_consumer`).
   * Lo usan los use cases para aplicar filtros de visibilidad sin tener que
   * hacer un lookup adicional. NULL si la request es anónima o de un job sin
   * organización (worker BullMQ).
   */
  readonly organizationType: 'principal' | 'security_provider' | 'api_consumer' | null;

  /** IP del cliente (X-Forwarded-For si está detrás de proxy). */
  readonly ip: string | null;

  /** User-Agent del cliente. */
  readonly userAgent: string | null;

  /** Origen del contexto: 'http' (request HTTP normal), 'job' (processor BullMQ), 'cli' (script). */
  readonly source: 'http' | 'job' | 'cli';

  /** Timestamp de inicio de la request (UTC). */
  readonly startedAt: Date;

  /**
   * external_id de la sesión activa (`user_sessions.external_id`). Viene
   * del claim `sid` del JWT. Permite al frontend marcar "esta es tu
   * sesión actual" en `/settings/seguridad` y al backend rechazar el
   * intento de revocar la sesión actual con código `AUTH_CANNOT_REVOKE_CURRENT`.
   * NULL en requests no autenticadas (health, /auth/login) y en jobs.
   */
  readonly sessionExternalId: string | null;
}
