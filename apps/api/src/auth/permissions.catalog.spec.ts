import { PERMISSIONS_CATALOG } from './permissions.catalog';

describe('PERMISSIONS_CATALOG', () => {
  it('no tiene codes duplicados', () => {
    const codes = PERMISSIONS_CATALOG.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('todo code coincide con module.resource.action', () => {
    for (const p of PERMISSIONS_CATALOG) {
      expect(p.code).toBe(`${p.module}.${p.resource}.${p.action}`);
    }
  });

  it('todo code respeta el regex modulo.recurso.accion', () => {
    const re = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
    for (const p of PERMISSIONS_CATALOG) {
      expect(p.code).toMatch(re);
    }
  });

  it('todo permiso tiene description no vacía', () => {
    for (const p of PERMISSIONS_CATALOG) {
      expect(p.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('mantiene los 171 permisos esperados (snapshot del módulo)', () => {
    // Si este número cambia, actualizar también el seed
    // database/seed/02_permissions.sql y los seeds de patches.
    expect(PERMISSIONS_CATALOG.length).toBe(171);
  });
});
