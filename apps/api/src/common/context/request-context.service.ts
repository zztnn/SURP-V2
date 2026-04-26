import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from './request-context.types';

/**
 * Acceso al `RequestContext` actual sin pasarlo explícitamente por todas
 * las llamadas. Implementado con `AsyncLocalStorage` (Node 22+).
 *
 * Convención SURP:
 *   - El AuditInterceptor (Fase 6) llama `runWithContext(ctx, () => ...)`
 *     al inicio de cada request HTTP.
 *   - Los processors BullMQ (Fase 8+) hacen lo mismo con un ctx sintético
 *     antes de ejecutar el use case.
 *   - Los use cases reciben `ctx` como segundo parámetro de `execute`,
 *     que se obtiene del controller vía `getContextOrThrow()`.
 *   - Repositorios y servicios de bajo nivel pueden leer el ctx con
 *     `getContext()` para enriquecer logs / audit_logs sin pasarlo
 *     explícitamente.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  getContext(): RequestContext | undefined {
    return this.als.getStore();
  }

  getContextOrThrow(): RequestContext {
    const ctx = this.als.getStore();
    if (!ctx) {
      throw new Error(
        'RequestContext no disponible — verificar que el AuditInterceptor esté activo o que el processor llame runWithContext',
      );
    }
    return ctx;
  }
}
