import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_ISSUER,
  USER_REPOSITORY,
  type TokenIssuerPort,
  type UserRepositoryPort,
} from '../../modules/auth';
import type { RequestContext } from '../context/request-context.types';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Guard global que:
 *   1. Si el handler está marcado @Public(), construye RequestContext
 *      anónimo y lo monta en AsyncLocalStorage. No exige JWT.
 *   2. Caso contrario, exige Authorization: Bearer <jwt>.
 *      - Verifica el JWT (firma, exp, iss, aud).
 *      - Hidrata el user + permisos desde DB (cache por request).
 *      - Construye RequestContext autenticado y lo monta en ALS para
 *        el resto del request lifecycle.
 *
 * Importante: este guard envuelve `next()` con `als.run(...)` para que
 * los use cases vean el ctx via `RequestContextService.getContext()`.
 * Como NestJS no soporta wrap nativo en guards, usamos el truco de
 * mutar request.user + dejar que el controller llame `getContext()`
 * que sí queda dentro del scope ALS gracias al middleware NestJS.
 *
 * F6 simplifica: el guard llena `req.surpContext` y el ContextInterceptor
 * (registrado globalmente) hace el `als.run`. Así el guard sigue puro
 * (CanActivate sincrónico desde el punto de vista del flow).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuerPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);

    const req = execCtx.switchToHttp().getRequest<RequestWithContext>();

    if (isPublic) {
      req.surpContext = buildAnonContext(req);
      return true;
    }

    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_MISSING_TOKEN',
        message: 'Token de acceso requerido',
      });
    }

    let payload: Awaited<ReturnType<TokenIssuerPort['verifyAccessToken']>>;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_INVALID_TOKEN',
        message: 'Token inválido o expirado',
      });
    }

    const userId = BigInt(payload.sub);
    const user = await this.users.findByIdWithPermissions(userId);
    if (!user || !user.active) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_USER_INACTIVE',
        message: 'Usuario deshabilitado o inexistente',
      });
    }

    req.surpContext = {
      requestId: extractRequestId(req),
      userId: user.id,
      organizationId: user.organizationId,
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      source: 'http',
      startedAt: new Date(),
      sessionExternalId: payload.sid,
    };
    req.surpUser = user;
    return true;
  }
}

export interface RequestWithContext extends Request {
  surpContext?: RequestContext;
  surpUser?: Awaited<ReturnType<UserRepositoryPort['findByIdWithPermissions']>>;
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = h.split(' ');
  if (parts.length !== 2) return null;
  if (parts[0]?.toLowerCase() !== 'bearer') return null;
  return parts[1] ?? null;
}

function extractIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

function extractRequestId(req: Request): string {
  return req.headers['x-request-id']?.toString() ?? randomUUID();
}

function buildAnonContext(req: Request): RequestContext {
  return {
    requestId: extractRequestId(req),
    userId: null,
    organizationId: null,
    ip: extractIp(req),
    userAgent: req.headers['user-agent'] ?? null,
    source: 'http',
    startedAt: new Date(),
    sessionExternalId: null,
  };
}
