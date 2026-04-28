'use client';

import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useDownloadOnDone } from '@/hooks/use-download-on-done';
import { useIncidentExportStatus } from '@/hooks/use-incident-export';

interface ExportIncidentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `externalId` del export job ya creado por el padre. NULL antes de que
   * la mutación de creación responda. La página llama a la mutación al
   * presionar el botón y le pasa el ID resultante a este modal.
   */
  jobExternalId: string | null;
  /** Mensaje de error si la mutación de creación falló (modal abierto pero sin ID). */
  createError?: string | null;
}

/**
 * Modal que muestra el progreso del export async y dispara la descarga
 * cuando termina. La creación del job vive en la página (la mutación se
 * dispara en el handler del botón); este componente solo polling +
 * UX. Patrón IWH adaptado al `USE-EFFECT-POLICY`:
 *   - El polling vive en `useIncidentExportStatus` (hook).
 *   - La auto-descarga al `done` se hace via `useDownloadOnDone` (hook),
 *     no via `useEffect` directo en el componente.
 */
export function ExportIncidentsModal({
  open,
  onOpenChange,
  jobExternalId,
  createError,
}: ExportIncidentsModalProps): ReactElement {
  const statusQuery = useIncidentExportStatus(open ? jobExternalId : null);

  useDownloadOnDone({
    enabled: open,
    data: statusQuery.data,
    onCompleted: () => {
      onOpenChange(false);
    },
  });

  const status =
    createError !== null && createError !== undefined
      ? 'failed'
      : (statusQuery.data?.status ?? (jobExternalId === null ? 'creating' : 'starting'));
  const progress = statusQuery.data?.progress ?? 0;
  const errorMessage = createError ?? statusQuery.data?.errorMessage ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar incidentes</DialogTitle>
          <DialogDescription>
            Generando archivo Excel con los filtros aplicados al listado. Podés cerrar este diálogo
            y volver a abrirlo más tarde — el export sigue en segundo plano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <StatusLine status={status} progress={progress} errorMessage={errorMessage} />
          {errorMessage === null ? <Progress value={progress} className="h-2" /> : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {status === 'done' || status === 'failed'
              ? 'Cerrar'
              : 'Cerrar (sigue en segundo plano)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StatusLineProps {
  status: string;
  progress: number;
  errorMessage: string | null;
}

function StatusLine({ status, progress, errorMessage }: StatusLineProps): ReactElement {
  if (status === 'failed') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">El export falló</p>
          <p className="text-xs">{errorMessage ?? 'Sin detalles'}</p>
        </div>
      </div>
    );
  }
  if (status === 'cancelled' || status === 'expired') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        <span>El export ya no está disponible.</span>
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
        <span>Export listo. Iniciando descarga…</span>
      </div>
    );
  }
  if (status === 'creating' || status === 'starting' || status === 'queued') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Encolando el export…</span>
      </div>
    );
  }
  // running
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Download className="h-4 w-4 animate-pulse" />
      <span>Procesando… {progress}%</span>
    </div>
  );
}
