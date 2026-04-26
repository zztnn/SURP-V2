'use client';

import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { cn } from '@/lib/utils';
import { ZOOM_FACTORS, useZoomStore } from '@/stores/zoom-store';

/**
 * Control compacto de zoom para el topbar. Visibilidad gobernada por
 * `useZoomStore.topbarVisible` (toggle en `/settings/apariencia`). Comparte
 * el mismo `factor` con la sección Zoom de Apariencia — los cambios aquí
 * se reflejan allá y viceversa.
 */
export function ZoomControl(): ReactElement | null {
  const factor = useZoomStore((s) => s.factor);
  const setFactor = useZoomStore((s) => s.setFactor);
  const [mounted, setMounted] = useState(false);

  // Persist está hidratado solo client-side. Sin esto el botón muestra el
  // default antes de que zustand-persist termine de leer localStorage en
  // el primer render del cliente, causando flash visual.
  useMountEffect(() => {
    setMounted(true);
    return undefined;
  });

  if (!mounted) {
    return <div className="h-10 w-14" aria-hidden />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 w-14 px-0 text-xs tabular-nums text-muted-foreground"
          title="Tamaño de la interfaz"
          aria-label={`Zoom actual ${String(Math.round(factor * 100))} por ciento`}
        >
          {Math.round(factor * 100)}%
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[100px]">
        {ZOOM_FACTORS.map((value) => (
          <DropdownMenuItem
            key={value}
            className={cn(
              'justify-center tabular-nums',
              value === factor && 'font-bold text-primary',
            )}
            onClick={() => {
              setFactor(value);
            }}
          >
            {Math.round(value * 100)}%
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
