import { assertSafeKey, buildStorageKey, isKnownContainer, sanitizeFilename } from './key-naming';
import { SURP_CONTAINERS } from './storage.types';

describe('sanitizeFilename', () => {
  it('quita tildes y ñ', () => {
    expect(sanitizeFilename('camión-año.png')).toBe('camion-ano.png');
  });

  it('reemplaza caracteres no seguros por _', () => {
    expect(sanitizeFilename('foo bar (1).jpg')).toBe('foo_bar_1.jpg');
  });

  it('colapsa underscores múltiples', () => {
    expect(sanitizeFilename('a   b   c.txt')).toBe('a_b_c.txt');
  });

  it('limita base a 100 chars', () => {
    const long = 'a'.repeat(150) + '.jpg';
    const result = sanitizeFilename(long);
    expect(result.length).toBeLessThanOrEqual(110); // 100 + '.jpg' (4)
  });

  it('limita extensión a 10 chars', () => {
    const result = sanitizeFilename('foo.veryverylongextension');
    expect(result.endsWith('.veryveryl')).toBe(true);
  });

  it('devuelve "archivo<ext>" si la base queda vacía', () => {
    expect(sanitizeFilename('....jpg')).toMatch(/^archivo\./);
  });
});

describe('buildStorageKey', () => {
  it('genera path con entityType/entityId/yyyy/mm/uuid-name', () => {
    const key = buildStorageKey({
      entityType: 'incidents',
      entityId: '9f2a1c04',
      filename: 'foto.jpg',
      now: new Date(Date.UTC(2026, 3, 15)),
    });
    expect(key).toMatch(
      /^incidents\/9f2a1c04\/2026\/04\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-foto\.jpg$/,
    );
  });

  it('UUID distinto en cada llamada para evitar colisiones', () => {
    const a = buildStorageKey({ entityType: 'i', entityId: 'x', filename: 'f.jpg' });
    const b = buildStorageKey({ entityType: 'i', entityId: 'x', filename: 'f.jpg' });
    expect(a).not.toBe(b);
  });

  it('sanitiza el filename antes de incluirlo', () => {
    const key = buildStorageKey({
      entityType: 'incidents',
      entityId: 'abc',
      filename: 'año chanchero.jpg',
      now: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(key).toMatch(/-ano_chanchero\.jpg$/);
  });
});

describe('isKnownContainer', () => {
  it('acepta containers del catálogo', () => {
    expect(isKnownContainer(SURP_CONTAINERS.EVIDENCE)).toBe(true);
    expect(isKnownContainer(SURP_CONTAINERS.REPORTS)).toBe(true);
  });

  it('rechaza valores random', () => {
    expect(isKnownContainer('random')).toBe(false);
    expect(isKnownContainer('')).toBe(false);
    expect(isKnownContainer(null)).toBe(false);
    expect(isKnownContainer(undefined)).toBe(false);
    expect(isKnownContainer(42)).toBe(false);
  });
});

describe('assertSafeKey', () => {
  it('acepta keys con segmentos válidos', () => {
    expect(() => {
      assertSafeKey('incidents/abc/2026/04/uuid-foo.jpg');
    }).not.toThrow();
  });

  it('rechaza vacío', () => {
    expect(() => {
      assertSafeKey('');
    }).toThrow();
  });

  it('rechaza .. (path traversal)', () => {
    expect(() => {
      assertSafeKey('incidents/../etc/passwd');
    }).toThrow();
  });

  it('rechaza segmento . solo', () => {
    expect(() => {
      assertSafeKey('incidents/./foo.jpg');
    }).toThrow();
  });

  it('rechaza barras invertidas', () => {
    expect(() => {
      assertSafeKey('incidents\\evil');
    }).toThrow();
  });

  it('rechaza path absoluto', () => {
    expect(() => {
      assertSafeKey('/etc/passwd');
    }).toThrow();
  });

  it('rechaza null bytes', () => {
    expect(() => {
      assertSafeKey('incidents/foo\0.jpg');
    }).toThrow();
  });

  it('rechaza segmentos vacíos (// consecutivos)', () => {
    expect(() => {
      assertSafeKey('incidents//foo.jpg');
    }).toThrow();
  });

  it('rechaza keys excesivamente largos', () => {
    const long = 'a/'.repeat(300);
    expect(() => {
      assertSafeKey(long);
    }).toThrow();
  });
});
