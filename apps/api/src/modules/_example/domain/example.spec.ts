import { Example } from './example';
import { DomainError } from '../../../common';

describe('Example domain', () => {
  it('crea con campos válidos', () => {
    const e = new Example(1n, 'foo-bar', 'Foo Bar', true);
    expect(e.code).toBe('foo-bar');
    expect(e.name).toBe('Foo Bar');
    expect(e.active).toBe(true);
  });

  it('rechaza code inválido', () => {
    expect(() => new Example(1n, 'INVALID', 'X', true)).toThrow(DomainError);
    expect(() => new Example(1n, '1starts-num', 'X', true)).toThrow(DomainError);
  });

  it('rechaza name vacío', () => {
    expect(() => new Example(1n, 'foo', '', true)).toThrow(DomainError);
    expect(() => new Example(1n, 'foo', '   ', true)).toThrow(DomainError);
  });

  it('deactivate cambia active a false', () => {
    const e = new Example(1n, 'foo', 'Foo', true);
    e.deactivate();
    expect(e.active).toBe(false);
  });

  it('deactivate dos veces lanza DomainError', () => {
    const e = new Example(1n, 'foo', 'Foo', false);
    expect(() => {
      e.deactivate();
    }).toThrow(DomainError);
  });
});
