'use client';

import Link from 'next/link';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

/**
 * Shared inline action cluster for list-page action columns.
 *
 * Reemplaza el patrón ad-hoc `<div className="flex items-center gap-X
 * opacity-80 transition-opacity group-hover/row:opacity-100">` +
 * `<Tooltip><button>` que se duplicaba a lo largo de los módulos donde
 * aparece un cluster de íconos de acciones junto a cada fila.
 *
 * The cluster owns the opacity fade (80% at rest, 100% on row-hover via
 * the `group/row` token applied by <DataTable>'s <TableRow>), the gap,
 * and the transition timing. Each `<InlineAction>` child owns its own
 * tooltip wiring, 4 variants (default / warning / locked / disabled),
 * and renders as a `<button>`, a `<Link>`, or a non-interactive `<span>`
 * depending on the props passed.
 *
 * Keeping this as one shared component means visual tuning (opacity,
 * gap, hover colors) happens in one place — new list pages inherit the
 * same look for free.
 */

// ---------------------------------------------------------------------------
// Size context — propagates from cluster to every child action
// ---------------------------------------------------------------------------

type InlineActionSize = 'sm' | 'md';

const SizeContext = React.createContext<InlineActionSize>('sm');

function sizeClasses(size: InlineActionSize): { button: string; icon: string } {
  if (size === 'md') {
    return { button: 'h-7 w-7', icon: 'h-3.5 w-3.5' };
  }
  return { button: 'h-6 w-6', icon: 'h-3 w-3' };
}

// ---------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------

interface InlineActionClusterProps {
  children: React.ReactNode;
  /**
   * Button + icon size. `"sm"` (24×24 button / 12×12 icon) is the dense
   * default para listas CRUD densas; `"md"` (28×28 / 14×14) conviene
   * en layouts con más espacio.
   */
  size?: InlineActionSize;
  /**
   * Tailwind gap token (maps to `gap-{value}`). Defaults to `1` (4px).
   * Use `0.5` (2px) for very dense lists (Product Master).
   */
  gap?: 0 | 0.5 | 1 | 1.5 | 2;
  className?: string;
}

function gapClass(gap: InlineActionClusterProps['gap']): string {
  switch (gap) {
    case 0:
      return 'gap-0';
    case 0.5:
      return 'gap-0.5';
    case 1.5:
      return 'gap-1.5';
    case 2:
      return 'gap-2';
    case 1:
    default:
      return 'gap-1';
  }
}

function InlineActionCluster({
  children,
  size = 'sm',
  gap = 1,
  className,
}: InlineActionClusterProps): React.JSX.Element {
  return (
    <SizeContext.Provider value={size}>
      <div
        className={cn(
          'flex items-center opacity-80 transition-opacity duration-200 group-hover/row:opacity-100',
          gapClass(gap),
          className,
        )}
      >
        {children}
      </div>
    </SizeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

type InlineActionVariant = 'default' | 'warning' | 'locked' | 'destructive';

interface InlineActionProps {
  icon: LucideIcon;
  /**
   * Tooltip text — also drives `aria-label` so the button is accessible
   * without a visible label.
   */
  label: React.ReactNode;
  /**
   * Click handler. Mutually exclusive with `href`. Omit both when
   * rendering a purely informational icon (use `variant="locked"`).
   */
  onClick?: ((event: React.MouseEvent) => void) | undefined;
  /**
   * Render as a Next.js `<Link>` pointing to `href`. Useful for edit
   * buttons that link to a dedicated detail page.
   */
  href?: string | undefined;
  /**
   * Greys out the button, removes hover effects, and short-circuits the
   * click handler. Prefer `variant="locked"` when the icon IS a lock
   * indicator (different semantics + colour).
   */
  disabled?: boolean | undefined;
  /**
   * Visual variant:
   * - `default`: muted icon, primary-colored hover (the common case).
   * - `warning`: warning-colored icon + warning-tinted hover (useful
   *   when the action is still clickable but carries risk — e.g. "View
   *   lock held by another user").
   * - `destructive`: dim red at rest (60% opacity), full red + matching
   *   ring on hover. Use for Delete / Remove affordances.
   * - `locked`: renders as a non-interactive `<span>` with warning /
   *   muted color and `cursor-not-allowed`. Used when the icon is a
   *   status indicator, not an action (e.g. a lock icon that just says
   *   "this row is locked, you cannot interact with it").
   */
  variant?: InlineActionVariant | undefined;
  /**
   * When true, wraps `onClick` with `event.stopPropagation()` so the
   * row's own `onRowClick` handler doesn't fire when the user clicks
   * the action button. Default: `true` (the overwhelming majority of
   * list rows have a row-click handler).
   */
  stopPropagation?: boolean | undefined;
}

function InlineAction({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  variant = 'default',
  stopPropagation = true,
}: InlineActionProps): React.JSX.Element {
  const size = React.useContext(SizeContext);
  const { button: buttonSize, icon: iconSize } = sizeClasses(size);

  // `ring` (box-shadow-based outline) rather than `border` because the
  // global `* { border-color: hsl(var(--border)) }` selector in
  // globals.css is unlayered and wins the cascade against Tailwind's
  // `border-transparent` utility — a border would always render grey.
  // `ring` doesn't use border-color, so it isn't affected. It also
  // doesn't push layout around (it's a box-shadow outside the box).
  const base = cn(
    'flex items-center justify-center rounded-md transition-all duration-200',
    buttonSize,
  );

  const interactiveClasses = cn(
    base,
    'cursor-pointer',
    variant === 'warning'
      ? 'text-[hsl(var(--warning))] hover:scale-110 hover:ring-1 hover:ring-[hsl(var(--warning))]'
      : variant === 'destructive'
        ? 'text-destructive/60 hover:scale-110 hover:text-destructive hover:ring-1 hover:ring-destructive'
        : 'text-muted-foreground hover:scale-110 hover:ring-1 hover:ring-primary hover:text-primary',
    disabled &&
      'cursor-default text-muted-foreground/30 hover:scale-100 hover:ring-0 hover:text-muted-foreground/30',
  );

  const lockedClasses = cn(
    base,
    'cursor-not-allowed',
    variant === 'locked' ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground/30',
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent): void => {
      if (stopPropagation) {
        event.stopPropagation();
      }
      if (disabled) {
        return;
      }
      onClick?.(event);
    },
    [disabled, onClick, stopPropagation],
  );

  let trigger: React.ReactNode;
  if (variant === 'locked') {
    trigger = (
      <span className={lockedClasses} aria-disabled="true">
        <Icon className={iconSize} />
      </span>
    );
  } else if (href !== undefined && !disabled) {
    trigger = (
      <Link
        href={href}
        aria-label={typeof label === 'string' ? label : undefined}
        className={interactiveClasses}
        {...(stopPropagation
          ? {
              onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
                e.stopPropagation();
              },
            }
          : {})}
      >
        <Icon className={iconSize} />
      </Link>
    );
  } else {
    trigger = (
      <button
        type="button"
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        className={interactiveClasses}
        onClick={handleClick}
      >
        <Icon className={iconSize} />
      </button>
    );
  }

  return (
    <Tooltip delayDuration={1500}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent sideOffset={14}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { InlineActionCluster, InlineAction };
export type { InlineActionVariant, InlineActionSize };
