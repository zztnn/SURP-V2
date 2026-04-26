'use client';

import type { ReactElement } from 'react';

interface FavoriteToggleProps {
  menuItemId?: number;
  isFavorite?: boolean;
  className?: string;
}

/**
 * STUB — el ERP usa este toggle para marcar items del menú dinámico
 * como favoritos. SURP MVP no soporta favoritos (menú estático). El
 * sidebar-nav del ERP lo renderiza inline; lo dejamos como no-op
 * pero respetando la firma de props para que el TS compile sin
 * tener que parchear `sidebar-nav.tsx`.
 */
export function FavoriteToggle(_props: FavoriteToggleProps): ReactElement | null {
  return null;
}
