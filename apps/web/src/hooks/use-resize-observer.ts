import { useEffect, useEffectEvent } from 'react';

import type { RefObject } from 'react';

/**
 * Observes an element with ResizeObserver and calls the callback on size changes.
 * The callback is kept stable via `useEffectEvent` so callers do NOT need to memoize it.
 *
 * @param ref        Ref to the element to observe
 * @param callback   Called on resize with the observed element
 *
 * Policy: Rule 4 — ResizeObserver browser API subscription.
 */
export function useResizeObserver(
  ref: RefObject<HTMLElement | null>,
  callback: (el: HTMLElement) => void,
): void {
  const onResize = useEffectEvent(callback);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const ro = new ResizeObserver(() => {
      onResize(el);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [ref]);
}
