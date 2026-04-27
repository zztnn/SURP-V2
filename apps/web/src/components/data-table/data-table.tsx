'use client';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ExpandedState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import * as React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { useResponsiveColumns } from '@/hooks/use-responsive-columns';
import { cn } from '@/lib/utils';

import '@/types/table';

interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean | undefined;
  onRowClick?: ((row: TData) => void) | undefined;
  skeletonRows?: number | undefined;
  stickyHeaderTop?: number | undefined;
  compact?: boolean | undefined;
  /**
   * Show row selection checkboxes. Defaults to `false`. Every CRUD list
   * page renders its actions via the row-dropdown or a dedicated column,
   * never via a multi-select header bar — enabling `selectable` is only
   * correct for lists with true multi-row batch actions.
   */
  selectable?: boolean | undefined;
  /** Controlled sorting state (for server-side sorting). */
  sorting?: SortingState | undefined;
  /** Callback when sorting changes (for server-side sorting). */
  onSortingChange?: ((sorting: SortingState) => void) | undefined;
  /** When true, disables client-side sorting (data is sorted by the server). */
  manualSorting?: boolean | undefined;
  /** Additional CSS classes for the outer wrapper. */
  className?: string | undefined;
  /**
   * Opt-in persistent row highlight (left border + subtle fill). The modern
   * CRUD pages pair a `<DockablePanel>` with the list and do NOT need this
   * — the open panel already identifies the row, and hover handles
   * transient emphasis. Only pass `activeRowIndex` on layouts without a
   * dockable panel over the list, or when a report-style enquiry needs to
   * echo the selection far from the clicked row.
   */
  activeRowIndex?: number | undefined;
  /**
   * Returns a stable key for the group a row belongs to (e.g. the order
   * number for held-order lines). When provided, hovering a row lights
   * up every sibling sharing the same key with a left rail + subtle
   * tint. Return `null` to opt a row out of grouping.
   */
  getRowGroupKey?: ((row: TData) => string | null) | undefined;
  /**
   * Opt-in row-exit animation. When a row's key (via `getRowKey`) is in
   * `exitingRowKeys`, the `<tr>` receives `data-exiting="true"` which
   * triggers the shared `row-exit` keyframe (fade + 8px slide left over
   * 220ms). The parent owns the lifecycle: populate the set when a row
   * is about to disappear, wait for the animation to finish, then remove
   * the row from `data`. Keep both props together — one without the
   * other is a no-op.
   */
  exitingRowKeys?: ReadonlySet<string> | undefined;
  getRowKey?: ((row: TData) => string) | undefined;
  /**
   * Returns a CSS color string (e.g. `"hsl(38 92% 55% / 0.8)"`) for the
   * permanent left-rail stripe on the first cell of a given row, or `null`
   * to show the default hover-only rail instead. Used by pages like Hold
   * Release to visually group multi-line orders with a cycling color.
   */
  getRowStripeColor?: ((row: TData) => string | null) | undefined;
}

