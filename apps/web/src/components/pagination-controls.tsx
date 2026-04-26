'use client';

import type { ReactElement } from 'react';

/**
 * STUB — el ERP tiene un componente complejo de paginación que se usa
 * conjunto al `list-preferences-store`. Para F9 no hay listas todavía;
 * cuando llegue el primer module list page, se porta o reescribe.
 */
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export type ViewMode = 'table' | 'cards';

export function PaginationControls(): ReactElement | null {
  return null;
}
