'use client';

import { ChevronDown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';

import { FavoriteToggle } from '@/components/layout/favorite-toggle';
import { MenuIcon } from '@/components/layout/menu-icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCustomEventListener } from '@/hooks/use-custom-event-listener';
import { useMenu, useMenuBadges } from '@/hooks/use-menu';
import { useScrollIntoView } from '@/hooks/use-scroll-into-view';
import { useSearchFocusClamp } from '@/hooks/use-search-focus-clamp';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import type { MenuNode } from '@/types/menu';
import type * as React from 'react';

function hasActiveDescendant(nodes: MenuNode[], pathname: string): boolean {
  for (const n of nodes) {
    if (n.kind === 'item' && n.href) {
      if (pathname === n.href || pathname.startsWith(`${n.href}/`)) {
        return true;
      }
    }
    if (hasActiveDescendant(n.children, pathname)) {
      return true;
    }
  }
  return false;
}

function collectItems(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'item') {
      out.push(n);
    }
    out.push(...collectItems(n.children));
  }
  return out;
}

interface MenuNodeWithPath extends MenuNode {
  breadcrumb: string[];
}

function collectItemsWithPath(nodes: MenuNode[], parentPath: string[] = []): MenuNodeWithPath[] {
  const out: MenuNodeWithPath[] = [];
  for (const n of nodes) {
    if (n.kind === 'item') {
      out.push({ ...n, breadcrumb: parentPath });
    }
    out.push(...collectItemsWithPath(n.children, [...parentPath, n.label]));
  }
  return out;
}

interface SidebarLabelProps {
  children: React.ReactNode;
  isExpanded: boolean;
  className?: string;
}

