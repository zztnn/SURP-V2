import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border text-card-foreground',
        // 3D depth: gradient, custom border, inset top highlight
        'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
        'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
        'border-black/[0.1]',
        '[box-shadow:0_2px_12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
        'dark:border-white/[0.1]',
        'dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

function CardTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return (
    <div
      ref={ref}
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardContent({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
}

function CardFooter({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }): React.JSX.Element {
  return <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
