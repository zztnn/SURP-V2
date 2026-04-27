import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
// Importamos Public directamente del subpath para evitar el ciclo
// AuthController → common/index → JwtAuthGuard → modules/auth.
import { Public } from '../../common/auth/decorators';
import type { RequestContext } from '../../common';
import { RequestContextService } from '../../common';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  GetCurrentUserUseCase,
  type CurrentUserResult,
} from './use-cases/get-current-user.use-case';
import {
  ListMyLoginAttemptsUseCase,
  type LoginAttemptItem,
} from './use-cases/list-my-login-attempts.use-case';
import { ListMySessionsUseCase, type SessionItem } from './use-cases/list-my-sessions.use-case';
import { LoginUseCase, type LoginResult } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokenUseCase } from './use-cases/refresh-token.use-case';
import { RevokeMySessionUseCase } from './use-cases/revoke-my-session.use-case';

/**
 * Patrón de autenticación híbrido:
 *   - Access token JWT en el body de /login y /refresh — el frontend
 *     lo guarda en memoria (Authorization: Bearer ... en cada request).
 *   - Refresh token opaco en cookie httpOnly `surp_refresh` — el browser
 *     lo envía automáticamente solo en /auth/refresh y /auth/logout.
 *     httpOnly lo hace inaccesible a JS → no exfiltrable por XSS.
 *
 * Esto da:
 *   - Access JWT corto (15 min) en memoria → si XSS roba access, expira pronto.
 *   - Refresh largo (30 días) en cookie httpOnly → sobrevive recargas pero
 *     no es exfiltrable.
 *
 * El payload de /login NO incluye `refreshToken` aunque el use case lo
 * devuelve internamente. El controller extrae el plain del result, lo
 * setea en cookie, y lo elimina del response.
 */

const REFRESH_COOKIE_NAME = 'surp_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 86_400_000; // 30 días

interface PublicLoginResponse {
  accessToken: string;
  expiresIn: number;
  user: LoginResult['user'];
  requiresPasswordReset: boolean;
}

interface PublicRefreshResponse {
  accessToken: string;
  expiresIn: number;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly meUseCase: GetCurrentUserUseCase,
    private readonly listLoginAttemptsUseCase: ListMyLoginAttemptsUseCase,
    private readonly listSessionsUseCase: ListMySessionsUseCase,
    private readonly revokeSessionUseCase: RevokeMySessionUseCase,
    private readonly contextService: RequestContextService,
  ) {}

  // login/refresh/logout son @Public — se autentican con credenciales /
  // refresh tokens, NO con JWT. El JwtAuthGuard global los bypassa.
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicLoginResponse> {
    const ctx = this.resolveContext(req);
    const result = await this.loginUseCase.execute(dto, ctx);
    setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
      requiresPasswordReset: result.requiresPasswordReset,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicRefreshResponse> {
    const ctx = this.resolveContext(req);
    const refreshToken = readRefreshToken(req, dto);
    const result = await this.refreshUseCase.execute({ refreshToken }, ctx);
    setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const ctx = this.resolveContext(req);
    const refreshToken = readRefreshTokenSafe(req, dto);
    if (refreshToken) {
      await this.logoutUseCase.execute({ refreshToken }, ctx);
    }
    clearRefreshCookie(res);
  }

  @Get('me')
  async me(): Promise<CurrentUserResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.meUseCase.execute(undefined, ctx);
  }

  @Get('login-history')
  async loginHistory(): Promise<LoginAttemptItem[]> {
    const ctx = this.contextService.getContextOrThrow();
    return this.listLoginAttemptsUseCase.execute(undefined, ctx);
  }

  @Get('sessions')
  async sessions(): Promise<SessionItem[]> {
    const ctx = this.contextService.getContextOrThrow();
    return this.listSessionsUseCase.execute(undefined, ctx);
  }

  @Delete('sessions/:externalId')
  @HttpCode(204)
  async revokeSession(@Param('externalId') externalId: string): Promise<void> {
    const ctx = this.contextService.getContextOrThrow();
    await this.revokeSessionUseCase.execute({ externalId }, ctx);
  }

  private resolveContext(req: Request): RequestContext {
    return this.contextService.getContext() ?? buildAnonContext(req);
  }
}

function buildAnonContext(req: Request): RequestContext {
  return {
    requestId: req.headers['x-request-id']?.toString() ?? randomUUID(),
    userId: null,
    organizationId: null,
    organizationType: null,
    ip: extractIp(req),
    userAgent: req.headers['user-agent'] ?? null,
    source: 'http',
    startedAt: new Date(),
    sessionExternalId: null,
  };
}

function extractIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

function getCookie(req: Request, name: string): string | undefined {
  // `cookies` lo agrega el middleware cookie-parser; el type augmentation
  // genérico no siempre lo resuelve en lint, así que estrechamos a un
  // tipo local explícito.
  const cookies = (req as RequestWithCookies).cookies;
  if (typeof cookies !== 'object') return undefined;
  const value = cookies[name];
  return typeof value === 'string' ? value : undefined;
}

function readRefreshToken(req: Request, dto: RefreshTokenDto): string {
  const fromCookie = getCookie(req, REFRESH_COOKIE_NAME);
  if (fromCookie && fromCookie.length > 0) return fromCookie;
  // Fallback al body — útil para clientes que aún no migraron a cookies
  // (ej. tests con curl, scripts CLI). En producción la cookie es lo
  // normal porque el frontend la setea automáticamente.
  if (dto.refreshToken && dto.refreshToken.length > 0) return dto.refreshToken;
  throw new UnauthorizedException({
    error: 'Unauthorized',
    code: 'AUTH_REFRESH_MISSING',
    message: 'Refresh token requerido — re-login necesario',
  });
}

function readRefreshTokenSafe(req: Request, dto: RefreshTokenDto): string | null {
  const fromCookie = getCookie(req, REFRESH_COOKIE_NAME);
  if (fromCookie && fromCookie.length > 0) return fromCookie;
  if (dto.refreshToken && dto.refreshToken.length > 0) return dto.refreshToken;
  return null;
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProd, // dev local sobre HTTP; prod exige HTTPS
    sameSite: isProd ? 'strict' : 'lax',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/auth',
  });
}
