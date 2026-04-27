'use client';

import { Filter, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface ActiveFiltersBarProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

function ActiveFiltersBar({
  filters,
  onRemove,
  onClearAll,
  className,
}: ActiveFiltersBarProps): React.JSX.Element | null {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 p-2',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {filters.length} {filters.length === 1 ? 'filtro activo' : 'filtros activos'}
        </span>
        {filters.map((filter) => (
          <span
            key={filter.key}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {filter.label}: {filter.value}
            <button
              type="button"
              onClick={() => {
                onRemove(filter.key);
              }}
              className="rounded-sm p-1.5 -m-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Quitar filtro ${filter.label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClearAll}
        className="h-7 px-2 text-xs uppercase"
      >
        Limpiar
      </Button>
    </div>
  );
}

export { ActiveFiltersBar };
export type { ActiveFiltersBarProps, ActiveFilter };
