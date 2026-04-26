import type { ValidationError } from '@nestjs/common';
import { flattenValidationErrors } from './validation-pipe.factory';

describe('flattenValidationErrors', () => {
  it('aplana errores top-level con sus mensajes', () => {
    const errs: ValidationError[] = [
      {
        property: 'name',
        constraints: {
          isNotEmpty: 'No puede estar vacío',
          isString: 'Debe ser texto',
        },
      },
    ];
    expect(flattenValidationErrors(errs)).toEqual([
      { field: 'name', messages: ['No puede estar vacío', 'Debe ser texto'] },
    ]);
  });

  it('aplana children con path con punto', () => {
    const errs: ValidationError[] = [
      {
        property: 'address',
        children: [
          {
            property: 'street',
            constraints: { isNotEmpty: 'Calle requerida' },
          },
        ],
      },
    ];
    expect(flattenValidationErrors(errs)).toEqual([
      { field: 'address.street', messages: ['Calle requerida'] },
    ]);
  });

  it('combina propio + hijos', () => {
    const errs: ValidationError[] = [
      {
        property: 'address',
        constraints: { isObject: 'Debe ser objeto' },
        children: [
          {
            property: 'commune',
            children: [
              {
                property: 'id',
                constraints: { isInt: 'Debe ser entero' },
              },
            ],
          },
        ],
      },
    ];
    expect(flattenValidationErrors(errs)).toEqual([
      { field: 'address', messages: ['Debe ser objeto'] },
      { field: 'address.commune.id', messages: ['Debe ser entero'] },
    ]);
  });

  it('input vacío retorna lista vacía', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
