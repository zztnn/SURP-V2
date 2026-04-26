'use client';

import { Bell, Palette, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

interface SettingsNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly SettingsNavItem[] = [
  { href: '/settings/perfil', label: 'Perfil', icon: User },
  { href: '/settings/seguridad', label: 'Seguridad', icon: Shield },
  { href: '/settings/apariencia', label: 'Apariencia', icon: Palette },
  { href: '/settings/notificaciones', label: 'Notificaciones', icon: Bell },
];

/**
 * Layout interno de `/settings/*` (Modelo D).
 *
 * Desktop (≥768 px): sidebar lateral de 240 px con nav vertical;
 * el contenido se renderiza a la derecha.
 *
 * Mobile (<768 px): tabs horizontales scrolleables arriba (patrón
 * Stripe/Vercel/GitHub); el contenido se renderiza debajo.
 *
 * El layout NO renderiza un PageHeader propio — cada sub-página define
 * su propio header (consistente con el resto del proyecto, ver
 * `(protected)/me/page.tsx`).
 */
export default function SettingsLayout({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  return (
    <div className={cn('flex flex-col gap-6 md:flex-row md:gap-8')}>
      {isMobile ? (
        <SettingsMobileTabs pathname={pathname} />
      ) : (
        <SettingsDesktopSidebar pathname={pathname} />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SettingsDesktopSidebar({ pathname }: { pathname: string }): ReactElement {
  return (
    <aside className="w-60 shrink-0">
      <nav aria-label="Configuración" className="sticky top-4 flex flex-col gap-1">
        <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Configuración
        </h2>
        {NAV_ITEMS.map((item) => (
          <SettingsNavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function SettingsMobileTabs({ pathname }: { pathname: string }): ReactElement {
  return (
    <nav
      aria-label="Configuración"
      className="-mx-4 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6"
    >
      <ul className="flex min-w-max gap-1 pb-px">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <SettingsTabLink item={item} active={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SettingsNavLink({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: boolean;
}): ReactElement {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function SettingsTabLink({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: boolean;
}): ReactElement {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
