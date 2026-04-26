'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ref,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  ref?: React.Ref<HTMLDivElement>;
  container?: HTMLElement | null;
}): React.JSX.Element {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[9000] w-72 rounded-md border p-4 text-popover-foreground outline-none',
          // 3D depth: gradient, custom border, inset top highlight
          'bg-[linear-gradient(to_bottom,var(--color-popover),color-mix(in_srgb,var(--color-popover),black_4%))]',
          'dark:bg-[linear-gradient(to_bottom,var(--color-popover),color-mix(in_srgb,var(--color-popover),black_14%))]',
          'border-black/[0.1]',
          '[box-shadow:0_4px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.08),inset_1px_0_0_rgba(255,255,255,0.25),inset_-1px_0_0_rgba(0,0,0,0.04)]',
          'dark:border-white/[0.1]',
          'dark:[box-shadow:0_8px_48px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),inset_1px_0_0_rgba(255,255,255,0.05),inset_-1px_0_0_rgba(0,0,0,0.2)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
