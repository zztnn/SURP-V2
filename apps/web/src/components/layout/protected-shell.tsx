'use client';

import { useRouter } from 'next/navigation';

import { AppSidebar } from '@/components/layout/sidebar/app-sidebar';
import { AppTopbar } from '@/components/layout/topbar/app-topbar';
import { NavigationProgress } from '@/components/navigation-progress';
import { useMe } from '@/hooks/use-auth';
import { useEffectWhenReady } from '@/hooks/use-effect-when-ready';
import { useIsMobile } from '@/hooks/use-media-query';
import { useSidebarStore } from '@/stores/sidebar-store';

import type { ReactElement, ReactNode } from 'react';

/**
 * Shell autenticado SURP. Diferencia con el ERP:
 *   - SURP es mono-org por user. NO hay selector de empresa, NO hay
 *     `useSwitchCompany`, NO hay `active-company-store`.
 *   - El user pertenece a una sola `organization` (Arauco principal,
 *     security_provider asignada, o api_consumer); eso queda en
 *     `AuthUser.organizationId` y se usa como contexto implícito.
 *
 * El shell:
 *   1. Llama `useMe()` (F9.5: real → /auth/me).
 *   2. Si la respuesta es null o error → redirige a /login.
 *   3. Si OK → renderiza sidebar + topbar + main offsetado por
 *      CSS var --sidebar-offset (ajustada por el sidebar al toggle).
 */
export function ProtectedShell({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const { data, isLoading, isError } = useMe();
  const isMobile = useIsMobile();
  const isExpanded = useSidebarStore((s) => s.isExpanded);

  const shouldRedirect = !isLoading && (data === null || isError);
  useEffectWhenReady(() => {
    router.replace('/login');
    return undefined;
  }, shouldRedirect);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirigiendo al login…
      </div>
    );
  }

  const mainOffset = isMobile ? 0 : isExpanded ? 260 : 80;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      <NavigationProgress />
      <AppSidebar />
      <div
        className="flex min-w-0 flex-1 flex-col transition-[margin] duration-300"
        style={{ marginLeft: `${String(mainOffset)}px` }}
      >
        <AppTopbar />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="w-full px-4 py-6 sm:px-6 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
