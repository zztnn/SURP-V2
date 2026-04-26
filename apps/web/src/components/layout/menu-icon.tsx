'use client';

import * as Icons from 'lucide-react';
import { createElement } from 'react';

import type { LucideIcon } from 'lucide-react';

interface MenuIconProps {
  name?: string | null | undefined;
  className?: string;
}

const FALLBACK = Icons.Circle;

function resolve(name?: string | null): LucideIcon {
  if (!name) {
    return FALLBACK;
  }
  const map = Icons as unknown as Record<string, LucideIcon | undefined>;
  return map[name] ?? FALLBACK;
}

export function MenuIcon({ name, className }: MenuIconProps): React.ReactElement {
  const icon = resolve(name);
  return createElement(icon, {
    className: className ?? 'h-4 w-4',
    'aria-hidden': true,
  });
}
