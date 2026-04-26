import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Interceptor que loguea método, ruta, status y duración de cada request
 * HTTP. NO sustituye al AuditInterceptor (que persiste accesos sensibles
 * a `audit_logs`); este es solo telemetría operativa.
 *
 * Aplicación: `app.useGlobalInterceptors(new LoggingInterceptor())` en
 * main.ts (Fase 6+ junto con AuditInterceptor).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.log(req, res, start);
        },
        error: () => {
          // Errores los loguea el filtro global con el stack trace
          // completo. Acá solo registramos la duración para latencias.
          this.log(req, res, start);
        },
      }),
    );
  }

  private log(req: Request, res: Response, start: bigint): void {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const ms = durationMs.toFixed(1);
    this.logger.log(`${req.method} ${req.originalUrl} ${String(res.statusCode)} ${ms}ms`);
  }
}
