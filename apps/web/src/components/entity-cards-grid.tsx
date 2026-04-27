import * as React from 'react';

import { cn } from '@/lib/utils';

interface EntityCardsGridProps {
  children: React.ReactNode;
  className?: string;
}

function EntityCardsGrid({ children, className }: EntityCardsGridProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 md:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { EntityCardsGrid };
export type { EntityCardsGridProps };
