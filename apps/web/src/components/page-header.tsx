'use client';

import * as React from 'react';
import { useRef } from 'react';

import { usePageHeaderObserver } from '@/hooks/use-page-header-observer';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}

function PageHeader({
  icon: Icon,
  title,
  description,
  children,
  className,
}: PageHeaderProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  usePageHeaderObserver(ref, Icon, title);

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export { PageHeader };
export type { PageHeaderProps };
