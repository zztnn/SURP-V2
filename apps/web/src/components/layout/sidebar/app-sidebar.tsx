'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useCssCustomProperty } from '@/hooks/use-css-custom-property';
import { useViewportMode } from '@/hooks/use-media-query';
import { usePathnameChange } from '@/hooks/use-pathname-change';
import { useSidebarResponsive } from '@/hooks/use-sidebar-responsive';
import { useWindowKeyDown } from '@/hooks/use-window-keydown';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import { SidebarFooter } from './sidebar-footer';
import { SidebarLogo } from './sidebar-logo';
import { SidebarNav } from './sidebar-nav';
import { SidebarSearch } from './sidebar-search';

function SidebarContent({
  isMobile,
  onClose,
}: {
  isMobile: boolean;
  onClose?: () => void;
}): React.ReactElement {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden sidebar-gradient">
        {isMobile && onClose ? (
          <div className="relative">
            <SidebarLogo />
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={onClose}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <SidebarLogo />
        )}
        <SidebarSearch />
        <div className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarNav />
        </div>
        <SidebarFooter />
      </div>
    </TooltipProvider>
  );
}

export function AppSidebar(): React.ReactElement {
  // Suscripción única a ambos breakpoints — evita el render intermedio
  // donde solo uno cambió (ver useViewportMode en use-media-query.ts).
  const { isMobile, isTablet } = useViewportMode();
  const isExpanded = useSidebarStore((s) => s.isExpanded);
  const setExpanded = useSidebarStore((s) => s.setExpanded);
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const userPreference = useSidebarStore((s) => s.userPreference);

  usePathnameChange(() => {
    setMobileOpen(false);
  });

  useSidebarResponsive({ isMobile, isTablet, userPreference, setExpanded, setMobileOpen });

  const sidebarOffset = isMobile ? 0 : isExpanded ? 260 : 80;
  useCssCustomProperty('--sidebar-offset', `${String(sidebarOffset)}px`);

  useWindowKeyDown((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setMobileOpen(false);
    }
  }, isMobile && isMobileOpen);

  return (
    <>
      {isMobile && !isMobileOpen && (
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => {
            setMobileOpen(true);
          }}
          className={cn(
            'fixed left-0 top-1/2 z-[41] -translate-y-1/2',
            'flex h-14 w-[14px] items-center justify-center',
            'rounded-r-lg bg-[hsl(var(--sidebar))]',
            '[box-shadow:2px_0_8px_rgba(0,0,0,0.18)]',
            'dark:[box-shadow:2px_0_8px_rgba(0,0,0,0.55)]',
            'text-sidebar-foreground/40 transition-all duration-200',
            'hover:w-[18px] hover:text-sidebar-foreground',
            'active:scale-y-95',
          )}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className={cn(
          'fixed inset-0 bg-black/50',
          isMobile ? 'z-[1004]' : 'z-[39]',
          isMobile && isMobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transition: 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        onClick={() => {
          setMobileOpen(false);
        }}
        aria-hidden
      />

      <aside
        // KEY CRÍTICO: fuerza a React a remontar el aside al cruzar
        // mobile↔desktop. Sin esto, las dos transiciones distintas
        // (`width` en desktop, `translate` en mobile) se encadenan en
        // el mismo nodo DOM y generan un salto visual fuerte. Patrón
        // copiado literalmente de IWH (`app-sidebar.tsx` línea 127).
        key={isMobile ? 'mobile' : 'desktop'}
        className={cn(
          'shrink-0 bg-[hsl(var(--sidebar))]',
          // Sombra al borde derecho — misma fórmula que el topbar pero
          // proyectada en eje X. z-50 para asegurar que la sombra se
          // pinte ENCIMA del main (si no, el bg del main la tapa).
          '[box-shadow:2px_0_8px_rgba(0,0,0,0.15)]',
          'dark:[box-shadow:2px_0_8px_rgba(0,0,0,0.5)]',
          isMobile
            ? cn(
                'fixed inset-0 h-full w-full z-[1005]',
                isMobileOpen ? 'translate-x-0' : '-translate-x-full',
              )
            : 'fixed left-0 top-0 h-[100dvh] z-50',
        )}
        style={{
          ...(!isMobile ? { width: isExpanded ? 260 : 80 } : {}),
          transition: isMobile
            ? 'translate 400ms cubic-bezier(0.32, 0.72, 0, 1)'
            : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <SidebarContent
          isMobile={isMobile}
          {...(isMobile
            ? {
                onClose: () => {
                  setMobileOpen(false);
                },
              }
            : {})}
        />
        {/*
          Antes había un div con gradient `from-black/20` proyectándose
          al lado derecho para simular sombra. Lo eliminamos: ahora el
          aside usa SOLO box-shadow (idéntico al del topbar pero en eje
          horizontal), evitando que dos capas se sumen visualmente.
        */}
        {!isMobile && (
          <button
            type="button"
            aria-label={isExpanded ? 'Colapsar sidebar' : 'Expandir sidebar'}
            onClick={() => {
              useSidebarStore.getState().toggle();
            }}
            className={cn(
              'group/tab absolute -right-[14px] top-1/2 z-[41] -translate-y-1/2',
              'flex h-14 w-[14px] items-center justify-center',
              'rounded-r-lg bg-[hsl(var(--sidebar))]',
              '[box-shadow:2px_0_8px_rgba(0,0,0,0.18)]',
              'dark:[box-shadow:2px_0_8px_rgba(0,0,0,0.55)]',
              'text-sidebar-foreground/40 transition-all duration-200',
              'hover:w-[18px] hover:text-sidebar-foreground hover:bg-[hsl(var(--sidebar)/0.9)]',
              'active:scale-y-95',
            )}
          >
            {isExpanded ? (
              <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover/tab:scale-110" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/tab:scale-110" />
            )}
          </button>
        )}
      </aside>
    </>
  );
}
