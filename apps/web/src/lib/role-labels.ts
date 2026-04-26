/**
 * Mapeo de role codes (clave en BD `roles.name`) a etiquetas humanas
 * en español para mostrar en UI. Sincronizado con `database/seed/03_roles.sql`.
 */
const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrador',
  patrimonial_admin: 'Jefe URP',
  patrimonial: 'URP — Operador',
  lawyer_admin: 'Abogado Administrador',
  lawyer: 'Abogado',
  external_lawyer: 'Abogado Externo',
  field_lawyer: 'Abogado de Terreno',
  fires_specialist: 'Especialista Incendios',
  surveillance: 'Vigilancia',
  guard: 'Guardia',
  company_admin: 'Admin Contratista',
  viewer: 'Visor',
  queries_maat: 'Consultas MAAT',
  api_blocks_check: 'API — Consulta de Bloqueos',
};

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}

export function roleLabels(codes: readonly string[]): string {
  return codes.map(roleLabel).join(', ');
}
