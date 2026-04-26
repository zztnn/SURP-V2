'use client';

import { useCallback, useSyncExternalStore } from 'react';

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) {
        return () => undefined;
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => (hasMatchMedia() ? window.matchMedia(query).matches : false),
    [query],
  );
  const getServerSnapshot = (): boolean => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}

/**
 * Devuelve `isMobile` e `isTablet` desde una **suscripción única** —
 * ambos breakpoints se actualizan en el MISMO render de React. Sin esto,
 * dos `useSyncExternalStore` separados pueden producir un render
 * intermedio donde solo uno de los dos cambió (ej. `isMobile=false`,
 * `isTablet=true` cruzando 768px), disparando transiciones erráticas
 * en `useSidebarResponsive`.
 *
 * El snapshot se codifica como bitmask numérico (primitivo) para que
 * `useSyncExternalStore` lo compare con `Object.is` sin problemas de
 * identidad de objetos.
 */
export function useViewportMode(): { isMobile: boolean; isTablet: boolean } {
  const subscribe = useCallback((onChange: () => void) => {
    if (!hasMatchMedia()) {
      return () => undefined;
    }
    const mql768 = window.matchMedia('(max-width: 768px)');
    const mql1024 = window.matchMedia('(max-width: 1024px)');
    mql768.addEventListener('change', onChange);
    mql1024.addEventListener('change', onChange);
    return () => {
      mql768.removeEventListener('change', onChange);
      mql1024.removeEventListener('change', onChange);
    };
  }, []);

  const getSnapshot = useCallback((): number => {
    if (!hasMatchMedia()) {
      return 0;
    }
    return (
      (window.matchMedia('(max-width: 768px)').matches ? 1 : 0) |
      (window.matchMedia('(max-width: 1024px)').matches ? 2 : 0)
    );
  }, []);

  const getServerSnapshot = useCallback((): number => 0, []);

  const bitmask = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    isMobile: (bitmask & 1) !== 0,
    isTablet: (bitmask & 2) !== 0,
  };
}
