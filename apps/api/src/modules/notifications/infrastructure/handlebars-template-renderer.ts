import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { type RenderedTemplate, type TemplateRendererPort } from '../ports/template-renderer.port';

/**
 * Renderizador Handlebars básico. Configuración:
 *   - `strict: true` — variables no provistas lanzan en lugar de
 *     renderizar string vacío (evita silenciar bugs).
 *   - `noEscape: true` — el texto plain no es HTML; no necesitamos
 *     escape de `<`/`>`. Si F8.5 incorpora MJML/HTML, ahí sí se
 *     mantiene escape (default Handlebars).
 *
 * Cache: compilamos cada plantilla por llamada. Para volúmenes altos
 * conviene memoizar por contenido, pero el costo ahora es marginal
 * y mantiene el adapter sin estado.
 */
@Injectable()
export class HandlebarsTemplateRenderer implements TemplateRendererPort {
  render(input: {
    subjectTemplate: string;
    plainTemplate: string;
    context: Record<string, unknown>;
  }): RenderedTemplate {
    const subject = Handlebars.compile(input.subjectTemplate, {
      strict: true,
      noEscape: true,
    })(input.context);
    const text = Handlebars.compile(input.plainTemplate, {
      strict: true,
      noEscape: true,
    })(input.context);
    return { subject, text };
  }
}
