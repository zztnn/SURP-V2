'use client';

import { type ReactElement, type ReactNode } from 'react';

import { useDomAttributeSync } from '@/hooks/use-dom-attribute-sync';
import { useThemeStore } from '@/stores/theme-store';
import { useZoomStore } from '@/stores/zoom-store';

/**
 * Sincroniza las preferencias visuales persistidas (preset de color,
 * zoom) con el `<html>`:
 *
 *   - `useThemeStore.preset` → `document.documentElement.dataset.theme`
 *     (lo consume `globals.css` con selectores `:root[data-theme='X']` y
 *     `.dark[data-theme='X']`).
 *   - `useThemeStore.sidebarPreset` → `dataset.sidebarTheme`.
 *   - `useZoomStore.factor` → `style.fontSize` directo en `<html>` (no
 *     vía CSS var) porque la resolución de `calc(var(...))` puede llegar
 *     tarde en algunos browsers + Turbopack en dev. Setear `style.fontSize`
 *     es determinístico y dispara recálculo inmediato de todos los `rem`
 *     descendientes. También expone `data-zoom-factor` para selectores
 *     condicionales.
 *
 * Se monta dentro de `<Providers>` del frontend (debajo de `ThemeProvider`
 * de next-themes para no chocar con el `class="dark"` que ese pone en
 * `<html>`). El sync corre solo en el client — durante SSR el HTML sale
 * sin atributos y el primer render del client los aplica antes de que el
 * usuario perciba el flash.
 */
export function PreferencesProvider({ children }: { children: ReactNode }): ReactElement {
  const preset = useThemeStore((s) => s.preset);
  const sidebarPreset = useThemeStore((s) => s.sidebarPreset);
  const zoomFactor = useZoomStore((s) => s.factor);

  useDomAttributeSync(
    {
      theme: preset,
      sidebarTheme: sidebarPreset,
      zoomFactor: zoomFactor.toString(),
    },
    {
      fontSize: `${(16 * zoomFactor).toString()}px`,
    },
  );

  return <>{children}</>;
}
