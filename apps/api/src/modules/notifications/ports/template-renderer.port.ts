export const TEMPLATE_RENDERER = Symbol('TEMPLATE_RENDERER');

export interface RenderedTemplate {
  subject: string;
  text: string;
}

/**
 * Render Handlebars básico ({{var}}). NO soporta partials, helpers,
 * conditionals — el alcance F8 es deliberadamente mínimo. F8.5
 * incorporará MJML + helpers cuando el cliente confirme estética.
 */
export interface TemplateRendererPort {
  render(input: {
    subjectTemplate: string;
    plainTemplate: string;
    context: Record<string, unknown>;
  }): RenderedTemplate;
}
