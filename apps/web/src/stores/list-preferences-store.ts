import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ViewMode } from '@/components/pagination-controls';

export type ActionMenuStyle = 'inline' | 'dropdown';

/**
 * List-page preferences persisted across sessions.
 *
 * ⚠️ `actionMenuStyle` is the RAW persisted preference. Do NOT subscribe
 * to it directly from list pages or column factories — use
 * `useListPageState()` (default) or `useEffectiveActionMenuStyle()`
 * instead. Those hooks auto-flip the style to `"dropdown"` at
 * `max-width: 1024px` so the inline cluster does not overflow the
 * sticky-right edge on narrow viewports. Saltárselos deja al cluster
 * inline pegado a la izquierda. El único consumidor directo válido es
 * la página de Ajustes que edita la preferencia.
 */
interface ListPreferencesState {
  viewMode: ViewMode;
  pageSize: number;
  actionMenuStyle: ActionMenuStyle;
  setViewMode: (mode: ViewMode) => void;
  setPageSize: (size: number) => void;
  setActionMenuStyle: (style: ActionMenuStyle) => void;
}

export const useListPreferencesStore = create<ListPreferencesState>()(
  persist(
    (set) => ({
      viewMode: 'table',
      pageSize: 24,
      actionMenuStyle: 'dropdown',
      setViewMode: (viewMode) => set({ viewMode }),
      setPageSize: (pageSize) => set({ pageSize }),
      setActionMenuStyle: (actionMenuStyle) => set({ actionMenuStyle }),
    }),
    {
      name: 'list-preferences',
    },
  ),
);
