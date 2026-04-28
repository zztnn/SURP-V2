'use client';

import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useVoidIncident } from '@/hooks/use-incidents';

export interface VoidIncidentTarget {
  externalId: string;
  correlativeCode: string | null;
}

interface VoidIncidentDialogProps {
  target: VoidIncidentTarget | null;
  onClose: () => void;
  onVoided?: (target: VoidIncidentTarget) => void;
}

const MIN_REASON_LENGTH = 10;

/**
 * Dialog reusable para anular un incidente con razón obligatoria.
 * Se abre cuando `target !== null`. El padre controla cuándo cerrarlo
 * (`onClose`) y opcionalmente reacciona al éxito vía `onVoided`.
 *
 * El correlativo se mantiene ocupado (no se libera el número) — invariante
 * del dominio implementado en `VoidIncidentUseCase`.
 */
export function VoidIncidentDialog({
  target,
  onClose,
  onVoided,
}: VoidIncidentDialogProps): ReactElement {
  const voidMutation = useVoidIncident();
  const [reasonDraft, setReasonDraft] = useState('');

  const handleConfirm = (): void => {
    if (!target) {
      return;
    }
    const reason = reasonDraft.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      toast.error(`La razón debe tener al menos ${MIN_REASON_LENGTH} caracteres`);
      return;
    }
    voidMutation.mutate(
      { externalId: target.externalId, voidReason: reason },
      {
        onSuccess: () => {
          toast.success(`Incidente ${target.correlativeCode ?? ''} anulado`);
          setReasonDraft('');
          onVoided?.(target);
          onClose();
        },
        onError: (e) => {
          toast.error(`No se pudo anular: ${e.message}`);
        },
      },
    );
  };

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      setReasonDraft('');
      onClose();
    }
  };

  return (
    <AlertDialog open={target !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular incidente</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `Vas a anular el incidente ${target.correlativeCode ?? ''}. El correlativo se mantiene ocupado (no se libera el número). La razón quedará registrada en el historial del informe.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="void-reason">Razón de anulación (mínimo 10 caracteres)</Label>
          <Textarea
            id="void-reason"
            value={reasonDraft}
            onChange={(e) => {
              setReasonDraft(e.target.value);
            }}
            rows={3}
            placeholder="Ej: Reporte duplicado, evento ya registrado en informe previo"
            disabled={voidMutation.isPending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={voidMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={voidMutation.isPending || reasonDraft.trim().length < MIN_REASON_LENGTH}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {voidMutation.isPending ? 'Anulando…' : 'Anular incidente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
