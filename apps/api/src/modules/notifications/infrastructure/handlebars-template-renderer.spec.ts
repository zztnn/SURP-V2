import { HandlebarsTemplateRenderer } from './handlebars-template-renderer';

describe('HandlebarsTemplateRenderer', () => {
  const renderer = new HandlebarsTemplateRenderer();

  it('substituye {{var}} en subject y body', () => {
    const r = renderer.render({
      subjectTemplate: 'Bloqueo {{blockId}} en {{target}}',
      plainTemplate: 'Hola, el bloqueo es {{blockId}}.',
      context: { blockId: '5', target: 'party/3' },
    });
    expect(r.subject).toBe('Bloqueo 5 en party/3');
    expect(r.text).toBe('Hola, el bloqueo es 5.');
  });

  it('lanza si falta variable (strict mode)', () => {
    expect(() =>
      renderer.render({
        subjectTemplate: 'X {{noExiste}}',
        plainTemplate: '',
        context: {},
      }),
    ).toThrow();
  });

  it('NO escapa caracteres especiales (texto plano)', () => {
    const r = renderer.render({
      subjectTemplate: '{{x}}',
      plainTemplate: '{{x}}',
      context: { x: 'a < b & c' },
    });
    expect(r.subject).toBe('a < b & c');
    expect(r.text).toBe('a < b & c');
  });
});
