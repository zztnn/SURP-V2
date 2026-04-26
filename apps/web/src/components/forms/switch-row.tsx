'use client';

import * as React from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * Row canónico para un campo booleano: label + descripción opcional +
 * `<Switch>` alineado a la derecha, en una fila enmarcada con tinte muted.
 *
 * Todo campo booleano (Sí/No) en un formulario CRUD debe usar este
 * componente. Renderizar un `<Switch>` "pelado" dentro de un flex row
 * custom rompe el ritmo visual del proyecto — el tamaño del switch, el
 * peso del label y el border-radius de `<SwitchRow>` son la convención
 * compartida.
 */
interface SwitchRowProps {
  /** Field name — mirrored to `data-field` for scroll-to-error + `Switch` id. */
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({
  name,
  label,
  description,
  checked,
  onChange,
  disabled,
}: SwitchRowProps): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
      data-field={name}
    >
      <div className="flex flex-col">
        <Label htmlFor={name} className="text-xs font-medium">
          {label}
        </Label>
        {description ? (
          <span className="text-[11px] text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <Switch id={name} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
