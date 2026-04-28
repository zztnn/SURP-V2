import type { IncidentSemaforo, IncidentState } from '@/types/incidents';

export const STATE_LABELS: Record<IncidentState, string> = {
  draft: 'Borrador',
  active: 'Activo',
  voided: 'Anulado',
};

export const SEMAFORO_LABELS: Record<IncidentSemaforo, string> = {
  no_determinado: 'Sin determinar',
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
};

export const STATE_BADGE_CLASS: Record<IncidentState, string> = {
  draft: 'bg-amber-500 text-white hover:bg-amber-600',
  active: 'bg-emerald-600 text-white hover:bg-emerald-700',
  voided: 'bg-zinc-500 text-white hover:bg-zinc-600',
};

export const SEMAFORO_DOT_CLASS: Record<IncidentSemaforo, string> = {
  no_determinado: 'bg-muted-foreground',
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-destructive',
};

/**
 * Catálogo cerrado de agravantes (sincronizado con el comentario del schema
 * `incidents.aggravating_factors`). Si se agrega uno nuevo en el backend,
 * actualizar este mapa.
 */
export const AGGRAVATING_FACTOR_LABELS: Record<string, string> = {
  motorized_vehicle_used: 'Uso de vehículo motorizado',
  chainsaw_used: 'Uso de motosierra',
  crane_used: 'Uso de grúa',
  multiple_offenders: 'Múltiples partícipes',
  fence_breach: 'Forzamiento de cerco',
  animal_rustling: 'Sustracción de animales',
  possible_organized_crime: 'Posible crimen organizado',
};

export const LOCATION_SOURCE_LABELS: Record<string, string> = {
  gps: 'GPS',
  property_centroid: 'Centroide del predio',
  area_centroid: 'Centroide del área',
  zone_centroid: 'Centroide de la zona',
  manual: 'Ingreso manual',
};

export const ORG_TYPE_LABELS: Record<string, string> = {
  principal: 'Empresa principal',
  security_provider: 'Empresa de seguridad',
  api_consumer: 'Consumidor API',
};
