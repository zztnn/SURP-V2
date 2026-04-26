import { useEffect } from 'react';

import type { RefObject } from 'react';

/**
 * Scrolls the referenced element into view when `shouldScroll` is true.
 * Uses `block: "nearest"` to avoid unnecessary layout jumps.
 *
 * @param ref           Ref to the element to scroll into view
 * @param shouldScroll  Whether scrolling should happen
 */
export function useScrollIntoView(ref: RefObject<HTMLElement | null>, shouldScroll: boolean): void {
  useEffect(() => {
    if (shouldScroll && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [shouldScroll, ref]);
}
