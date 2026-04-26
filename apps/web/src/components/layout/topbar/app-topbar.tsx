'use client';

import * as Icons from 'lucide-react';
import { CircleHelp, Home, Maximize, Minimize } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useRef, useState } from 'react';

import { usePageHeaderInfo } from '@/components/page-header-registry';
import { Button } from '@/components/ui/button';
import { useFullscreenChange } from '@/hooks/use-fullscreen-change';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useZoomStore } from '@/stores/zoom-store';

import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { ZoomControl } from './zoom-control';

/**
 * Keyboard Lock API helpers (Chromium-only). Bloquea ESC cuando entramos
 * fullscreen para que los modals/paneles flotantes puedan usar ESC sin que
 * el navegador salga del fullscreen. En Firefox/Safari son no-op (ESC sale).
 */
interface NavigatorKeyboard {
  lock?: (keyCodes?: string[]) => Promise<void>;
  unlock?: () => void;
}

function getKeyboard(): NavigatorKeyboard | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return (navigator as unknown as { keyboard?: NavigatorKeyboard }).keyboard;
}

function lockEscapeKey(): void {
  const kb = getKeyboard();
  if (!kb?.lock) {
    return;
  }
  void kb.lock(['Escape']).catch(() => undefined);
}

function unlockEscapeKey(): void {
  const kb = getKeyboard();
  kb?.unlock?.();
}

export function AppTopbar(): React.ReactElement {
  const isExpanded = useSidebarStore((s) => s.isExpanded);
  const setExpanded = useSidebarStore((s) => s.setExpanded);
  const zoomTopbarVisible = useZoomStore((s) => s.topbarVisible);
  const headerRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const expandedBeforeFullscreen = useRef<boolean | null>(null);

  function handleFullscreen(): void {
    if (!document.fullscreenElement) {
      expandedBeforeFullscreen.current = isExpanded;
      if (isExpanded) {
        setExpanded(false);
      }
      void document.documentElement.requestFullscreen().then(() => {
        lockEscapeKey();
      });
    } else {
      unlockEscapeKey();
      void document.exitFullscreen();
    }
  }

  useFullscreenChange((isFs) => {
    setIsFullscreen(isFs);
    if (!isFs) {
      unlockEscapeKey();
      if (expandedBeforeFullscreen.current !== null) {
        setExpanded(expandedBeforeFullscreen.current);
        expandedBeforeFullscreen.current = null;
      }
    }
  });

  return (
    <header
      ref={headerRef}
      className={cn(
        'relative z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 transition-[left] duration-300 sm:gap-4 sm:px-6',
        // Sombra al borde inferior — misma fórmula EXACTA que el sidebar
        // pero proyectada en eje Y. backdrop-blur removido para no crear
        // un efecto óptico extra que el sidebar no tiene.
        '[box-shadow:0_2px_8px_rgba(0,0,0,0.10)]',
        'dark:[box-shadow:0_2px_8px_rgba(0,0,0,0.4)]',
      )}
      style={{ backgroundColor: 'color-mix(in srgb, hsl(var(--background)) 85%, black)' }}
    >
      <div className="min-w-0 flex-1">
        <TopbarPageTitle />
      </div>

      <div className="flex items-center gap-1">
        {/* Mobile: Home button */}
        <Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden" asChild>
          <Link href="/dashboard">
            <Home className="h-5 w-5 text-muted-foreground" />
          </Link>
        </Button>

        {/* Desktop controls */}
        <div className="hidden items-center gap-1 lg:flex">
          {zoomTopbarVisible ? <ZoomControl /> : null}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => {
              setShowShortcuts(true);
            }}
            aria-label="Atajos de teclado"
          >
            <CircleHelp className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleFullscreen}>
            {isFullscreen ? (
              <Minimize className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Maximize className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="sr-only">
              {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </span>
          </Button>
          <div className="ml-2 h-6 w-px bg-border" />
        </div>

        <div className="ml-2">
          <UserMenu />
        </div>
      </div>
      <div
        style={{ border: 'none' }}
        className="pointer-events-none absolute inset-x-0 -bottom-3 z-50 h-3 bg-gradient-to-b from-black/18 to-transparent dark:from-black/35"
      />

      <KeyboardShortcutsModal open={showShortcuts} onOpenChange={setShowShortcuts} />
    </header>
  );
}

function resolveIcon(name: string): React.ComponentType<{ className?: string }> {
  const Icon = (Icons as unknown as Record<string, unknown>)[name] as
    | React.ComponentType<{ className?: string }>
    | undefined;
  return Icon ?? Icons.Circle;
}

/**
 * Wrapper module-scope para que el lookup dinámico a Lucide no cree una
 * identidad nueva por render (friendly con React Compiler).
 */
const DynamicIcon = React.memo(function DynamicIcon({
  name,
  className,
}: {
  name: string;
  className?: string | undefined;
}): React.JSX.Element {
  return React.createElement(resolveIcon(name), className === undefined ? {} : { className });
});

/**
 * Título compacto que aparece en el topbar cuando el `<PageHeader>` de la
 * página sale de la vista por scroll. Consume `usePageHeaderInfo()` del
 * registry global (alimentado por `usePageHeaderObserver`).
 */
function TopbarPageTitle(): React.JSX.Element {
  const info = usePageHeaderInfo();
  const show = !info.visible && info.title.length > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-2 transition-opacity duration-300',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <DynamicIcon name={info.icon} className="h-3.5 w-3.5 text-primary" />
      </div>
      <span className="truncate text-sm font-medium">{info.title}</span>
      {info.detail && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
            {info.detail}
          </span>
        </>
      )}
    </div>
  );
}
