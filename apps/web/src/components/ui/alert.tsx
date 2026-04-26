import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border-l-4 border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default:
          'border-border border-l-foreground/40 bg-muted/50 text-foreground [&>svg]:text-foreground',
        destructive:
          'border-[hsl(var(--destructive)/0.2)] border-l-destructive bg-[hsl(var(--destructive)/0.06)] text-destructive [&>svg]:text-destructive',
        success:
          'border-[hsl(var(--success)/0.2)] border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)] text-[hsl(var(--success))] [&>svg]:text-[hsl(var(--success))]',
        warning:
          'border-[hsl(var(--warning)/0.2)] border-l-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))] [&>svg]:text-[hsl(var(--warning))]',
        info: 'border-[hsl(var(--info)/0.2)] border-l-[hsl(var(--info))] bg-[hsl(var(--info)/0.06)] text-[hsl(var(--info))] [&>svg]:text-[hsl(var(--info))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ref,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof alertVariants> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

function AlertTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<'h5'> & { ref?: React.Ref<HTMLHeadingElement> }): React.JSX.Element {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
