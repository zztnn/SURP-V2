import { useEffect } from 'react';

/**
 * Fija el índice de foco del search dentro del rango válido cuando cambian
 * los resultados. Reset a -1 si no hay resultados; clamp al último si el
 * índice actual excede el count.
 *
 * Policy: exception — clamp controlled state to external bounds. Rule 1
 * (derive inline) does not apply: `focusIndex` is the canonical state
 * driving the keyboard-nav handlers, so we must reconcile it back to a
 * valid value rather than computing a parallel `clampedFocusIndex`.
 */
export function useSearchFocusClamp(
  resultCount: number | null,
  focusIndex: number,
  setFocusIndex: (index: number) => void,
): void {
  useEffect(() => {
    if (resultCount === null || resultCount === 0) {
      if (focusIndex !== -1) {
        setFocusIndex(-1);
      }
    } else if (focusIndex >= resultCount) {
      setFocusIndex(resultCount - 1);
    }
  }, [resultCount, focusIndex, setFocusIndex]);
}
