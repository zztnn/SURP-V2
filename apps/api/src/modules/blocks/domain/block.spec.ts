import { DomainError } from '../../../common';
import { Block } from './block';

const NOW = new Date('2026-04-25T12:00:00Z');

const BASE = {
  targetType: 'party' as const,
  targetId: 1n,
  reason: 'Sospecha de robo de madera reiterado en zona Vichuquén',
  grantedByUserId: 1n,
  grantedAt: NOW,
  linkedIncidentId: 42n,
};

describe('Block.grant', () => {
  it('crea bloqueo válido con campos esperados', () => {
    const b = Block.grant(BASE);
    expect(b.id).toBeNull();
    expect(b.targetType).toBe('party');
    expect(b.targetId).toBe(1n);
    expect(b.active).toBe(true);
    expect(b.reason).toBe(BASE.reason);
    expect(b.grantedAt).toBe(NOW);
    expect(b.grantedByUserId).toBe(1n);
    expect(b.linkedIncidentId).toBe(42n);
    expect(b.revokedAt).toBeNull();
  });

  it('trim el reason antes de validar y guardar', () => {
    const b = Block.grant({ ...BASE, reason: '   ' + BASE.reason + '   ' });
    expect(b.reason).toBe(BASE.reason);
  });

  it('rechaza reason < 30 chars (BLOCK_REASON_TOO_SHORT)', () => {
    try {
      Block.grant({ ...BASE, reason: 'sospecha' });
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_REASON_TOO_SHORT');
    }
  });

  it('rechaza reason solo whitespace', () => {
    expect(() => Block.grant({ ...BASE, reason: '   '.repeat(20) })).toThrow(DomainError);
  });

  it('rechaza targetType inválido', () => {
    try {
      Block.grant({ ...BASE, targetType: 'incident' as never });
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_INVALID_TARGET_TYPE');
    }
  });

  it('rechaza targetId <= 0', () => {
    try {
      Block.grant({ ...BASE, targetId: 0n });
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_INVALID_TARGET_ID');
    }
  });

  it('rechaza grantedByUserId <= 0', () => {
    try {
      Block.grant({ ...BASE, grantedByUserId: 0n });
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_INVALID_GRANTOR');
    }
  });

  it('linkedIncidentId puede ser null (warn-only en use case)', () => {
    const b = Block.grant({ ...BASE, linkedIncidentId: null });
    expect(b.linkedIncidentId).toBeNull();
    expect(b.active).toBe(true);
  });
});

describe('Block.revoke', () => {
  function fresh(): Block {
    return Block.grant(BASE);
  }

  it('revoca correctamente: active=false, revokedAt seteado', () => {
    const b = fresh();
    const at = new Date(NOW.getTime() + 60_000);
    b.revoke(2n, 'Aclarado por imputado mediante denuncia formal', at);
    expect(b.active).toBe(false);
    expect(b.revokedAt).toBe(at);
    expect(b.revokedByUserId).toBe(2n);
    expect(b.revokeReason).toBe('Aclarado por imputado mediante denuncia formal');
  });

  it('rechaza segunda revoke (BLOCK_ALREADY_REVOKED)', () => {
    const b = fresh();
    b.revoke(2n, 'Primera razón válida ya', NOW);
    try {
      b.revoke(3n, 'Segunda intentona también valida', NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_ALREADY_REVOKED');
    }
  });

  it('rechaza revokeReason < 10 chars', () => {
    const b = fresh();
    try {
      b.revoke(2n, 'corto', NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_REVOKE_REASON_TOO_SHORT');
    }
  });

  it('rechaza revokedByUserId <= 0', () => {
    const b = fresh();
    try {
      b.revoke(0n, 'razón válida suficiente', NOW);
      fail('expected throw');
    } catch (e) {
      expect((e as DomainError).code).toBe('BLOCK_INVALID_REVOKER');
    }
  });
});

describe('Block.fromSnapshot / toSnapshot', () => {
  it('roundtrip preserva campos', () => {
    const original = Block.grant(BASE);
    original.revoke(2n, 'Aclarado tras revisión URP', NOW);
    const snap = original.toSnapshot();
    const reconstructed = Block.fromSnapshot({ ...snap, id: 5n, externalId: 'uuid-x' });
    expect(reconstructed.id).toBe(5n);
    expect(reconstructed.externalId).toBe('uuid-x');
    expect(reconstructed.active).toBe(false);
    expect(reconstructed.revokeReason).toBe('Aclarado tras revisión URP');
  });

  it('fromSnapshot NO ejecuta invariantes de creación (legacy migration)', () => {
    // Bloqueo migrado del legacy con reason corto debería poder cargarse
    // sin lanzar. Las invariantes solo se enforce en grant/revoke.
    const b = Block.fromSnapshot({
      id: 99n,
      externalId: 'legacy',
      targetType: 'party',
      targetId: 7n,
      reason: 'short',
      active: true,
      grantedAt: NOW,
      grantedByUserId: 1n,
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
      linkedIncidentId: null,
    });
    expect(b.reason).toBe('short');
  });
});
