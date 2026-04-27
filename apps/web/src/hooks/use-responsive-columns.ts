'use client';

import { useEffect } from 'react';

import type { RefObject } from 'react';

/**
 * Mide el container del DataTable y reporta `containerWidth` +
 * `hiddenCount`.
 *
 * Usa `setTimeout(0)` en vez de `requestAnimationFrame` para diferir
 * al próximo macrotask, ejecutándose después del paint del browser.
 * Más robusto que RAF contra el ciclo mount-unmount-mount de React
 * Strict Mode (dev) que cancela RAFs antes de disparar.
 *
 * El `ResizeObserver` reacciona a cambios posteriores (sidebar
 * animando, ventana, zoom).
 *
 * Policy: Rule 4 — ResizeObserver subscription + measure-once mount sync.
 */
export function useResponsiveColumns(
  wrapperRef: RefObject<HTMLElement | null>,
  responsiveSizes: number[],
  fixedColumnsWidth: number,
  setHiddenCount: (count: number) => void,
  setContainerWidth: (width: number) => void,
): void {
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }

    function applyMeasure(width: number): void {
      setContainerWidth(width);
      if (responsiveSizes.length === 0 || width === 0) {
        setHiddenCount(0);
        return;
      }
      const COL_BUFFER = 52;
      const allResponsiveTotal = responsiveSizes.reduce((s, v) => s + v + COL_BUFFER, 0);
      if (fixedColumnsWidth - 36 + allResponsiveTotal <= width) {
        setHiddenCount(0);
        return;
      }
      let used = fixedColumnsWidth;
      let kept = 0;
      for (const size of responsiveSizes) {
        if (used + size + COL_BUFFER <= width) {
          used += size + COL_BUFFER;
          kept++;
        } else {
          break;
        }
      }
      setHiddenCount(responsiveSizes.length - kept);
    }

    function measureNow(): void {
      const current = wrapperRef.current;
      if (!current) {
        return;
      }
      applyMeasure(current.getBoundingClientRect().width);
    }

    // Initial measure: setTimeout(0) defers to next macrotask, after
    // browser layout/paint. Survives Strict Mode mount-unmount-mount.
    const timerId = setTimeout(measureNow, 0);

    // Observer for resizes (sidebar animation, window, zoom).
    const observer = new ResizeObserver(measureNow);
    observer.observe(el);

    return () => {
      clearTimeout(timerId);
      observer.disconnect();
    };
  }, [wrapperRef, responsiveSizes, fixedColumnsWidth, setHiddenCount, setContainerWidth]);
}