function DataTable<TData, TValue = unknown>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  skeletonRows = 5,
  stickyHeaderTop,
  compact = false,
  selectable = false,
  sorting: externalSorting,
  onSortingChange: externalOnSortingChange,
  manualSorting = false,
  className,
  activeRowIndex,
  getRowGroupKey,
  exitingRowKeys,
  getRowKey,
  getRowStripeColor,
}: DataTableProps<TData, TValue>): React.JSX.Element {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const sorting = externalSorting ?? internalSorting;
  const handleSortingChange = React.useCallback(
    (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue;
      if (externalOnSortingChange) {
        externalOnSortingChange(next);
      } else {
        setInternalSorting(next);
      }
    },
    [sorting, externalOnSortingChange],
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [hiddenCount, setHiddenCount] = React.useState(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const tbodyRef = React.useRef<HTMLTableSectionElement | null>(null);

  // Group-hover highlighting via direct DOM manipulation — zero React re-renders.
  // Inline backgroundColor is set directly so the effect works even when the
  // CSS rule for tr[data-group-active] is not in the compiled stylesheet
  // (Turbopack may drop attribute-selector rules it doesn't see in JSX).
  const highlightGroup = React.useCallback((key: string | null) => {
    const tbody = tbodyRef.current;
    if (!tbody) {
      return;
    }
    tbody.querySelectorAll<HTMLElement>('[data-group-active]').forEach((el) => {
      el.removeAttribute('data-group-active');
      el.style.removeProperty('background-color');
    });
    if (key !== null) {
      tbody.querySelectorAll<HTMLElement>('[data-group-key]').forEach((el) => {
        if (el.dataset['groupKey'] === key) {
          el.setAttribute('data-group-active', 'true');
          el.style.backgroundColor = 'hsl(var(--primary) / 0.09)';
        }
      });
    }
  }, []);

  const responsiveKeys = React.useMemo(() => {
    const keys: string[] = [];
    for (const col of columns) {
      if (col.meta?.responsive) {
        const key = col.id ?? (col as { accessorKey?: string }).accessorKey;
        if (key) {
          keys.push(key);
        }
      }
    }
    return keys.reverse();
  }, [columns]);

  const columnVisibility = React.useMemo<VisibilityState>(() => {
    const vis: VisibilityState = {
      _expand: hiddenCount > 0 && responsiveKeys.length > 0,
    };
    for (let i = 0; i < responsiveKeys.length; i++) {
      const key = responsiveKeys[i];
      if (key) {
        vis[key] = i >= hiddenCount;
      }
    }
    return vis;
  }, [hiddenCount, responsiveKeys]);

  const expandColumn = React.useMemo<ColumnDef<TData, TValue>>(
    () => ({
      id: '_expand',
      size: 36,
      maxSize: 36,
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent"
          aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 text-primary transition-transform',
              row.getIsExpanded() && 'rotate-90',
            )}
          />
        </button>
      ),
    }),
    [],
  );

  const selectionColumn = React.useMemo<ColumnDef<TData, TValue>>(
    () => ({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(!!value);
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      maxSize: 40,
    }),
    [],
  );

  const allColumns = React.useMemo<ColumnDef<TData, TValue>[]>(
    () => (selectable ? [expandColumn, selectionColumn, ...columns] : [expandColumn, ...columns]),
    [expandColumn, selectionColumn, columns, selectable],
  );

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      rowSelection,
      expanded,
      columnVisibility,
    },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? { manualSorting: true } : { getSortedRowModel: getSortedRowModel() }),
    getExpandedRowModel: getExpandedRowModel(),
    enableRowSelection: selectable,
  });

  // Column size budgets for responsive calculation
  const responsiveSizes = React.useMemo(() => {
    const sizes: number[] = [];
    for (const col of columns) {
      if (col.meta?.responsive) {
        sizes.push(col.size ?? 150);
      }
    }
    return sizes;
  }, [columns]);

  const fixedColumnsWidth = React.useMemo(() => {
    // 36 = expand col, 52 = padding buffer per regular fixed col
    const COL_BUFFER = 52;
    let total = 36 + (selectable ? 40 : 0);
    for (const col of columns) {
      if (col.meta?.responsive) {
        continue;
      }
      if (col.meta?.flex) {
        // Flex columns: count at base size only (no buffer — they grow to fill)
        total += col.size ?? 150;
      } else if (col.meta?.stickyRight) {
        // Sticky columns: exact size, no buffer
        total += col.size ?? 50;
      } else {
        total += (col.size ?? 150) + COL_BUFFER;
      }
    }
    return total;
  }, [columns, selectable]);

  // Compute hiddenCount from container width vs column sizes, re-evaluate on resize
  useResponsiveColumns(
    wrapperRef,
    responsiveSizes,
    fixedColumnsWidth,
    setHiddenCount,
    setContainerWidth,
  );

  // Smart flex: distribute ONLY the leftover space after ALL visible columns fit
  const flexWidths = React.useMemo<Record<string, number>>(() => {
    if (containerWidth === 0) {
      return {};
    }

    const COL_BUFFER = 52;
    // Sum ALL visible columns at their base size (flex columns use their `size` as base)
    let allColumnsTotal = 36 + (selectable ? 40 : 0); // expand + select
    let flexTotal = 0;
    const flexCols: { key: string; size: number }[] = [];

    for (const col of columns) {
      const key = col.id ?? (col as { accessorKey?: string }).accessorKey ?? '';
      const isVisible = columnVisibility[key] !== false;
      if (!isVisible && col.meta?.responsive) {
        continue;
      }
      const size = col.size ?? 150;
      if (col.meta?.stickyRight) {
        allColumnsTotal += size;
      } else {
        allColumnsTotal += size + COL_BUFFER;
      }
      if (col.meta?.flex) {
        flexCols.push({ key, size });
        flexTotal += size;
      }
    }

    if (flexCols.length === 0 || flexTotal === 0) {
      return {};
    }

    // Only distribute the surplus AFTER all columns fit at their base size
    const surplus = containerWidth - allColumnsTotal;
    if (surplus <= 0) {
      // No surplus — flex columns stay at their base size
      const result: Record<string, number> = {};
      for (const fc of flexCols) {
        result[fc.key] = fc.size;
      }
      return result;
    }

    // Distribute surplus proportionally
    const result: Record<string, number> = {};
    for (const fc of flexCols) {
      const extra = Math.floor((fc.size / flexTotal) * surplus);
      result[fc.key] = fc.size + extra;
    }
    return result;
  }, [containerWidth, columns, selectable, columnVisibility]);

  const hiddenColumns = allColumns.filter((col) => {
    const key = col.id ?? (col as { accessorKey?: string }).accessorKey;
    return col.meta?.responsive && key && columnVisibility[key] === false;
  });

  return (
    <div
      ref={wrapperRef}
      data-debug-cw={containerWidth}
      data-debug-fixed={fixedColumnsWidth}
      data-debug-hidden={hiddenCount}
      className={cn('relative z-[1] w-full overflow-clip rounded-lg border bg-card', className)}
    >
      <Table>
        <TableHeader
          className={cn(
            'sticky z-20 transition-[top,backdrop-filter,background-color,box-shadow] duration-200 ease-out',
            compact
              ? 'bg-card/70 backdrop-blur-md shadow-[0_1px_0_0_var(--color-border),0_4px_12px_-2px_rgba(0,0,0,0.25)]'
              : 'bg-card shadow-[0_1px_0_0_var(--color-border)]',
          )}
          style={{ top: stickyHeaderTop ?? 0 }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{
                    ...(header.column.columnDef.meta?.shrink
                      ? { width: '1%' }
                      : header.column.columnDef.meta?.flex
                        ? { width: flexWidths[header.column.id] ?? header.getSize() }
                        : { width: header.getSize() }),
                    ...(header.column.columnDef.maxSize
                      ? { maxWidth: header.column.columnDef.maxSize }
                      : {}),
                    ...(header.column.columnDef.meta?.stickyRight
                      ? { position: 'sticky', right: 0, zIndex: 30 }
                      : {}),
                  }}
                  className={cn(
                    '!h-auto bg-card p-0 text-xs font-bold uppercase tracking-wider text-muted-foreground',
                    header.column.columnDef.meta?.shrink && 'whitespace-nowrap',
                    header.column.columnDef.meta?.stickyRight &&
                      'shadow-[-2px_0_4px_rgba(0,0,0,0.06)]',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center overflow-hidden transition-[height,transform] duration-200 ease-out',
                      // Alignment applies to BOTH the flex layout of the
                      // header cell AND the text-align of wrapped header
                      // text (the Button child defaults to text-align:center
                      // per the HTML <button> default, which breaks the
                      // contract for left/right columns when the label wraps
                      // onto multiple lines).
                      header.column.columnDef.meta?.align === 'right'
                        ? 'justify-end pl-1 pr-1 text-right'
                        : header.column.columnDef.meta?.align === 'center'
                          ? 'justify-center px-1 text-center'
                          : 'px-3 text-left',
                    )}
                    style={{
                      height: compact ? 32 : 40,
                      transform: compact ? 'scale(0.9)' : 'scale(1)',
                      transformOrigin: 'left center',
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody ref={tbodyRef}>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, rowIdx) => (
              <TableRow key={`skeleton-${rowIdx}`} className="border-b border-border/40">
                {table.getVisibleLeafColumns().map((col, colIdx) => (
                  <TableCell key={col.id} className="px-3 py-1 text-sm">
                    <Skeleton
                      className={cn('h-4', colIdx === 0 ? 'w-4' : 'w-full max-w-[120px]')}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row, rowIndex) => {
              const rowGroupKey = getRowGroupKey ? getRowGroupKey(row.original) : null;
              const exitKey = getRowKey ? getRowKey(row.original) : null;
              const isExiting = exitKey !== null && exitingRowKeys?.has(exitKey) === true;
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    data-group-key={rowGroupKey ?? undefined}
                    data-exiting={isExiting ? 'true' : undefined}
                    className={cn(
                      'group/row border-b border-border/40',
                      // Safari/WebKit does not paint `box-shadow` on <tr> — the
                      // left-rail indicator is painted by the first <td> below
                      // via group-hover/row. Keep background + transition on
                      // the row itself.
                      'transition-colors duration-[50ms] ease-in hover:bg-primary/[0.14] dark:hover:bg-primary/[0.12]',
                      '[&:not(:hover)]:duration-[150ms] [&:not(:hover)]:ease-out',
                      rowIndex % 2 === 1 && 'bg-muted/40 dark:bg-muted/15',
                      onRowClick && 'cursor-pointer',
                      activeRowIndex === rowIndex && 'bg-primary/[0.06] dark:bg-primary/[0.05]',
                    )}
                    onClick={() => onRowClick?.(row.original)}
                    onMouseEnter={
                      getRowGroupKey && rowGroupKey !== null
                        ? () => {
                            highlightGroup(rowGroupKey);
                          }
                        : undefined
                    }
                    onMouseLeave={
                      getRowGroupKey && rowGroupKey !== null
                        ? (e: React.MouseEvent) => {
                            // Only clear when leaving the group entirely — skip
                            // if the pointer moves to another row in the same group.
                            const related = (e.relatedTarget as Element | null)?.closest('tr');
                            if (related?.getAttribute('data-group-key') !== rowGroupKey) {
                              highlightGroup(null);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      // Stripe color for multi-group rows (e.g. multi-line orders).
                      // When set, it replaces the Tailwind hover-shadow classes on
                      // the first cell with a permanent inline box-shadow so the
                      // colour is stable rather than only visible on hover.
                      const stripeColor =
                        cellIndex === 0 && getRowStripeColor
                          ? getRowStripeColor(row.original)
                          : null;
                      return (
                        <TableCell
                          key={cell.id}
                          style={{
                            ...(cell.column.columnDef.meta?.shrink ? { width: '1%' } : {}),
                            ...(cell.column.columnDef.maxSize
                              ? { maxWidth: cell.column.columnDef.maxSize }
                              : {}),
                            ...(cell.column.columnDef.meta?.stickyRight
                              ? { position: 'sticky', right: 0, zIndex: 10 }
                              : {}),
                            ...(stripeColor !== null
                              ? { boxShadow: `inset 3px 0 0 ${stripeColor}` }
                              : {}),
                          }}
                          className={cn(
                            'px-3 py-1 text-xs',
                            cell.column.columnDef.meta?.align === 'right' && 'text-right',
                            // [&>svg]:mx-auto centers block-level SVG children
                            // (Lucide icons) that Tailwind's preflight sets to
                            // display:block — text-center alone does nothing on
                            // block children.
                            cell.column.columnDef.meta?.align === 'center' &&
                              'text-center [&>svg]:mx-auto',
                            cell.column.columnDef.meta?.shrink && 'whitespace-nowrap',
                            cell.column.columnDef.meta?.stickyRight &&
                              'bg-inherit !px-0 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] [&>*]:mx-auto',
                            // Left-rail hover/active indicator painted on the
                            // first cell instead of <tr> because Safari/WebKit
                            // does not render `box-shadow` on table-row elements.
                            // Skipped for striped rows — the inline style takes over.
                            cellIndex === 0 &&
                              stripeColor === null && [
                                'transition-shadow duration-[50ms] ease-in group-hover/row:shadow-[inset_3px_0_0_hsl(var(--primary))]',
                                'group-[:not(:hover)]/row:duration-[150ms] group-[:not(:hover)]/row:ease-out',
                                activeRowIndex === rowIndex &&
                                  'shadow-[inset_3px_0_0_hsl(var(--primary)/0.5)]',
                                // Persistent rail when the row is expanded so the
                                // connector L-shape stays visible without hovering.
                                row.getIsExpanded() && 'shadow-[inset_3px_0_0_hsl(var(--primary))]',
                              ],
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {row.getIsExpanded() && hiddenColumns.length > 0 && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="px-4 py-3 pl-6 shadow-[inset_3px_0_0_hsl(var(--primary)/0.35)]"
                      >
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          {row
                            .getAllCells()
                            .filter(
                              (cell) =>
                                cell.column.columnDef.meta?.responsive &&
                                !cell.column.getIsVisible(),
                            )
                            .map((cell) => {
                              const Icon = cell.column.columnDef.meta?.icon;
                              return (
                                <div key={cell.id} className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {Icon && <Icon className="h-3 w-3 text-primary/70" />}
                                    {cell.column.columnDef.meta?.label ?? cell.column.id}
                                  </span>
                                  <span className="text-sm [&_*]:!text-left">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center text-muted-foreground"
              >
                No results found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export { DataTable };
export type { DataTableProps };
