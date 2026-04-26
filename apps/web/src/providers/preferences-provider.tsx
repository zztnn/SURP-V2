'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';

import { useThemeStore } from '@/stores/theme-store';
import { useZoomStore } from '@/stores/zoom-store';

/**
 * Sincroniza las preferencias visuales persistidas (preset de color,
 * zoom) con el `<html>`:
 *
 *   - `useThemeStore.preset` → `document.documentElement.dataset.theme`
 *     (lo consume `globals.css` con selectores `:root[data-theme='X']` y
 *     `.dark[data-theme='X']`).
 *   - `useZoomStore.factor` → CSS var `--zoom-factor` que escala `font-size`
 *     del root, lo que escala todo lo basado en rem (botones, padding,
 *     tipografía).
 *
 * Se monta dentro de `<Providers>` del frontend (debajo de `ThemeProvider`
 * de next-themes para no chocar con el `class="dark"` que ese pone en
 * `<html>`). Los efectos corren solo en el client — durante SSR el HTML
 * sale sin atributos y el primer render del client los aplica antes
 * de que el usuario perciba el flash.
 */
export function PreferencesProvider({ children }: { children: ReactNode }): ReactElement {
  const preset = useThemeStore((s) => s.preset);
  const zoomFactor = useZoomStore((s) => s.factor);

  useEffect(() => {
    document.documentElement.dataset['theme'] = preset;
  }, [preset]);

  useEffect(() => {
    // Aplicamos `font-size` directo en `<html>` (no via CSS var) porque
    // resolución de calc() con var() puede llegar tarde en algunos
    // browsers + Turbopack en dev. Setear `style.fontSize` es
    // determinístico y dispara recálculo inmediato de todos los `rem`
    // descendientes.
    const root = document.documentElement;
    root.style.fontSize = `${(16 * zoomFactor).toString()}px`;
    root.dataset['zoomFactor'] = zoomFactor.toString();
  }, [zoomFactor]);

  return <>{children}</>;
}
