'use client';

import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { RequiredBadge } from '@/components/forms/required-badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Wrapper canónico para un campo de formulario: label + pill de obligatorio
 * + control + error. Todo input editable en un form CRUD debe usarlo para:
 *  - tener `data-field` (usado por el helper scroll-to-error para enfocar
 *    el primer campo con error en un submit fallido),
 *  - renderizar `<RequiredBadge />` en vez de asterisco,
 *  - mantener el ritmo vertical consistente (`space-y-1.5`, label `text-xs`,
 *    error `text-[11px]`).
 */
interface FieldWrapperProps {
  /** Field name — mirrored to `data-field` for scroll-to-error and as the label `htmlFor`. */
  name: string;
  label: string;
  error?: string | undefined;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FieldWrapper({
  name,
  label,
  error,
  required,
  children,
  className,
}: FieldWrapperProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)} data-field={name}>
      <Label htmlFor={name} className="flex items-center text-xs">
        {label}
        {required ? <RequiredBadge /> : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
