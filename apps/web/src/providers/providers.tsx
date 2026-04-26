'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Toaster } from 'sonner';

/**
 * Providers raíz del frontend SURP. Se montan en `app/layout.tsx`.
 *
 * - `ThemeProvider` (next-themes): light/dark + auto-detect del sistema.
 *   En F9.3 se agregará el preset de color (atom/github/dracula/...) vía
 *   `data-theme` attribute en `<html>`.
 * - `QueryClientProvider` (TanStack Query): cache de fetch con defaults
 *   conservadores — no refetch on window focus, retry 1, staleTime 30s.
 * - `Toaster` (Sonner): notificaciones globales, posición top-right.
 *
 * `TooltipProvider` se difiere a F9.3 (necesita Radix UI primero).
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
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
