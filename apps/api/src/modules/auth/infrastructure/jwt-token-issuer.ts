import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { StringValue } from 'ms';
import {
  type AccessTokenPayload,
  TokenInvalidError,
  type TokenIssuerPort,
} from '../ports/token-issuer.port';
import { JWT_CONFIG, type JwtAuthConfig } from './jwt-config.token';

@Injectable()
export class JwtTokenIssuer implements TokenIssuerPort {
  constructor(
    private readonly jwt: JwtService,
    @Inject(JWT_CONFIG) private readonly config: JwtAuthConfig,
  ) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      // Spread en objeto plano — JwtService soporta strings/numbers/booleans
      // en el payload; el resto va como claim genérico.
      { ...payload },
      {
        secret: this.config.secret,
        // expiresIn acepta `number | StringValue` (ms package). El config
        // viene como string ('15m'), validado en env.schema.ts.
        expiresIn: this.config.accessExpiresIn as StringValue,
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const decoded = await this.jwt.verifyAsync<AccessTokenPayload & { iat: number; exp: number }>(
        token,
        {
          secret: this.config.secret,
          issuer: this.config.issuer,
          audience: this.config.audience,
        },
      );
      // Whitelist de campos — descarta claims no esperados (defense in depth).
      if (
        typeof decoded.sub !== 'string' ||
        typeof decoded.org !== 'string' ||
        typeof decoded.jti !== 'string' ||
        typeof decoded.sid !== 'string' ||
        typeof decoded.mfa !== 'boolean'
      ) {
        throw new TokenInvalidError('malformed');
      }
      return {
        sub: decoded.sub,
        org: decoded.org,
        jti: decoded.jti,
        sid: decoded.sid,
        mfa: decoded.mfa,
      };
    } catch (e) {
      if (e instanceof TokenInvalidError) throw e;
      const reason = inferReason(e);
      throw new TokenInvalidError(reason);
    }
  }

  generateOpaqueRefreshToken(): string {
    // 32 bytes random → base64url ≈ 43 chars sin padding.
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }
}

function inferReason(e: unknown): 'expired' | 'malformed' | 'signature' | 'unknown' {
  if (!(e instanceof Error)) return 'unknown';
  const name = e.name.toLowerCase();
  if (name.includes('tokenexpired')) return 'expired';
  if (name.includes('jsonwebtoken')) return 'signature';
  if (name.includes('syntax')) return 'malformed';
  return 'unknown';
}
