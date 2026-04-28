'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { ExportJobStatusResponse } from './use-incident-export';

interface UseDownloadOnDoneOptions {
  /** Solo dispara cuando el modal/host está abierto. */
  enabled: boolean;
  /** El estado actual del job. */
  data: ExportJobStatusResponse | undefined;
  /** Callback tras disparar la descarga (típicamente cierra el modal). */
  onCompleted: () => void;
}

const CLOSE_DELAY_MS = 1500;

/**
 * Cuando el status del export llega a `done` con `downloadUrl`, redirige
 * el browser a la URL firmada (descarga directa) y notifica al padre vía
 * `onCompleted` después de un delay corto para que el browser empiece la
 * descarga antes de que el modal cierre.
 *
 * Usa una `ref` interna para evitar disparar la descarga más de una vez
 * en el mismo job (puede haber re-renders después de que el modal cierra).
 *
 * Vive como hook en `src/hooks/**` para cumplir con USE-EFFECT-POLICY:
 * los componentes no usan `useEffect` directo; los hooks sí.
 */
export function useDownloadOnDone({ enabled, data, onCompleted }: UseDownloadOnDoneOptions): void {
  const triggeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || data === undefined) {
      return;
    }
    if (data.status !== 'done' || data.downloadUrl === null) {
      return;
    }
    if (triggeredFor.current === data.externalId) {
      return;
    }
    triggeredFor.current = data.externalId;
    window.location.href = data.downloadUrl;
    toast.success(`Export completado — ${String(data.rowsDone)} incidentes`);
    const timer = setTimeout(() => {
      onCompleted();
    }, CLOSE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [enabled, data, onCompleted]);
}
