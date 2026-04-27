import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  SIDEBAR_PRESET_IDS,
  THEME_PRESET_IDS,
  type SidebarPresetId,
  type ThemePresetId,
} from '@/config/themes';

interface ThemeState {
  preset: ThemePresetId;
  sidebarPreset: SidebarPresetId;
  setPreset: (preset: ThemePresetId) => void;
  setSidebarPreset: (preset: SidebarPresetId) => void;
}

const DEFAULT_PRESET: ThemePresetId = 'araucaria';
const DEFAULT_SIDEBAR_PRESET: SidebarPresetId = 'bosque';

function sanitizePreset(value: unknown): ThemePresetId {
  return typeof value === 'string' && (THEME_PRESET_IDS as readonly string[]).includes(value)
    ? (value as ThemePresetId)
    : DEFAULT_PRESET;
}

function sanitizeSidebarPreset(value: unknown): SidebarPresetId {
  return typeof value === 'string' && (SIDEBAR_PRESET_IDS as readonly string[]).includes(value)
    ? (value as SidebarPresetId)
    : DEFAULT_SIDEBAR_PRESET;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preset: DEFAULT_PRESET,
      sidebarPreset: DEFAULT_SIDEBAR_PRESET,
      setPreset: (preset) => {
        set({ preset: sanitizePreset(preset) });
      },
      setSidebarPreset: (preset) => {
        set({ sidebarPreset: sanitizeSidebarPreset(preset) });
      },
    }),
    {
      name: 'surp.color-scheme',
      partialize: (state) => ({
        preset: state.preset,
        sidebarPreset: state.sidebarPreset,
      }),
      migrate: (persisted) => {
        const raw = (persisted ?? {}) as Record<string, unknown>;
        return {
          preset: sanitizePreset(raw['preset']),
          sidebarPreset: sanitizeSidebarPreset(raw['sidebarPreset']),
        };
      },
    },
  ),
);
