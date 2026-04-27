'use client';

import Image from 'next/image';
import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import type { ReactElement } from 'react';

export function SidebarLogo(): ReactElement {
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);

  return (
    <Link
      href="/dashboard"
      className={cn('flex h-20 items-center border-b', isExpanded ? 'px-4' : 'justify-center')}
    >
      <Image
        src="/surp-logo.svg"
        alt="SURP 2.0"
        width={60}
        height={60}
        priority
        className="h-[60px] w-[60px] shrink-0"
      />
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
