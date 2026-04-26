import { useEffect } from 'react';

import type { RefObject } from 'react';

/**
 * Observes a container element and computes how many responsive columns
 * should be hidden based on available width. Re-evaluates on resize.
 *
 * @param wrapperRef       Ref to the container element
 * @param responsiveSizes  Array of column widths (narrowest first)
 * @param fixedColumnsWidth  Total width of fixed (always-visible) columns
 * @param setHiddenCount   Setter for hidden column count
 * @param setContainerWidth Setter for measured container width
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
    if (!el || responsiveSizes.length === 0) {
      return;
    }

    const container = el;
    function recalculate(): void {
      const available = container.clientWidth;
      setContainerWidth(available);
      if (available === 0) {
        return;
      }
      // Check if all columns fit WITHOUT expand column (expand only shows when hiding)
      // Add padding buffer per column: cell padding (24px) + sort header button (~28px)
      const COL_BUFFER = 52;
      const allResponsiveTotal = responsiveSizes.reduce((s, v) => s + v + COL_BUFFER, 0);
      if (fixedColumnsWidth - 36 + allResponsiveTotal <= available) {
        setHiddenCount(0);
        return;
      }
      // Need to hide — expand column will show, so include its 36px
      let used = fixedColumnsWidth;
      let kept = 0;
      for (const size of responsiveSizes) {
        if (used + size + COL_BUFFER <= available) {
          used += size + COL_BUFFER;
          kept++;
        } else {
          break;
        }
      }
      setHiddenCount(responsiveSizes.length - kept);
    }

    recalculate();
    const observer = new ResizeObserver(recalculate);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [wrapperRef, responsiveSizes, fixedColumnsWidth, setHiddenCount, setContainerWidth]);
}
