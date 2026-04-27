import { useEffect, useRef, useState } from 'react';

/**
 * Detects when a sentinel element scrolls out of view (i.e. sticky elements
 * above it are "stuck") and returns a compact flag for shrinking sticky bars.
 *
 * Policy: Rule 4 — IntersectionObserver subscription.
 */
export function useStickyCompact(): {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isCompact: boolean;
} {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsCompact(!entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { sentinelRef, isCompact };
}
