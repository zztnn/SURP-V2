'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import * as React from 'react';

interface CrudFormQueryGateProps {
  /**
   * `false` when the form doesn't need backend data (e.g. `mode === "add"`).
   * Gate skips the loading/error branches and renders `children` directly.
   */
  active: boolean;
  /** TanStack Query-ish shape — only the two flags are read. */
  query: { isLoading: boolean; isError: boolean };
  /**
   * Lowercase entity label used in both messages:
   *   "Loading {entityLabel}…"
   *   'Failed to load {entityLabel} "{lookupCode}".'
   * E.g. `"currency"`, `"inventory location"`, `"price code"`.
   */
  entityLabel: string;
  /**
   * PK the form is trying to hydrate. Rendered in the error message when
   * present; omit for add/copy flows where there's no lookup yet.
   */
  lookupCode?: string;
  children: React.ReactNode;
}

/**
 * Centralized loading/error gate for CRUD form-contents.
 * Replaces the two identical early-returns every module used to declare:
 *
 * ```tsx
 * if ((mode === "edit" || mode === "view" || mode === "copy") && detailQuery.isLoading) {
 *   return <div className="...Loader2...">Loading {entity}…</div>;
 * }
 * if ((mode === "edit" || mode === "view" || mode === "copy") && detailQuery.isError) {
 *   return <div className="...AlertCircle...">Failed to load {entity} "...".</div>;
 * }
 * ```
 *
 * Usage:
 *
 * ```tsx
 * return (
 *   <CrudFormQueryGate
 *     active={mode !== "add"}
 *     query={detailQuery}
 *     entityLabel="currency"
 *     lookupCode={lookupCode}
 *   >
 *     <form>…</form>
 *   </CrudFormQueryGate>
 * );
 * ```
 *
 * The visual styles (`min-h-[200px]`, `text-destructive`, the icon sizes)
 * are owned by the gate — per-module overrides are unnecessary, and the
 * ad-hoc copies that used to live in each form-content drifted over time.
 */
export function CrudFormQueryGate({
  active,
  query,
  entityLabel,
  lookupCode,
  children,
}: CrudFormQueryGateProps): React.JSX.Element {
  if (active && query.isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {entityLabel}...
      </div>
    );
  }

  if (active && query.isError) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-5 w-5" />
        Failed to load {entityLabel}
        {lookupCode ? ` "${lookupCode}"` : ''}.
      </div>
    );
  }

  return <>{children}</>;
}
