'use client';

import { useEffect, useRef } from 'react';

interface SidebarResponsiveOptions {
  isMobile: boolean;
  isTablet: boolean;
  userPreference: boolean;
  setExpanded: (expanded: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

/**
 * Auto-colapsa el sidebar en tablet y restaura la preferencia en desktop.
 * Patrón portado de IWH (`iwh-web-client/src/hooks/use-sidebar-responsive.ts`)
 * para garantizar transiciones fluidas entre los 3 viewports.
 *
 * Policy: exception — viewport-driven imperative state coordination.
 * The viewport breakpoint is an external "query" (media query); the
 * `autoCollapsedRef` flag tracks whether we're in an auto-vs-manual state
 * machine, which cannot be expressed inline.
 *
 * Comportamiento por viewport:
 *
 * - **Mobile** (`isMobile=true`): colapsa `isExpanded` a false y marca
 *   `autoCollapsedRef` para que el restore de desktop dispare correcto
 *   al salir. NO toca `isMobileOpen` (lo gestiona el handle del sidebar).
 *
 * - **Tablet** (`isTablet=true && !isMobile`): auto-colapsa una sola vez,
 *   marcando `autoCollapsedRef`.
 *
 * - **Desktop** (`!isTablet && !isMobile`): si `autoCollapsedRef` está
 *   activo, restaura la preferencia persistida del usuario.
 *
 * El early return en mobile separa esa rama del resto y previene
 * transiciones intermedias incorrectas cuando se cruzan breakpoints.
 */
export function useSidebarResponsive({
  isMobile,
  isTablet,
  userPreference,
  setExpanded,
  setMobileOpen,
}: SidebarResponsiveOptions): void {
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    if (isMobile) {
      // Entrando a mobile: collapse el estado para que `isExpanded` quede
      // en false. Si el user después redimensiona a desktop, el branch
      // de restore detectará `autoCollapsedRef` y aplicará la preferencia.
      if (!autoCollapsedRef.current) {
        autoCollapsedRef.current = true;
        setExpanded(false);
      }
      return;
    }

    // !isMobile desde aquí — cerrar el overlay si quedó abierto.
    setMobileOpen(false);

    if (isTablet) {
      // Tablet: auto-collapse una vez.
      if (!autoCollapsedRef.current) {
        autoCollapsedRef.current = true;
        setExpanded(false);
      }
    } else if (autoCollapsedRef.current) {
      // Desktop: restaurar la preferencia persistida del usuario.
      autoCollapsedRef.current = false;
      setExpanded(userPreference);
    }
  }, [isMobile, isTablet, userPreference, setExpanded, setMobileOpen]);
}
