'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useEffectEvent } from 'react';

/**
 * Fires a callback whenever the Next.js pathname changes (including initial mount).
 * The callback is kept stable via `useEffectEvent` so callers do NOT need to memoize it.
 *
 * Policy: exception — query-driven state machine transition (Next.js routing
 * is an external "query" we react to, equivalent to TanStack Query data arrival).
 */
export function usePathnameChange(callback: (pathname: string) => void): void {
  const pathname = usePathname();
  const onPathnameChange = useEffectEvent(callback);

  useEffect(() => {
    onPathnameChange(pathname);
  }, [pathname]);
}
