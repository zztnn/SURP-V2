'use client';

import { CalendarPlus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Componente canónico para el textarea de "Notas" / observaciones en
 * formularios. Contrato visual:
 *  - Header: label "Notas" a la izquierda, botón "Agregar timestamp"
 *    (ghost) a la derecha (solo en modo edición y cuando se pasa
 *    `onDateStamp`).
 *  - Textarea: `rows={6}` por defecto, `resize-y`, `text-xs`, con
 *    `maxLength` (3000 por defecto — ajustar según la columna en BD).
 *  - Footer: contador `N / maxLength` en tabular-nums.
 *  - Contenedor: envuelto con `data-field="notes"` para que el helper
 *    scroll-to-error pueda enfocarlo en validación fallida.
 *
 * Es agnóstico al origen del valor — pasar `value`+`onChange` desde RHF
 * Controller, register+watch o useState plano.
 */
export interface NotesFieldProps {
  /** Current value — feeds both the textarea and the character counter. */
  value: string;
  /** Called on every keystroke with the next string. */
  onChange: (next: string) => void;
  /**
   * Nombre visible de la entidad para el placeholder (ej. "producto",
   * "proveedor", "obra"). El placeholder renderizado es
   * `"Notas sobre este/esta {entityName}..."`.
   */
  entityName: string;
  /**
   * When provided AND `readOnly === false`, renders the "Add Date
   * Stamp" button. Pair with the `useNotesDateStamp` hook for the
   * canonical prepend-timestamp behaviour.
   */
  onDateStamp?: (() => void) | undefined;
  /**
   * Disables the textarea + hides the date-stamp button. Used for view
   * modes AND locked edit mode (no lock acquired yet). Defaults to
   * false.
   */
  readOnly?: boolean | undefined;
  /** Optional HTML id on the textarea (default: `"notes"`). */
  id?: string | undefined;
  /** Largo máximo — 3000 por defecto. Ajustar según columna de BD. */
  maxLength?: number | undefined;
  /** Filas visibles — default 6 (tamaño canónico). */
  rows?: number | undefined;
  /** Inline validation error string (e.g. from RHF `errors.notes?.message`). */
  error?: string | undefined;
  /**
   * Forwarded to the underlying `<textarea>`. Pass the same ref to
   * `useNotesDateStamp({ textareaRef })` so the stamp handler can
   * focus + position the caret after inserting.
   */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null> | undefined;
}

export function NotesField({
  value,
  onChange,
  entityName,
  onDateStamp,
  readOnly = false,
  id = 'notes',
  maxLength = 3000,
  rows = 6,
  error,
  textareaRef,
}: NotesFieldProps): React.JSX.Element {
  const showDateStamp = !readOnly && onDateStamp !== undefined;

  return (
    <div className="space-y-1.5" data-field="notes">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium">
          Notas
        </Label>
        {showDateStamp ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onDateStamp}
            title="Insertar timestamp"
          >
            <CalendarPlus className="mr-1 h-3 w-3" />
            Agregar timestamp
          </Button>
        ) : null}
      </div>
      <Textarea
        // Conditional spread keeps the ref prop strictly typed under
        // `exactOptionalPropertyTypes` — passing `undefined` to the base
        // shadcn `Textarea` would violate its `ref?: Ref<HTMLTextAreaElement>` shape.
        {...(textareaRef ? { ref: textareaRef } : {})}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        maxLength={maxLength}
        rows={rows}
        placeholder={`Notas sobre este/esta ${entityName}...`}
        className="resize-y text-xs"
        disabled={readOnly}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
