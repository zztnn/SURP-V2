import { useEffect } from 'react';

import { pageHeaderRegistry } from '@/components/page-header-registry';

import type { LucideIcon } from 'lucide-react';
import type { RefObject } from 'react';

/**
 * Registers icon + title in the page header registry and observes
 * the header element's visibility with IntersectionObserver.
 *
 * Policy: Rule 4 — IntersectionObserver subscription + external registry sync.
 */
export function usePageHeaderObserver(
  ref: RefObject<HTMLDivElement | null>,
  Icon: LucideIcon,
  title: string,
): void {
  useEffect(() => {
    pageHeaderRegistry.set(Icon.displayName || Icon.name || '', title);

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry?.isIntersecting ?? true;
        if (isVisible) {
          hideTimer = setTimeout(() => {
            pageHeaderRegistry.setVisible(true);
          }, 150);
        } else {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          pageHeaderRegistry.setVisible(false);
        }
      },
      { threshold: 0 },
    );

    observer.observe(el);

    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      observer.disconnect();
      pageHeaderRegistry.clear();
    };
  }, [ref, Icon, title]);
}
