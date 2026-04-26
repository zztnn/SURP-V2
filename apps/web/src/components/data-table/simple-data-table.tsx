'use client';

import * as React from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { DataTableProps } from '@/components/data-table/data-table';
import type { LucideIcon } from 'lucide-react';

interface SimpleDataTableProps<TData, TValue = unknown> extends Omit<
  DataTableProps<TData, TValue>,
  'stickyHeaderTop' | 'className'
> {
  isError?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string | undefined;
  emptyAction?: React.ReactNode;
  errorTitle?: string | undefined;
  errorDescription?: string | undefined;
  className?: string | undefined;
}

function SimpleDataTableInner<TData, TValue = unknown>({
  data,
  columns,
  isLoading = false,
  isError = false,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  errorTitle,
  errorDescription,
  onRowClick,
  compact,
  selectable,
  sorting,
  onSortingChange,
  manualSorting,
  activeRowIndex,
  getRowGroupKey,
  exitingRowKeys,
  getRowKey,
  skeletonRows,
  className,
}: SimpleDataTableProps<TData, TValue>): React.JSX.Element {
  const shell = cn(
    'overflow-clip rounded-md border',
    'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
    'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
    'border-black/[0.1]',
    '[box-shadow:0_2px_12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
    'dark:border-white/[0.1]',
    'dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]',
    className,
  );

  if (isError) {
    return (
      <div className={shell}>
        <EmptyState
          icon={emptyIcon}
          title={errorTitle ?? 'No se pudieron cargar los datos'}
          {...(errorDescription !== undefined
            ? { description: errorDescription }
            : { description: 'Ocurrió un error. Reintenta la operación.' })}
          action={
            onRetry ? (
              <Button variant="outline" onClick={onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (!isLoading && data.length === 0) {
    return (
      <div className={shell}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          {...(emptyDescription !== undefined ? { description: emptyDescription } : {})}
          {...(emptyAction !== undefined ? { action: emptyAction } : {})}
        />
      </div>
    );
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={isLoading}
      onRowClick={onRowClick}
      compact={compact}
      selectable={selectable}
      sorting={sorting}
      onSortingChange={onSortingChange}
      manualSorting={manualSorting}
      activeRowIndex={activeRowIndex}
      getRowGroupKey={getRowGroupKey}
      exitingRowKeys={exitingRowKeys}
      getRowKey={getRowKey}
      skeletonRows={skeletonRows}
      className={cn(
        'rounded-md border-0',
        'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
        'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
        '[box-shadow:0_2px_12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
        'dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]',
      )}
    />
  );
}

const SimpleDataTable = SimpleDataTableInner;

export { SimpleDataTable };
export type { SimpleDataTableProps };
