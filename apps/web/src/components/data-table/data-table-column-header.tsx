'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { Column } from '@tanstack/react-table';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): React.JSX.Element {
  // Align wrapped header text per the column's meta.align. Without this the
  // HTML <button> default (text-align: center) wins even for left/right
  // columns when the label wraps onto two lines.
  const align = column.columnDef.meta?.align;
  const textAlignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  // -ml-2 pulls the button so its text visually aligns with the 12px
  // column padding — only makes sense for left-aligned columns.
  const offsetClass = align === 'center' || align === 'right' ? '' : '-ml-2';

  if (!column.getCanSort()) {
    return (
      <div
        className={cn(
          'text-xs font-bold uppercase tracking-wider text-muted-foreground',
          textAlignClass,
          className,
        )}
      >
        {title}
      </div>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        // h-auto + min-h-7 so wrapped two-line labels aren't clipped.
        offsetClass,
        'h-auto min-h-7 gap-0.5 px-2 py-1 text-xs font-bold uppercase tracking-wider data-[state=open]:bg-accent',
        sorted ? 'text-primary dark:text-primary' : 'text-muted-foreground',
        className,
      )}
      onClick={() => {
        column.toggleSorting();
      }}
    >
      <span className={cn('whitespace-normal', textAlignClass)}>{title}</span>
      {sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3 shrink-0" />
      ) : sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3 shrink-0" />
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      )}
    </Button>
  );
}

export { DataTableColumnHeader };
export type { DataTableColumnHeaderProps };
