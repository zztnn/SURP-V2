'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay> & {
  ref?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  ref?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          // Mobile: bottom sheet style (iOS action sheet)
          'fixed inset-x-0 bottom-0 z-[10000] grid w-full gap-5 border-t px-6 pb-8 pt-6 sm:gap-4 sm:p-6',
          'rounded-t-2xl',
          'duration-200 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          // Desktop: centered modal
          'sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border sm:border-t',
          'sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0',
          'sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
          // 3D depth: gradient, custom border, inset top highlight
          'bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_4%))]',
          'dark:bg-[linear-gradient(to_bottom,var(--color-card),color-mix(in_srgb,var(--color-card),black_14%))]',
          'border-black/[0.1]',
          '[box-shadow:0_4px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.08),inset_1px_0_0_rgba(255,255,255,0.25),inset_-1px_0_0_rgba(0,0,0,0.04)]',
          'dark:border-white/[0.1]',
          'dark:[box-shadow:0_8px_48px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),inset_1px_0_0_rgba(255,255,255,0.05),inset_-1px_0_0_rgba(0,0,0,0.2)]',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title> & {
  ref?: React.Ref<HTMLHeadingElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description> & {
  ref?: React.Ref<HTMLParagraphElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  ref?: React.Ref<HTMLButtonElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(buttonVariants(), 'h-12 text-base sm:h-9 sm:text-sm', className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
  ref?: React.Ref<HTMLButtonElement>;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'h-12 text-base sm:h-9 sm:text-sm sm:mt-0',
        className,
      )}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