function SidebarLabel({ children, isExpanded, className }: SidebarLabelProps): React.ReactElement {
  return (
    <span
      className={cn(
        'min-w-0 truncate overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-300',
        isExpanded ? 'max-w-[180px] opacity-100 delay-150' : 'max-w-0 opacity-0',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Resalta el tramo del label que coincide con la query de búsqueda. */
function HighlightText({ text, query }: { text: string; query: string }): React.ReactElement {
  if (!query) {
    return <>{text}</>;
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) {
    return <>{text}</>;
  }
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  return (
    <>
      {before}
      <span className="text-primary underline decoration-primary/50 underline-offset-2">
        {match}
      </span>
      {after}
    </>
  );
}

interface NavLinkProps {
  node: MenuNode;
  isChild?: boolean;
  badge?: number;
  searchQuery?: string;
  isFocused?: boolean;
  /** Oculta el toggle de favorito — ej. el item "Inicio" pinned. */
  hideStar?: boolean;
}

function NavLink({
  node,
  isChild,
  badge,
  searchQuery,
  isFocused,
  hideStar,
}: NavLinkProps): React.ReactElement {
  const pathname = usePathname();
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);
  const isMobileMenu = useSidebarStore((s) => s.isMobileOpen);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const href = node.href ?? '#';
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const loading = isNavigating && isPending;

  useScrollIntoView(linkRef, isFocused ?? false);

  function handleClick(e: React.MouseEvent): void {
    if (isActive) {
      return;
    }
    e.preventDefault();
    setIsNavigating(true);
    startTransition(() => {
      router.push(href);
    });
  }

  const hasBadge = badge !== undefined && badge > 0;
  const showStar = isExpanded && node.kind === 'item' && hideStar !== true;

  const link = (
    <Link
      ref={linkRef}
      href={href}
      onClick={handleClick}
      className={cn(
        'group flex items-center rounded-md transition-all duration-300 ease-in-out',
        isFocused && 'ring-1 ring-sidebar-foreground/50 bg-white/8',
        isExpanded
          ? isChild
            ? cn(
                isMobileMenu ? 'gap-3 px-4 py-3 text-base' : 'gap-2 px-3 py-1.5 text-xs',
                'font-normal text-sidebar-foreground',
                isActive ? 'bg-white/12 font-semibold text-sidebar-foreground' : 'hover:bg-white/8',
              )
            : cn(
                isMobileMenu ? 'h-12 gap-3 px-4 text-base' : 'h-9 gap-2 px-3 text-sm',
                'font-medium text-sidebar-foreground hover:bg-white/8',
                isActive &&
                  'border-l-[3px] border-white/60 bg-white/12 pl-[13px] font-semibold hover:bg-white/12',
              )
          : cn(
              'h-10 w-full justify-center px-0',
              isActive
                ? 'border-l-[3px] border-white/60 bg-white/12 text-sidebar-foreground hover:bg-white/12'
                : 'bg-transparent text-sidebar-foreground/80 hover:bg-white/8 hover:text-sidebar-foreground',
            ),
      )}
    >
      {loading ? (
        <Loader2
          className={cn(
            'shrink-0 animate-spin',
            isMobileMenu ? 'h-6 w-6' : isChild ? 'h-4 w-4' : 'h-5 w-5',
          )}
        />
      ) : (
        <MenuIcon
          name={node.icon}
          className={cn(
            'shrink-0',
            isMobileMenu
              ? 'h-6 w-6 text-sidebar-foreground/70'
              : isChild
                ? 'h-4 w-4 text-sidebar-foreground/70'
                : 'h-5 w-5 text-sidebar-foreground/70',
          )}
        />
      )}
      <SidebarLabel isExpanded={isExpanded}>
        {searchQuery ? <HighlightText text={node.label} query={searchQuery} /> : node.label}
      </SidebarLabel>
      {hasBadge && isExpanded && (
        <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
          {badge}
        </span>
      )}
      {showStar && (
        <FavoriteToggle
          menuItemId={node.id}
          isFavorite={node.isFavorite ?? false}
          className={hasBadge ? 'ml-1' : 'ml-auto'}
        />
      )}
    </Link>
  );

  if (isExpanded) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        className="bg-primary text-primary-foreground text-xs"
      >
        {node.label}
      </TooltipContent>
    </Tooltip>
  );
}

interface FlyoutItemsProps {
  nodes: MenuNode[];
  pathname: string;
  depth?: number;
  onClick?: () => void;
}

function FlyoutItems({
  nodes,
  pathname,
  depth = 0,
  onClick,
}: FlyoutItemsProps): React.ReactElement {
  return (
    <>
      {nodes.map((child) => {
        if (child.kind === 'item' && child.href) {
          const active = pathname === child.href || pathname.startsWith(`${child.href}/`);
          return (
            <Link
              key={child.id}
              href={child.href}
              {...(onClick !== undefined ? { onClick } : {})}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-primary/15 font-semibold text-primary'
                  : 'text-popover-foreground hover:bg-accent',
              )}
            >
              <MenuIcon name={child.icon} className="h-3.5 w-3.5 text-muted-foreground" />
              {child.label}
            </Link>
          );
        }
        return (
          <div key={child.id} className={cn(depth > 0 && 'ml-2')}>
            <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
              <MenuIcon name={child.icon} className="h-3.5 w-3.5" />
              {child.label}
            </p>
            <FlyoutItems
              nodes={child.children}
              pathname={pathname}
              depth={depth + 1}
              {...(onClick !== undefined ? { onClick } : {})}
            />
          </div>
        );
      })}
    </>
  );
}

interface CollapsedNavGroupProps {
  node: MenuNode;
  hasActive: boolean;
}

