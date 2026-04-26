import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({
  className,
  ref,
  ...props
}: React.ComponentProps<'table'> & { ref?: React.Ref<HTMLTableElement> }): React.JSX.Element {
  return (
    <div className="relative w-full">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

function TableHeader({
  className,
  ref,
  ...props
}: React.ComponentProps<'thead'> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}): React.JSX.Element {
  return <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({
  className,
  ref,
  ...props
}: React.ComponentProps<'tbody'> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}): React.JSX.Element {
  return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({
  className,
  ref,
  ...props
}: React.ComponentProps<'tfoot'> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}): React.JSX.Element {
  return (
    <tfoot
      ref={ref}
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({
  className,
  ref,
  ...props
}: React.ComponentProps<'tr'> & { ref?: React.Ref<HTMLTableRowElement> }): React.JSX.Element {
  return (
    <tr
      ref={ref}
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  ref,
  ...props
}: React.ComponentProps<'th'> & { ref?: React.Ref<HTMLTableCellElement> }): React.JSX.Element {
  return (
    <th
      ref={ref}
      className={cn(
        'h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  ref,
  ...props
}: React.ComponentProps<'td'> & { ref?: React.Ref<HTMLTableCellElement> }): React.JSX.Element {
  return (
    <td
      ref={ref}
      className={cn(
        'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ref,
  ...props
}: React.ComponentProps<'caption'> & { ref?: React.Ref<HTMLElement> }): React.JSX.Element {
  return (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
