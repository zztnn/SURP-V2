import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

/**
 * Mapea errores de Postgres (driver `pg`) a respuestas HTTP útiles.
 *
 * Los códigos SQLSTATE que más nos importan en SURP:
 *   - 23505 unique_violation       → 409 Conflict
 *   - 23503 foreign_key_violation  → 422 Unprocessable Entity
 *   - 23502 not_null_violation     → 422
 *   - 23514 check_violation        → 422 (incluye nuestros triggers fail-fast)
 *
 * Otros errores se dejan pasar al filtro global de NestJS (500 por
 * defecto, con stack trace en logs).
 *
 * Aplicación: como `app.useGlobalFilters(new PostgresErrorFilter())` en
 * main.ts (Fase 6+).
 */
interface PgError extends Error {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  if (!(err instanceof Error)) return false;
  const candidate = err as unknown as Record<string, unknown>;
  const code = candidate['code'];
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

@Catch()
@Injectable()
export class PostgresErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PostgresErrorFilter.name);

  constructor(@Inject(HttpAdapterHost) adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(err: unknown, host: ArgumentsHost): void {
    // HttpException (incluye 401/403/404/422 etc) NO se toca — Nest
    // ya las serializa como JSON con su shape estándar.
    if (err instanceof HttpException) {
      super.catch(err, host);
      return;
    }
    if (!isPgError(err)) {
      // Cualquier otro error (TypeError, etc.): delega al filter base
      // que renderiza 500 en JSON con el detalle apropiado por entorno.
      super.catch(err, host);
      return;
    }

    const code = err.code;
    this.logger.warn(
      `Postgres ${code ?? '?'} ${err.constraint ?? ''} ${err.detail ?? err.message}`,
    );

    const response = host.switchToHttp().getResponse<{
      status: (n: number) => { json: (body: unknown) => unknown };
    }>();

    const payload = mapToHttp(err);
    response.status(payload.status).json(payload.body);
  }
}

interface HttpPayload {
  status: number;
  body: { error: string; code?: string; message: string; constraint?: string };
}

function mapToHttp(err: PgError): HttpPayload {
  switch (err.code) {
    case '23505':
      return {
        status: 409,
        body: {
          error: 'Conflict',
          code: 'UNIQUE_VIOLATION',
          message: 'El recurso ya existe.',
          ...(err.constraint !== undefined ? { constraint: err.constraint } : {}),
        },
      };
    case '23503':
      return {
        status: 422,
        body: {
          error: 'Unprocessable Entity',
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Referencia a recurso inexistente.',
          ...(err.constraint !== undefined ? { constraint: err.constraint } : {}),
        },
      };
    case '23502':
      return {
        status: 422,
        body: {
          error: 'Unprocessable Entity',
          code: 'NOT_NULL_VIOLATION',
          message: 'Falta un campo obligatorio.',
        },
      };
    case '23514':
      return {
        status: 422,
        body: {
          error: 'Unprocessable Entity',
          code: 'CHECK_VIOLATION',
          message: err.detail ?? err.message,
          ...(err.constraint !== undefined ? { constraint: err.constraint } : {}),
        },
      };
    default:
      // Lanzar como Conflict genérico — los códigos no mapeados los maneja
      // el filter global eventualmente.
      throw new ConflictException(err.message);
  }
}

// Helper para tests.
export function _exposeForTests(): { mapToHttp: typeof mapToHttp; isPgError: typeof isPgError } {
  return { mapToHttp, isPgError };
}

// Re-export para que NestJS no se queje por la importación no usada.
export { UnprocessableEntityException };
