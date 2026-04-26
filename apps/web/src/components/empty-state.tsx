import * as React from 'react';

import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-6 px-6 py-12 text-center md:px-8 md:py-16',
        className,
      )}
    >
      <Icon className="h-16 w-16 text-muted-foreground/50 md:h-20 md:w-20" />

      <div className="flex flex-col items-center gap-2">
        <h3 className="text-base font-medium text-foreground md:text-lg">{title}</h3>

        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
