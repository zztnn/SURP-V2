'use client';

import * as React from 'react';

/**
 * Footer canónico para formularios CRUD de detalle: pone el `<SwitchRow>`
 * de "Activo" (izquierda) junto al botón `<AuditTrail variant="panel">`
 * (derecha) en una sola línea horizontal, ahorrando espacio vertical.
 *
 * Se oculta automáticamente en los modos `add` y `copy` — ambos controles
 * carecen de sentido ahí:
 *   - `Activo` por defecto es `true` en registros nuevos, sin affordance.
 *   - `Auditoría` requiere un registro existente.
 *
 * En viewports < `sm` (640px) los controles apilan verticalmente (Activo
 * arriba, Auditoría debajo) para que cada uno use todo el ancho.
 *
 * Usage:
 * ```tsx
 * <ActiveAuditFooterRow
 *   mode={mode}
 *   active={
 *     <Controller
 *       control={control}
 *       name="active"
 *       render={({ field }) => (
 *         <SwitchRow
 *           name="active"
 *           label="Active"
 *           description="Record status (Yes/No)"
 *           checked={field.value ?? true}
 *           onChange={field.onChange}
 *           disabled={readOnly}
 *         />
 *       )}
 *     />
 *   }
 *   auditTrail={
 *     <AuditTrail variant="panel" panelId={...} {...} />
 *   }
 * />
 * ```
 */
export type ActiveAuditFooterMode = 'view' | 'add' | 'edit' | 'copy';

interface ActiveAuditFooterRowProps {
  mode: ActiveAuditFooterMode;
  active: React.ReactNode;
  auditTrail: React.ReactNode;
}

export function ActiveAuditFooterRow({
  mode,
  active,
  auditTrail,
}: ActiveAuditFooterRowProps): React.JSX.Element | null {
  if (mode === 'add' || mode === 'copy') {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="sm:flex-1">{active}</div>
      <div className="sm:shrink-0">{auditTrail}</div>
    </div>
  );
}
