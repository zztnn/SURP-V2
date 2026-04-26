'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import type { ReactElement } from 'react';

/**
 * Logo del sidebar SURP. Diferencia con el ERP:
 *   - SURP es mono-org por user — no mostramos razón social variable.
 *     Branding fijo: Shield + "SURP 2.0" + "Arauco URP".
 *
 * Cuando llegue branding oficial de Arauco URP (logo + colores), se
 * reemplaza el icon por una `<Image>` real y los colores ad-hoc.
 */
export function SidebarLogo(): ReactElement {
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);

  return (
    <Link href="/dashboard" className="flex h-20 items-center border-b px-4">
      <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
        <Shield className="h-8 w-8" />
      </div>
      <div
        className={cn(
          'flex flex-col overflow-hidden whitespace-nowrap transition-[opacity,margin,max-width] duration-300',
          isExpanded ? 'ml-3 max-w-[160px] opacity-100 delay-150' : 'ml-0 max-w-0 opacity-0',
        )}
      >
        <span className="text-lg font-bold text-sidebar-foreground">{siteConfig.shortName}</span>
        <span className="text-[10px] leading-tight text-sidebar-foreground/50">Arauco URP</span>
      </div>
    </Link>
  );
}