function CollapsedNavGroup({ node, hasActive }: CollapsedNavGroupProps): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allItems = useMemo(() => collectItems(node.children), [node.children]);
  const isFavoritesGroup = node.code === 'favorites';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-10 w-full items-center justify-center rounded-md transition-all duration-200',
                hasActive
                  ? 'border-l-[3px] border-white/60 bg-white/12 text-sidebar-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-white/8 hover:text-sidebar-foreground',
              )}
            >
              <MenuIcon
                name={node.icon}
                className={cn('h-5 w-5', isFavoritesGroup && 'text-amber-400')}
              />
              <span className="sr-only">{node.label}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={10}
          className="bg-primary text-primary-foreground text-xs"
        >
          {node.label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="max-h-[70vh] w-56 overflow-y-auto p-2"
      >
        <p className="mb-1 px-3 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {node.label}
        </p>
        <FlyoutItems
          nodes={node.children}
          pathname={pathname}
          onClick={() => {
            setOpen(false);
          }}
        />
        {allItems.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground/50">Sin items</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface NavGroupSectionProps {
  node: MenuNode;
  depth?: number;
  badges: Record<string, number>;
}

function NavGroupSection({ node, depth = 0, badges }: NavGroupSectionProps): React.ReactElement {
  const pathname = usePathname();
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);
  const isMobileMenu = useSidebarStore((s) => s.isMobileOpen);
  const expandedSections = useSidebarStore((s) => s.expandedSections);
  const toggleSection = useSidebarStore((s) => s.toggleSection);

  const defaultOpen = node.code === 'favorites' ? false : depth === 0;
  const isOpen = expandedSections[node.code] ?? defaultOpen;
  const hasActive = hasActiveDescendant(node.children, pathname);

  if (!isExpanded) {
    return <CollapsedNavGroup node={node} hasActive={hasActive} />;
  }

  const isNested = depth > 0;
  const isFavoritesGroup = node.code === 'favorites';
  const iconSize = isMobileMenu ? 'h-6 w-6' : isNested ? 'h-4 w-4' : 'h-5 w-5';
  const triggerHeight = isMobileMenu ? 'h-12' : isNested ? 'h-8' : 'h-9';
  const fontSize = isMobileMenu ? 'text-base' : isNested ? 'text-xs' : 'text-sm';
  const indent = isNested ? 'pl-3' : isMobileMenu ? 'pl-8' : 'pl-6';

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={() => {
        toggleSection(node.code);
      }}
    >
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center rounded-md font-medium transition-all duration-300 ease-in-out hover:bg-white/8 hover:text-sidebar-foreground/80',
          isMobileMenu ? 'gap-3 px-4' : 'gap-2 px-3',
          triggerHeight,
          fontSize,
          isNested ? 'text-sidebar-foreground/40' : 'text-sidebar-foreground/50',
        )}
      >
        <MenuIcon
          name={node.icon}
          className={cn(
            'shrink-0',
            iconSize,
            isFavoritesGroup ? 'text-amber-400' : 'text-sidebar-foreground/40',
          )}
        />
        <SidebarLabel isExpanded={isExpanded}>{node.label}</SidebarLabel>
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]',
            isOpen && 'rotate-180',
          )}
        />
        {!isOpen && hasActive && (
          <div className="ml-1 h-1.5 w-1.5 rounded-full bg-sidebar-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn('mt-1 flex flex-col gap-0', indent)}>
          {node.children.map((child) =>
            child.kind === 'item' ? (
              <NavLink
                key={child.id}
                node={child}
                isChild
                {...(child.badge !== undefined
                  ? { badge: child.badge }
                  : badges[child.code] !== undefined
                    ? { badge: badges[child.code] }
                    : {})}
              />
            ) : (
              <NavGroupSection key={child.id} node={child} depth={depth + 1} badges={badges} />
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarNav(): React.ReactElement {
  const menu = useMenu();
  const badges = useMenuBadges();
  const router = useRouter();
  const searchQueryRaw = useSidebarStore((s) => s.searchQuery);
  const searchFocusIndex = useSidebarStore((s) => s.searchFocusIndex);
  const setSearchFocusIndex = useSidebarStore((s) => s.setSearchFocusIndex);
  const setSearchQuery = useSidebarStore((s) => s.setSearchQuery);

  const query = searchQueryRaw.toLowerCase().trim();

  const allNodes = useMemo(() => menu.data?.nodes ?? [], [menu.data]);
  // "Inicio" (code=dashboard) se renderiza pinned arriba de Favoritos y queda
  // FUERA de los resultados de búsqueda — no debe aparecer al filtrar.
  const homeNode = useMemo(() => allNodes.find((n) => n.code === 'dashboard') ?? null, [allNodes]);
  const nodes = useMemo(() => allNodes.filter((n) => n.code !== 'dashboard'), [allNodes]);
  const favorites = useMemo(() => menu.data?.favorites ?? [], [menu.data]);
  const badgesMap = badges.data ?? {};

  const favoritesGroup = useMemo<MenuNode | null>(() => {
    if (favorites.length === 0) {
      return null;
    }
    return {
      id: -1,
      code: 'favorites',
      kind: 'group',
      label: 'Favoritos',
      icon: 'Star',
      children: favorites,
    };
  }, [favorites]);

  // Resultados aplanados con breadcrumb para la búsqueda.
  const filteredFlat = useMemo((): MenuNodeWithPath[] | null => {
    if (!query) {
      return null;
    }
    const allItems = collectItemsWithPath(nodes);
    const seen = new Set<number>();
    return allItems.filter((item) => {
      if (seen.has(item.id) || !item.label.toLowerCase().includes(query)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }, [query, nodes]);

  // Enter en el search navega al item enfocado.
  const handleSearchNavigate = useCallback(() => {
    if (filteredFlat && searchFocusIndex >= 0 && searchFocusIndex < filteredFlat.length) {
      const target = filteredFlat[searchFocusIndex];
      if (target?.href) {
        setSearchQuery('');
        router.push(target.href);
      }
    }
  }, [filteredFlat, searchFocusIndex, router, setSearchQuery]);

  useCustomEventListener('sidebar-search-navigate', handleSearchNavigate);

  useSearchFocusClamp(
    filteredFlat ? filteredFlat.length : null,
    searchFocusIndex,
    setSearchFocusIndex,
  );

  if (menu.isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="h-5 w-5 animate-pulse rounded bg-sidebar-foreground/10" />
            <div className="h-3 flex-1 animate-pulse rounded bg-sidebar-foreground/10" />
          </div>
        ))}
      </div>
    );
  }
  if (menu.isError || !menu.data) {
    return (
      <div className="px-4 py-6 text-xs text-sidebar-foreground/50">No se pudo cargar el menú.</div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-1 p-2 mt-2 pb-2">
        {/* Pinned arriba: Inicio (siempre) + Favoritos. Ambos se muestran
            incluso durante la búsqueda y NO aparecen en resultados filtrados. */}
        {homeNode && (
          <NavLink
            node={homeNode}
            hideStar
            {...(badgesMap[homeNode.code] !== undefined ? { badge: badgesMap[homeNode.code] } : {})}
          />
        )}
        {favoritesGroup && <NavGroupSection node={favoritesGroup} badges={badgesMap} />}

        {filteredFlat !== null ? (
          filteredFlat.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-sidebar-foreground/40">
              Sin resultados para &ldquo;{searchQueryRaw}&rdquo;
            </p>
          ) : (
            filteredFlat.map((item, index) => (
              <div key={item.id}>
                {item.breadcrumb.length > 0 && (
                  <p className="truncate px-3 pt-1.5 text-[10px] leading-tight text-sidebar-foreground/30">
                    {item.breadcrumb.join(' › ')}
                  </p>
                )}
                <NavLink
                  node={item}
                  searchQuery={searchQueryRaw}
                  isFocused={index === searchFocusIndex}
                />
              </div>
            ))
          )
        ) : (
          nodes.map((node) =>
            node.kind === 'item' ? (
              <NavLink
                key={node.id}
                node={node}
                {...(node.badge !== undefined
                  ? { badge: node.badge }
                  : badgesMap[node.code] !== undefined
                    ? { badge: badgesMap[node.code] }
                    : {})}
              />
            ) : (
              <NavGroupSection key={node.id} node={node} badges={badgesMap} />
            ),
          )
        )}
      </nav>
    </TooltipProvider>
  );
}
