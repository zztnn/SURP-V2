import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Niveles de zoom soportados (discretos, no slider). Aplican a `<html>`
 * vía `font-size` directo en `PreferencesProvider`. Persiste en
 * localStorage `surp.zoom`.
 */
export const ZOOM_FACTORS = [0.8, 0.9, 1, 1.1, 1.25] as const;
export type ZoomFactor = (typeof ZOOM_FACTORS)[number];

const DEFAULT_FACTOR: ZoomFactor = 1;

function isZoomFactor(value: unknown): value is ZoomFactor {
  return typeof value === 'number' && (ZOOM_FACTORS as readonly number[]).includes(value);
}

interface ZoomState {
  factor: ZoomFactor;
  /**
   * Mostrar el control compacto de zoom en el topbar.
   * Default `false` — el topbar ya tiene piezas (theme + user menu);
   * el control se prende explícitamente desde `/settings/apariencia`.
   */
  topbarVisible: boolean;
  setFactor: (factor: ZoomFactor) => void;
  setTopbarVisible: (visible: boolean) => void;
}

export const useZoomStore = create<ZoomState>()(
  persist(
    (set) => ({
      factor: DEFAULT_FACTOR,
      topbarVisible: false,
      setFactor: (factor) => {
        set({ factor: isZoomFactor(factor) ? factor : DEFAULT_FACTOR });
      },
      setTopbarVisible: (visible) => {
        set({ topbarVisible: visible });
      },
    }),
    {
      name: 'surp.zoom',
      partialize: (state) => ({ factor: state.factor, topbarVisible: state.topbarVisible }),
    },
  ),
);
