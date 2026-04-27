'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PreferencesProvider } from '@/providers/preferences-provider';

/**
 * Providers raíz del frontend SURP. Se montan en `app/layout.tsx`.
 *
 * - `ThemeProvider` (next-themes): light/dark + auto-detect del sistema.
 * - `PreferencesProvider`: sincroniza preset de color (`data-theme`) y
 *   zoom (`--zoom-factor`) con `<html>` desde los stores Zustand.
 * - `QueryClientProvider` (TanStack Query): cache de fetch con defaults
 *   conservadores — no refetch on window focus, retry 1, staleTime 30s.
 * - `Toaster` (Sonner): wrapper local en `@/components/ui/sonner` con
 *   styling unificado SURP/IWH/ERP — borde izquierdo de color por
 *   variante, fondo translúcido sobre `card`, barra de progreso, ícono
 *   de loading reemplazado por `Loader2`.
 */
export function Providers({ children }: { children: ReactNode }): ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
