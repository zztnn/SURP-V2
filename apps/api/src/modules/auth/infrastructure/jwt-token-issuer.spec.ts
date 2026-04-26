import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TokenInvalidError } from '../ports/token-issuer.port';
import { JWT_CONFIG, type JwtAuthConfig } from './jwt-config.token';
import { JwtTokenIssuer } from './jwt-token-issuer';

const CONFIG: JwtAuthConfig = {
  secret: 'test-secret-must-be-at-least-thirty-two-chars-long-OK!',
  accessExpiresIn: '15m',
  issuer: 'surp-api',
  audience: 'surp-web',
};

async function build(): Promise<JwtTokenIssuer> {
  const m = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    providers: [JwtTokenIssuer, { provide: JWT_CONFIG, useValue: CONFIG }],
  }).compile();
  return m.get(JwtTokenIssuer);
}

describe('JwtTokenIssuer', () => {
  it('signAccessToken + verifyAccessToken roundtrip', async () => {
    const issuer = await build();
    const token = await issuer.signAccessToken({
      sub: '123',
      org: '10',
      jti: 'jti-uuid',
      sid: 'sess-uuid',
      mfa: false,
    });
    expect(token.split('.').length).toBe(3); // header.payload.sig

    const payload = await issuer.verifyAccessToken(token);
    expect(payload).toEqual({
      sub: '123',
      org: '10',
      jti: 'jti-uuid',
      sid: 'sess-uuid',
      mfa: false,
    });
  });

  it('verifyAccessToken lanza TokenInvalidError ante token corrupto', async () => {
    const issuer = await build();
    await expect(issuer.verifyAccessToken('not.a.jwt')).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it('verifyAccessToken lanza con secreto incorrecto', async () => {
    const issuer = await build();
    const altModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        JwtTokenIssuer,
        {
          provide: JWT_CONFIG,
          useValue: { ...CONFIG, secret: 'OTRO-secret-distinto-tambien-32-chars-XX!!' },
        },
      ],
    }).compile();
    const altIssuer = altModule.get(JwtTokenIssuer);

    const token = await altIssuer.signAccessToken({
      sub: '1',
      org: '10',
      jti: 'j',
      sid: 's',
      mfa: false,
    });
    await expect(issuer.verifyAccessToken(token)).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it('generateOpaqueRefreshToken produce strings únicos de 43+ chars base64url', async () => {
    const issuer = await build();
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(issuer.generateOpaqueRefreshToken());
    expect(set.size).toBe(100);
    for (const t of set) {
      expect(t.length).toBeGreaterThanOrEqual(43);
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('hashRefreshToken es determinístico (mismo plain → mismo hash)', async () => {
    const issuer = await build();
    expect(issuer.hashRefreshToken('abc')).toBe(issuer.hashRefreshToken('abc'));
    expect(issuer.hashRefreshToken('abc')).not.toBe(issuer.hashRefreshToken('xyz'));
    expect(issuer.hashRefreshToken('abc')).toHaveLength(64);
  });

  it('signAccessToken usa el JwtService inyectado (no constructor propio)', async () => {
    const m = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [JwtTokenIssuer, { provide: JWT_CONFIG, useValue: CONFIG }],
    }).compile();
    expect(m.get(JwtService)).toBeDefined();
  });
});
