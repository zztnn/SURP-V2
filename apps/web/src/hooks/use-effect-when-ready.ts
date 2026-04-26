import { useEffect, useRef } from 'react';

/**
 * Runs an effect once — the first time `ready` becomes true.
 * Returns the cleanup function on unmount.
 *
 * Useful for "start X when data/condition is available" patterns
 * where you only want the effect to fire once, not on every toggle.
 *
 * @param effect   Effect function (may return a cleanup)
 * @param ready    Condition that gates execution
 */
export function useEffectWhenReady(effect: () => (() => void) | undefined, ready: boolean): void {
  const firedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!ready || firedRef.current) {
      return;
    }
    firedRef.current = true;
    cleanupRef.current = effect();

    return () => {
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
