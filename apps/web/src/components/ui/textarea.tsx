import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({
  className,
  ref,
  ...props
}: React.ComponentProps<'textarea'> & { ref?: React.Ref<HTMLTextAreaElement> }): React.JSX.Element {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-muted-foreground hover:bg-muted hover:border-ring/50 focus:border-primary focus:shadow-[0_0_0_1px_hsl(var(--primary))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Textarea };
