import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
import type { RequestWithContext } from './jwt-auth.guard';

/**
 * Interceptor global que envuelve la ejecución del handler en el
 * AsyncLocalStorage de RequestContext. Lee el ctx que `JwtAuthGuard`
 * dejó en `req.surpContext` y lo monta para que use cases / repos /
 * loggers lo vean via `RequestContextService.getContext()`.
 *
 * Orden de guards/interceptors en NestJS:
 *   guards (Jwt + Permission) → interceptors → handler
 *
 * Eso garantiza que cuando este interceptor corre, surpContext ya
 * está poblado (o ya se rechazó la request con 401).
 */
@Injectable()
export class AuthContextInterceptor implements NestInterceptor {
  constructor(private readonly contextService: RequestContextService) {}

  intercept(execCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = execCtx.switchToHttp().getRequest<RequestWithContext>();
    const ctx = req.surpContext;
    if (!ctx) {
      // Sin guard global activo o request fuera del flow HTTP — sigue sin ctx.
      return next.handle();
    }
    return this.contextService.runWithContext(ctx, () => next.handle());
  }
}
