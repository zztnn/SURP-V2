// Re-exports públicos de la capa transversal common/.
export { CommonModule } from './common.module';
export { CLOCK } from './clock/clock.port';
export type { ClockPort } from './clock/clock.port';
export { SystemClock } from './clock/system-clock';
export { RequestContextService } from './context/request-context.service';
export type { RequestContext } from './context/request-context.types';
export { DomainError } from './errors/domain-error';
export { PostgresErrorFilter } from './errors/postgres-error.filter';
export { LoggingInterceptor } from './interceptors/logging.interceptor';
export { buildValidationPipe } from './validation/validation-pipe.factory';
// Auth primitives — los guards se registran globalmente en main.ts
// vía APP_GUARD; los decoradores se importan desde common/auth.
export {
  AuthContextInterceptor,
  IS_PUBLIC_KEY,
  JwtAuthGuard,
  PERMISSIONS_KEY,
  PermissionGuard,
  Public,
  RequirePermission,
  type RequestWithContext,
} from './auth';
