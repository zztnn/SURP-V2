'use client';

import { ChevronLeft, ChevronRight, FileSpreadsheet, LayoutGrid, List } from 'lucide-react';
import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatInteger } from '@/lib/locale-config';
import { cn } from '@/lib/utils';
import { useListPreferencesStore } from '@/stores/list-preferences-store';

type ViewMode = 'table' | 'cards';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemLabel?: string | undefined;
  compact?: boolean | undefined;
  onExportPdf?: (() => void) | undefined;
  onExportExcel?: (() => void) | undefined;
  /**
   * Button label for the Excel export action. Generic `"Excel"` is
   * banned — always pass a module-specific label following the gold-
   * standard pattern `"Export <Entity>"` (e.g. `"Export Prices"`,
   * `"Export Pieces"`). See `.ai-docs/skills/ADD-ASYNC-EXPORT.md`.
   */
  exportLabel?: string | undefined;
  /** Extra action buttons rendered after the export buttons. */
  extraActions?: React.ReactNode;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

function getVisiblePages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  pages.push(1);

  if (current > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('ellipsis');
  }

  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

const PaginationControls = React.forwardRef<HTMLDivElement, PaginationControlsProps>(
  function PaginationControls(
    {
      page,
      totalPages,
      onPageChange,
      totalItems,
      itemLabel = 'items',
      compact = false,
      onExportExcel,
      exportLabel,
      extraActions,
      className,
    },
    ref,
  ) {
    const viewMode = useListPreferencesStore((s) => s.viewMode);
    const pageSize = useListPreferencesStore((s) => s.pageSize);
    const setViewMode = useListPreferencesStore((s) => s.setViewMode);
    const setPageSize = useListPreferencesStore((s) => s.setPageSize);

    const visiblePages = getVisiblePages(page, totalPages);
    const hasExport = onExportExcel !== undefined;

    return (
      <div
        ref={ref}
        className={cn(
          'sticky top-0 z-20 border bg-card transition-[border-radius] duration-200 ease-out',
          compact ? 'rounded-t-none' : 'rounded-t-md',
          className,
        )}
      >
        <div className="flex flex-col gap-1.5 px-3 py-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
          {/* Row 1: View toggle + density + export */}
          <div className="flex items-center gap-1.5">
            {/* View toggle */}
            <div className="flex">
              <button
                onClick={() => {
                  setViewMode('cards');
                }}
                className={cn(
                  'flex h-9 min-w-[36px] items-center justify-center rounded-l-md border border-r-0 px-2 text-xs transition-colors',
                  viewMode === 'cards'
                    ? 'border-border bg-accent text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode('table');
                }}
                className={cn(
                  'flex h-9 min-w-[36px] items-center justify-center rounded-r-md border px-2 text-xs transition-colors',
                  viewMode === 'table'
                    ? 'border-border bg-accent text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-1 h-4 border-r border-border" />

            {/* Density selector */}
            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs text-muted-foreground sm:inline">Show</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                }}
              >
                <SelectTrigger className="h-7 w-[64px] rounded-md border-border bg-transparent px-2 text-xs shadow-none focus:shadow-none dark:bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export buttons */}
            {hasExport && (
              <>
                <div className="flex-1 sm:hidden" />
                <div className="mx-1 h-4 border-r border-border" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={onExportExcel}
                    className="flex h-9 min-w-[36px] items-center justify-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={exportLabel ?? 'Export Excel'}
                  >
                    <FileSpreadsheet className="h-4 w-4 text-[hsl(var(--accent-green))]" />
                    {exportLabel ?? 'Excel'}
                  </button>
                </div>
              </>
            )}

            {/* Extra action buttons */}
            {extraActions ? (
              <>
                {!hasExport && <div className="flex-1 sm:hidden" />}
                <div className="mx-1 h-4 border-r border-border" />
                <div className="flex items-center gap-1">{extraActions}</div>
              </>
            ) : null}
          </div>

          {/* Row 2: Record count + Page navigation */}
          <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatInteger(totalItems)} {itemLabel}
            </p>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => {
                  onPageChange(page - 1);
                }}
                disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* Mobile: compact page indicator */}
              <span className="px-1 text-xs text-muted-foreground sm:hidden">
                {page}/{totalPages}
              </span>

              {/* Desktop: page buttons */}
              <div className="hidden items-center gap-0.5 sm:flex">
                {visiblePages.map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => {
                        onPageChange(p);
                      }}
                      disabled={p === page}
                      className={cn(
                        'flex h-7 min-w-[28px] items-center justify-center rounded text-xs tabular-nums transition-colors',
                        p >= 1000 ? 'px-2' : p >= 100 ? 'px-1.5' : 'px-1',
                        p === page
                          ? 'pointer-events-none bg-primary font-medium text-primary-foreground'
                          : 'border border-border text-foreground hover:bg-accent',
                      )}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>

              <button
                onClick={() => {
                  onPageChange(page + 1);
                }}
                disabled={page >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export { PaginationControls, getVisiblePages, PAGE_SIZE_OPTIONS };
export type { PaginationControlsProps, ViewMode };
