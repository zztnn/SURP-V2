import { createHmac, timingSafeEqual } from 'node:crypto';

import type { SurpContainer } from './storage.types';

/**
 * Firma y verifica URLs de descarga del `LocalStorageAdapter`.
 *
 * Misma garantía conceptual que un SAS de Azure: la URL misma es la
 * credencial; tiene TTL corto; cualquier modificación al path o al
 * filename invalida la firma.
 *
 * Payload firmado: `${container}|${key}|${expiresAtSeconds}[|${filename}]`.
 *
 * Algoritmo: HMAC-SHA256 + base64url. Comparación con `timingSafeEqual`.
 */
export class HmacSigner {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error('HMAC secret debe tener al menos 32 caracteres');
    }
  }

  sign(input: SignInput): string {
    const payload = this.payload(input);
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  verify(input: VerifyInput): VerifyResult {
    if (input.nowSeconds > input.expiresAtSeconds) {
      return { ok: false, reason: 'expired' };
    }
    const expected = this.sign({
      container: input.container,
      key: input.key,
      expiresAtSeconds: input.expiresAtSeconds,
      filename: input.filename,
    });
    const expectedBuf = Buffer.from(expected, 'utf8');
    const givenBuf = Buffer.from(input.signature, 'utf8');
    if (expectedBuf.length !== givenBuf.length) {
      return { ok: false, reason: 'invalid' };
    }
    return timingSafeEqual(expectedBuf, givenBuf) ? { ok: true } : { ok: false, reason: 'invalid' };
  }

  private payload(input: SignInput): string {
    const exp = String(input.expiresAtSeconds);
    if (input.filename !== undefined && input.filename.length > 0) {
      return `${input.container}|${input.key}|${exp}|${input.filename}`;
    }
    return `${input.container}|${input.key}|${exp}`;
  }
}

interface SignInput {
  container: SurpContainer;
  key: string;
  expiresAtSeconds: number;
  filename?: string | undefined;
}

interface VerifyInput extends SignInput {
  signature: string;
  nowSeconds: number;
}

type VerifyResult = { ok: true } | { ok: false; reason: 'expired' | 'invalid' };
