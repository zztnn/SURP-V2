import { HmacSigner } from './hmac-signer';
import { SURP_CONTAINERS } from './storage.types';

const SECRET = 'a'.repeat(32);
const NOW = 1_745_000_000; // arbitrario, en segundos

describe('HmacSigner', () => {
  it('rechaza secrets cortos en el constructor', () => {
    expect(() => new HmacSigner('short')).toThrow();
  });

  it('verifica una firma correcta', () => {
    const s = new HmacSigner(SECRET);
    const sig = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'incidents/abc/2026/04/uuid-foo.xlsx',
      expiresAtSeconds: NOW + 600,
    });
    expect(
      s.verify({
        container: SURP_CONTAINERS.REPORTS,
        key: 'incidents/abc/2026/04/uuid-foo.xlsx',
        expiresAtSeconds: NOW + 600,
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it('rechaza una firma expirada', () => {
    const s = new HmacSigner(SECRET);
    const sig = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW - 1,
    });
    expect(
      s.verify({
        container: SURP_CONTAINERS.REPORTS,
        key: 'k',
        expiresAtSeconds: NOW - 1,
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rechaza si el key cambia (tampering)', () => {
    const s = new HmacSigner(SECRET);
    const sig = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'original',
      expiresAtSeconds: NOW + 600,
    });
    expect(
      s.verify({
        container: SURP_CONTAINERS.REPORTS,
        key: 'tampered',
        expiresAtSeconds: NOW + 600,
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rechaza si el container cambia', () => {
    const s = new HmacSigner(SECRET);
    const sig = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
    });
    expect(
      s.verify({
        container: SURP_CONTAINERS.EVIDENCE,
        key: 'k',
        expiresAtSeconds: NOW + 600,
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rechaza si el exp cambia', () => {
    const s = new HmacSigner(SECRET);
    const sig = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
    });
    expect(
      s.verify({
        container: SURP_CONTAINERS.REPORTS,
        key: 'k',
        expiresAtSeconds: NOW + 1200,
        signature: sig,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('incluye filename en la firma cuando se provee', () => {
    const s = new HmacSigner(SECRET);
    const sigWith = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
      filename: 'foo.xlsx',
    });
    const sigWithout = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
    });
    expect(sigWith).not.toBe(sigWithout);

    // Tampering del filename rechazado.
    expect(
      s.verify({
        container: SURP_CONTAINERS.REPORTS,
        key: 'k',
        expiresAtSeconds: NOW + 600,
        filename: 'evil.xlsx',
        signature: sigWith,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('firmas idénticas para inputs idénticos (determinismo)', () => {
    const s = new HmacSigner(SECRET);
    const a = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
    });
    const b = s.sign({
      container: SURP_CONTAINERS.REPORTS,
      key: 'k',
      expiresAtSeconds: NOW + 600,
    });
    expect(a).toBe(b);
  });
});
