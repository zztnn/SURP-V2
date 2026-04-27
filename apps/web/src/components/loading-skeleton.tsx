import * as React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  TableSkeleton                                                             */
/* -------------------------------------------------------------------------- */

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

function TableSkeleton({ rows = 5, cols = 4, className }: TableSkeletonProps): React.JSX.Element {
  return (
    <div className={cn('rounded-md border', className)}>
      <div className="overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b">
              {Array.from({ length: cols }).map((_, i) => (
                <th
                  key={i}
                  className="h-10 px-2 text-left align-middle font-medium text-muted-foreground"
                >
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b">
                {Array.from({ length: cols }).map((_, colIdx) => (
                  <td key={colIdx} className="p-2 align-middle">
                    <Skeleton className={cn('h-4', colIdx === 0 ? 'w-32' : 'w-24')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  CardsSkeleton                                                             */
/* -------------------------------------------------------------------------- */

interface CardsSkeletonProps {
  count?: number;
  className?: string;
}

function CardsSkeleton({ count = 8, className }: CardsSkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  PageSkeleton                                                              */
/* -------------------------------------------------------------------------- */

interface PageSkeletonProps {
  className?: string;
}

function PageSkeleton({ className }: PageSkeletonProps): React.JSX.Element {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Filters / toolbar row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* Content area */}
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}

export { TableSkeleton, CardsSkeleton, PageSkeleton };
export type { TableSkeletonProps, CardsSkeletonProps, PageSkeletonProps };
