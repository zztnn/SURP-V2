import * as React from 'react';

/**
 * Pill compartido para marcar un campo como obligatorio junto a su label.
 * Usar en todos los labels de inputs requeridos — nunca el patrón del
 * asterisco rojo `*` (demasiado discreto y poco accesible).
 *
 * Ejemplo:
 *   <Label className="flex items-center ...">
 *     Código de producto
 *     <RequiredBadge />
 *   </Label>
 */
export function RequiredBadge(): React.JSX.Element {
  return (
    <span className="ml-1.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-destructive">
      obligatorio
    </span>
  );
}
