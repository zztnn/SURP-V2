'use client';

import { useIsTablet } from '@/hooks/use-media-query';
import { useListPreferencesStore } from '@/stores/list-preferences-store';

import type { ActionMenuStyle } from '@/stores/list-preferences-store';

/**
 * Devuelve el estilo efectivo del menú de acciones para el viewport
 * actual, forzando "dropdown" cuando la ventana es demasiado angosta
 * para renderizar el cluster inline sin overflow.
 *
 * Trigger: `useIsTablet()` (`max-width: 1024px`) — el mismo breakpoint
 * en el que `useSidebarResponsive` colapsa el sidebar. Así cuando el
 * sidebar se reduce al strip de íconos, el cluster inline también se
 * colapsa al kebab sticky-right. Por encima del breakpoint (desktop),
 * respeta la preferencia del usuario.
 *
 * La preferencia del store NUNCA se muta — sólo el estilo renderizado.
 * Volver a expandir la ventana sobre 1024px restaura el "inline"
 * automáticamente.
 *
 * Todas las páginas-lista y columnas compartidas deben leer el estilo
 * vía este hook, no directamente del store. Saltárselo deja al cluster
 * inline pegado al borde derecho en viewports angostos.
 *
 * El único consumidor legítimo de `useListPreferencesStore(s =>
 * s.actionMenuStyle)` es la página de Ajustes que edita la preferencia.
 */
export function useEffectiveActionMenuStyle(): ActionMenuStyle {
  const preference = useListPreferencesStore((s) => s.actionMenuStyle);
  const isTablet = useIsTablet();
  return isTablet ? 'dropdown' : preference;
}
