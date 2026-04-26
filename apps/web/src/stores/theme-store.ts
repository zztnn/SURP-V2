import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { THEME_PRESET_IDS, type ThemePresetId } from '@/config/themes';

interface ThemeState {
  preset: ThemePresetId;
  setPreset: (preset: ThemePresetId) => void;
}

const DEFAULT_PRESET: ThemePresetId = 'github';

function sanitize(value: unknown): ThemePresetId {
  return typeof value === 'string' && (THEME_PRESET_IDS as readonly string[]).includes(value)
    ? (value as ThemePresetId)
    : DEFAULT_PRESET;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preset: DEFAULT_PRESET,
      setPreset: (preset) => {
        set({ preset: sanitize(preset) });
      },
    }),
    {
      name: 'erp.color-scheme',
      partialize: (state) => ({ preset: state.preset }),
    },
  ),
);
