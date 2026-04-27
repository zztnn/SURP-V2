'use client';

import * as React from 'react';
import { useCallback } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { EntityCardsGrid } from '@/components/entity-cards-grid';
import { CardsSkeleton } from '@/components/loading-skeleton';
import { PaginationControls } from '@/components/pagination-controls';
import { Button } from '@/components/ui/button';
import { useResizeObserver } from '@/hooks/use-resize-observer';
import { useStickyCompact } from '@/hooks/use-sticky-compact';
import { exportToExcel } from '@/lib/export-excel';
import { exportToPdf } from '@/lib/export-pdf';
import { cn } from '@/lib/utils';
import { useListPreferencesStore } from '@/stores/list-preferences-store';

import type { ExportColumn } from '@/lib/export-pdf';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Export config                                                              */
/* -------------------------------------------------------------------------- */

interface ExportConfig<TData> {
  /** Document / sheet title */
  title: string;
  /** Download filename (without extension) */
  filename?: string | undefined;
  /** Column definitions for export */
  columns: ExportColumn[];
  /** Optional fetcher to export ALL data (ignoring pagination). Falls back to `data` prop. */
  fetchAllData?: (() => Promise<TData[]>) | undefined;
  /** Enable PDF export — defaults to true */
  pdf?: boolean | undefined;
  /** Enable Excel export — defaults to true */
  excel?: boolean | undefined;
  /** PDF orientation — defaults to "landscape" */
  orientation?: 'portrait' | 'landscape' | undefined;
  /** PDF page size — defaults to "a4" */
  pageSize?: 'a4' | 'letter' | undefined;
  /** Excel sheet name — defaults to "Data" */
  sheetName?: string | undefined;
}

/* -------------------------------------------------------------------------- */
/*  Component props                                                            */
/* -------------------------------------------------------------------------- */

