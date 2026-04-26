import { DomainError } from '../../../common';

/**
 * Entidad de dominio — plantilla.
 *
 * - Constructor recibe los campos ya validados (los Value Objects
 *   complejos van como tipos propios, no primitivos).
 * - Las invariantes se enforce en métodos del dominio (`activate`,
 *   `deactivate`, etc.), nunca en setters públicos.
 * - Lanza `DomainError` cuando se viola una regla. El use case lo
 *   captura o lo deja escalar al controller.
 */
export class Example {
  constructor(
    public readonly id: bigint,
    public readonly code: string,
    public readonly name: string,
    private _active: boolean,
  ) {
    if (!code.match(/^[a-z][a-z0-9_-]*$/)) {
      throw new DomainError(`Code inválido: ${code}`, 'INVALID_CODE');
    }
    if (name.trim().length === 0) {
      throw new DomainError('Name no puede estar vacío', 'EMPTY_NAME');
    }
  }

  get active(): boolean {
    return this._active;
  }

  deactivate(): void {
    if (!this._active) {
      throw new DomainError('Ya está inactivo', 'ALREADY_INACTIVE');
    }
    this._active = false;
  }
}
