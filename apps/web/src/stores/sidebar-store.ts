import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Estado del sidebar. Persiste la preferencia del usuario (expandido/colapsado)
 * y qué grupos están abiertos. Basado en el patrón IWH.
 */
interface SidebarState {
  /** Estado runtime del sidebar (puede temporalmente forzarse en fullscreen). */
  isExpanded: boolean;
  /** Preferencia del usuario — se restaura tras salir de fullscreen o tablet. */
  userPreference: boolean;
  /** Drawer mobile abierto. */
  isMobileOpen: boolean;
  /** Grupos/subgrupos abiertos, clave = menu_items.code. */
  expandedSections: Record<string, boolean>;
  /** Texto del search inline del sidebar. */
  searchQuery: string;
  /** Índice del item actualmente enfocado en los resultados del search (-1 = ninguno). */
  searchFocusIndex: number;

  toggle: () => void;
  setExpanded: (expanded: boolean) => void;
  setMobileOpen: (open: boolean) => void;
  toggleSection: (code: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchFocusIndex: (index: number) => void;
  reset: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isExpanded: true,
      userPreference: true,
      isMobileOpen: false,
      expandedSections: {},
      searchQuery: '',
      searchFocusIndex: -1,
      toggle: () => {
        set((state) => ({
          isExpanded: !state.isExpanded,
          userPreference: !state.isExpanded,
        }));
      },
      setExpanded: (expanded) => {
        set({ isExpanded: expanded });
      },
      setMobileOpen: (open) => {
        set({ isMobileOpen: open });
      },
      toggleSection: (code) => {
        set((state) => ({
          expandedSections: {
            ...state.expandedSections,
            [code]: !state.expandedSections[code],
          },
        }));
      },
      setSearchQuery: (query) => {
        set({ searchQuery: query, searchFocusIndex: query ? 0 : -1 });
      },
      setSearchFocusIndex: (index) => {
        set({ searchFocusIndex: index });
      },
      reset: () => {
        set({ expandedSections: {}, searchQuery: '', searchFocusIndex: -1 });
      },
    }),
    {
      name: 'erp.sidebar',
      partialize: (state) => ({
        userPreference: state.userPreference,
        expandedSections: state.expandedSections,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isExpanded = state.userPreference;
        }
      },
    },
  ),
);