interface DataListViewProps<TData, TValue> {
  data: TData[];
  isLoading: boolean;
  /**
   * Indica que hay un fetch en curso pero la lista YA tiene data previa
   * visible (refetch manual, cambio de filtros, cambio de página). Cuando
   * es `true` y `isLoading` es `false`, se renderiza una barra de progreso
   * indeterminada sobre la cabecera de la tabla y un overlay translúcido
   * sobre el cuerpo — la tabla NO se reemplaza por skeletons. El estándar
   * de listas: skeletons solo en la PRIMERA carga (sin data previa); en
   * cualquier refetch posterior se mantiene la tabla visible con overlay.
   */
  isFetching?: boolean | undefined;
  isError: boolean;
  onRetry: () => void;
  page: number;
  totalPages: number;
  totalItems: number;
  itemLabel?: string | undefined;
  onPageChange: (page: number) => void;
  columns: ColumnDef<TData, TValue>[];
  onRowClick?: ((row: TData) => void) | undefined;
  renderCard?: ((item: TData) => React.ReactNode) | undefined;
  /** Native export — pass config and buttons appear automatically */
  exportConfig?: ExportConfig<TData> | undefined;
  /** Manual override for PDF export (takes precedence over exportConfig) */
  onExportPdf?: (() => void) | undefined;
  /** Manual override for Excel export (takes precedence over exportConfig) */
  onExportExcel?: (() => void) | undefined;
  /**
   * Button label for the Excel export action. Always pass a module-
   * specific label following the gold-standard pattern `"Export <Entity>"`
   * (e.g. `"Export Prices"`). When omitted, the shared
   * `<PaginationControls>` falls back to the generic `"Excel"` for
   * backwards-compat with older modules, but new modules MUST set this.
   * See `.ai-docs/skills/ADD-ASYNC-EXPORT.md`.
   */
  exportLabel?: string | undefined;
  /** Extra action buttons rendered in the pagination controls bar. */
  extraActions?: React.ReactNode;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  errorTitle?: string | undefined;
  errorDescription?: string | undefined;
  /**
   * Show row selection checkboxes. Defaults to `false` (forwarded via the
   * underlying `<DataTable>`). Only enable on lists with true multi-row
   * batch actions — CRUD list pages use row-dropdown actions and do NOT
   * need checkboxes.
   */
  selectable?: boolean | undefined;
  /** Controlled sorting state (for server-side sorting). */
  sorting?: SortingState | undefined;
  /** Callback when sorting changes (for server-side sorting). */
  onSortingChange?: ((sorting: SortingState) => void) | undefined;
  /**
   * Opt-in persistent row highlight. Pass the row index of the currently-
   * open/selected record to render a subtle left-border + fill on that
   * row. The modern CRUD standard does NOT use this — the dockable panel
   * already communicates which row is open, and hover feedback handles
   * transient emphasis. Only set `activeRowIndex` when the layout has no
   * dockable panel above the list, or when a report-style enquiry needs
   * to echo the selection far from the clicked row.
   */
  activeRowIndex?: number | undefined;
  /** See `DataTableProps.getRowGroupKey`. Forwarded verbatim. */
  getRowGroupKey?: ((row: TData) => string | null) | undefined;
  /** See `DataTableProps.exitingRowKeys`. Forwarded verbatim. */
  exitingRowKeys?: ReadonlySet<string> | undefined;
  /** See `DataTableProps.getRowKey`. Forwarded verbatim. */
  getRowKey?: ((row: TData) => string) | undefined;
  /** See `DataTableProps.getRowStripeColor`. Forwarded verbatim. */
  getRowStripeColor?: ((row: TData) => string | null) | undefined;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function DataListViewInner<TData, TValue>({
  data,
  isLoading,
  isFetching,
  isError,
  onRetry,
  page,
  totalPages,
  totalItems,
  itemLabel,
  onPageChange,
  columns,
  onRowClick,
  renderCard,
  exportConfig,
  onExportPdf,
  onExportExcel,
  exportLabel,
  extraActions,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  errorTitle,
  errorDescription,
  selectable,
  sorting,
  onSortingChange,
  activeRowIndex,
  getRowGroupKey,
  exitingRowKeys,
  getRowKey,
  getRowStripeColor,
}: DataListViewProps<TData, TValue>): React.JSX.Element {
  const { sentinelRef, isCompact } = useStickyCompact();
  const viewMode = useListPreferencesStore((s) => s.viewMode);
  const pageSize = useListPreferencesStore((s) => s.pageSize);
  const paginationRef = React.useRef<HTMLDivElement>(null);
  const [paginationHeight, setPaginationHeight] = React.useState(0);

  useResizeObserver(paginationRef, (el) => {
    setPaginationHeight(el.offsetHeight);
  });

  /* ---- Built-in export handlers (from exportConfig) ---- */

  const builtInExportPdf = useCallback(async () => {
    if (!exportConfig) {
      return;
    }
    const exportData = exportConfig.fetchAllData ? await exportConfig.fetchAllData() : data;
    exportToPdf({
      title: exportConfig.title,
      columns: exportConfig.columns,
      data: exportData as Record<string, unknown>[],
      filename: exportConfig.filename,
      orientation: exportConfig.orientation,
      pageSize: exportConfig.pageSize,
    });
  }, [exportConfig, data]);

  const builtInExportExcel = useCallback(async () => {
    if (!exportConfig) {
      return;
    }
    const exportData = exportConfig.fetchAllData ? await exportConfig.fetchAllData() : data;
    await exportToExcel({
      title: exportConfig.title,
      columns: exportConfig.columns,
      data: exportData as Record<string, unknown>[],
      filename: exportConfig.filename,
      sheetName: exportConfig.sheetName,
    });
  }, [exportConfig, data]);

  /* ---- Resolve final handlers: manual override > exportConfig > none ---- */

  const pdfEnabled = exportConfig?.pdf !== false;
  const excelEnabled = exportConfig?.excel !== false;

  const handlePdf =
    onExportPdf ?? (exportConfig && pdfEnabled ? () => void builtInExportPdf() : undefined);
  const handleExcel =
    onExportExcel ?? (exportConfig && excelEnabled ? () => void builtInExportExcel() : undefined);

  /* ---- Render ---- */

  if (isError) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={errorTitle ?? 'Failed to load data'}
        description={errorDescription ?? 'An error occurred. Please try again.'}
        action={
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }

  if (data.length === 0 && !isLoading) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  // Overlay de refetch: solo cuando ya hay data visible y se dispara una
  // segunda carga (refetch manual, cambio de filtros, paginación). En la
  // primerísima carga `isLoading` es true → caemos en el path de skeletons
  // del DataTable / CardsSkeleton, sin overlay.
  const showRefetchOverlay = isFetching === true && !isLoading && data.length > 0;

  return (
    <div className="w-full">
      <div ref={sentinelRef} className="h-px" />
      <div
        className={cn(
          'relative w-full overflow-clip rounded-md border',
          // Gradient: card color → darker at bottom (3D depth)
          'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
          'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
          // Light: visible border + shadow + inset top highlight
          'border-black/[0.1]',
          '[box-shadow:0_2px_12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
          // Dark: lighter border + deep shadow + subtle top highlight
          'dark:border-white/[0.1]',
          'dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]',
        )}
      >
        {(totalItems > 0 || isLoading) && (
          <PaginationControls
            ref={paginationRef}
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            totalItems={totalItems}
            itemLabel={itemLabel}
            compact={isCompact}
            className="rounded-none border-0 border-b border-black/[0.08] dark:border-white/[0.06]"
            {...(handlePdf !== undefined ? { onExportPdf: handlePdf } : {})}
            {...(handleExcel !== undefined ? { onExportExcel: handleExcel } : {})}
            {...(exportLabel !== undefined ? { exportLabel } : {})}
            {...(extraActions ? { extraActions } : {})}
          />
        )}
        {viewMode === 'table' ? (
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            stickyHeaderTop={paginationHeight}
            compact={isCompact}
            onRowClick={onRowClick}
            selectable={selectable}
            sorting={sorting}
            onSortingChange={onSortingChange}
            manualSorting={sorting !== undefined}
            className="rounded-none border-0 bg-transparent"
            activeRowIndex={activeRowIndex}
            getRowGroupKey={getRowGroupKey}
            exitingRowKeys={exitingRowKeys}
            getRowKey={getRowKey}
            getRowStripeColor={getRowStripeColor}
          />
        ) : isLoading ? (
          <CardsSkeleton count={pageSize > 8 ? 8 : pageSize} />
        ) : (
          <EntityCardsGrid>{data.map((item) => renderCard?.(item))}</EntityCardsGrid>
        )}

        {/* Refetch overlay: barra indeterminada arriba + atenuación sutil
            sobre la zona de tabla/cards. La paginación queda interactiva
            (z-index inferior al sticky de PaginationControls=20). */}
        {showRefetchOverlay && (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
              aria-hidden
            >
              <div
                className="h-full w-1/3 bg-primary"
                style={{ animation: 'indeterminate-progress 1.2s ease-in-out infinite' }}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] bg-background/30 backdrop-blur-[1px]"
              style={{ top: paginationHeight }}
              aria-hidden
            />
          </>
        )}
      </div>
    </div>
  );
}

const DataListView = DataListViewInner;

export { DataListView };
export type { DataListViewProps, ExportConfig };
