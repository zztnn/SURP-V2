'use client';

import { Ban, Eye, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { InlineAction, InlineActionCluster } from '@/components/data-table/inline-action-cluster';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffectiveActionMenuStyle } from '@/hooks/use-effective-action-menu-style';

import type { IncidentListItem } from '@/types/incidents';

interface IncidentRowActionsProps {
  incident: IncidentListItem;
  onVoid: (incident: IncidentListItem) => void;
}

/**
 * Acciones de fila para `<DataTable>` de incidentes. Renderiza dos
 * variantes según `useEffectiveActionMenuStyle()`:
 *
 *   - `inline`: cluster de íconos (Ver, Anular). Aparece dim y se
 *     ilumina al hover de la fila.
 *   - `dropdown`: trigger `⋯` que abre menú contextual. Útil en
 *     viewports angostos (forzado bajo 1024 px) o cuando el usuario
 *     prefiere el estilo compacto.
 *
 * Solo se puede anular un incidente en estado `active`. Draft (no
 * sincronizado) y voided (ya anulado) deshabilitan la acción.
 */
export function IncidentRowActions({
  incident,
  onVoid,
}: IncidentRowActionsProps): React.JSX.Element {
  const router = useRouter();
  const style = useEffectiveActionMenuStyle();

  const canVoid = incident.state === 'active';

  const handleView = React.useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      router.push(`/incidents/${incident.externalId}`);
    },
    [router, incident.externalId],
  );

  const handleVoid = React.useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      onVoid(incident);
    },
    [onVoid, incident],
  );

  if (style === 'inline') {
    return (
      <InlineActionCluster size="md">
        <InlineAction
          icon={Eye}
          label={`Ver ${incident.correlativeCode ?? incident.externalId}`}
          onClick={handleView}
        />
        <InlineAction
          icon={Ban}
          label={canVoid ? 'Anular incidente' : 'No se puede anular en este estado'}
          variant="destructive"
          disabled={!canVoid}
          onClick={handleVoid}
        />
      </InlineActionCluster>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones para ${incident.correlativeCode ?? incident.externalId}`}
          className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary hover:shadow-md"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleView}>
          <Eye className="mr-2 h-4 w-4" /> Ver detalle
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleVoid}
          disabled={!canVoid}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Ban className="mr-2 h-4 w-4" /> Anular
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
