import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// El sistema se usa exclusivamente en Chile. Se conserva el store
// por compatibilidad con los hooks/componentes que leen `regionalFormat`,
// pero solo existe una opción.
export type RegionalFormat = 'es-CL';

interface LocaleState {
  regionalFormat: RegionalFormat;
  setRegionalFormat: (format: RegionalFormat) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      regionalFormat: 'es-CL',
      setRegionalFormat: (regionalFormat) => set({ regionalFormat }),
    }),
    {
      name: 'locale-storage',
      partialize: (state) => ({ regionalFormat: state.regionalFormat }),
    },
  ),
);
