'use client';

import { Download, Filter, Plus, RefreshCw, Search, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  onNew?: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  showFilters: boolean;
  activeFilterCount?: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Si se provee, muestra un botón de descarga XLSX antes del refresh. */
  onExport?: () => void;
  newLabel?: string;
  searchPlaceholder?: string;
  className?: string;
}

function ActionBar({
  onNew,
  searchValue,
  onSearchChange,
  onToggleFilters,
  showFilters,
  activeFilterCount,
  hasActiveFilters,
  onRefresh,
  isRefreshing,
  onExport,
  newLabel = 'Nuevo',
  searchPlaceholder,
  className,
}: ActionBarProps): React.JSX.Element {
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'rounded-md border',
        // 3D depth: gradient, custom border, inset top highlight
        'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
        'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
        'border-black/[0.1]',
        '[box-shadow:0_2px_12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
        'dark:border-white/[0.1]',
        'dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]',
        'py-2 px-3',
        'flex flex-wrap items-center gap-2 sm:gap-3',
        className,
      )}
    >
      {/* New button */}
      {onNew && (
        <Button onClick={onNew} className="shrink-0">
          <Plus className="h-4 w-4" />
          {newLabel}
        </Button>
      )}

      {/* Spacer — pushes Filters & Refresh to the right on mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Search input — full-width row on mobile, inline on desktop */}
      <div className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder={searchPlaceholder ?? 'Buscar...'}
          value={searchValue}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          className="h-9 w-full pl-10 pr-20 sm:pr-24"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {searchValue && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter toggle */}
      <Button
        variant={showFilters ? 'secondary' : 'ghost'}
        onClick={onToggleFilters}
        className="relative shrink-0 gap-2"
      >
        <Filter className="h-4 w-4" />
        Filtros
        {(activeFilterCount ?? (hasActiveFilters ? 1 : 0)) > 0 && (
          <span className="ml-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
            {activeFilterCount ?? (hasActiveFilters ? '!' : 0)}
          </span>
        )}
      </Button>

      {/* Export */}
      {onExport && (
        <Button variant="ghost" size="icon" onClick={onExport} aria-label="Exportar a Excel">
          <Download className="h-4 w-4" />
        </Button>
      )}

      {/* Refresh */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="Refrescar datos"
      >
        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
      </Button>
    </div>
  );
}

export { ActionBar };
export type { ActionBarProps };
