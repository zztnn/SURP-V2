import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<'input'> & { ref?: React.Ref<HTMLInputElement> }): React.JSX.Element {
  return (
    <input
      type={type}
      autoComplete="off"
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:bg-muted hover:border-ring/50 focus:border-primary focus:shadow-[0_0_0_1px_hsl(var(--primary))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Input };
