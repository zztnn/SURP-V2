'use client';

import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface FiltersPanelProps {
  open: boolean;
  hasActiveFilters?: boolean;
  children: React.ReactNode;
  className?: string;
}

function FiltersPanel({
  open,
  hasActiveFilters,
  children,
  className,
}: FiltersPanelProps): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              'flex flex-col gap-3 rounded-md px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
              hasActiveFilters
                ? 'border-2 border-[hsl(var(--accent-blue)/0.5)] bg-[hsl(var(--accent-blue)/0.06)]'
                : 'border border-border',
              className,
            )}
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { FiltersPanel };
export type { FiltersPanelProps };
