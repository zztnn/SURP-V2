import { _exposeForTests } from './postgres-error.filter';

const { mapToHttp, isPgError } = _exposeForTests();

describe('isPgError', () => {
  it('detecta errores con SQLSTATE', () => {
    const e = Object.assign(new Error('x'), { code: '23505' });
    expect(isPgError(e)).toBe(true);
  });

  it('descarta errores sin code', () => {
    expect(isPgError(new Error('x'))).toBe(false);
    expect(isPgError(null)).toBe(false);
    expect(isPgError({ code: '23505' })).toBe(false);
  });

  it('descarta code mal formados', () => {
    const e = Object.assign(new Error('x'), { code: 'abc' });
    expect(isPgError(e)).toBe(false);
  });
});

describe('mapToHttp', () => {
  it('23505 → 409 UNIQUE_VIOLATION', () => {
    const e = Object.assign(new Error('dup'), {
      code: '23505',
      constraint: 'parties_rut_unique_active_ux',
    });
    const result = mapToHttp(e);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('UNIQUE_VIOLATION');
    expect(result.body.constraint).toBe('parties_rut_unique_active_ux');
  });

  it('23503 → 422 FOREIGN_KEY_VIOLATION', () => {
    const e = Object.assign(new Error('fk'), { code: '23503', constraint: 'fk_zone' });
    const result = mapToHttp(e);
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('23502 → 422 NOT_NULL_VIOLATION', () => {
    const e = Object.assign(new Error('null'), { code: '23502' });
    const result = mapToHttp(e);
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('NOT_NULL_VIOLATION');
  });

  it('23514 → 422 CHECK_VIOLATION usa detail si está', () => {
    const e = Object.assign(new Error('chk'), {
      code: '23514',
      detail: 'fires_origin_determined_consistency_ck',
      constraint: 'fires_origin_determined_consistency_ck',
    });
    const result = mapToHttp(e);
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('CHECK_VIOLATION');
    expect(result.body.message).toContain('fires_origin_determined_consistency_ck');
  });
});
