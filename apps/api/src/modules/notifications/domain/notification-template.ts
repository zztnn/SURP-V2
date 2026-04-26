/**
 * Snapshot inmutable del template tal como existe en BD. La capa de
 * dominio NO lo modifica — el admin lo edita vía un endpoint distinto
 * que está fuera del alcance de F8.
 *
 * F8 trabaja con `subjectTemplate` + `plainFallbackTemplate` (Handlebars
 * básico). El campo `bodyMjml` se ignora hasta que F8.5 (post-MVP)
 * incorpore mjml + handlebars partials.
 */
export interface NotificationTemplate {
  code: string;
  subjectTemplate: string;
  bodyMjml: string;
  plainFallbackTemplate: string | null;
  enabled: boolean;
  locale: string;
  senderAddress: string;
  senderDisplayName: string;
}
