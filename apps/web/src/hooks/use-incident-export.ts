'use client';

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

import type { IncidentListFilters } from '@/types/incidents';

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';

export interface ExportJobStatusResponse {
  externalId: string;
  status: ExportJobStatus;
  progress: number;
  totalRows: number | null;
  rowsDone: number;
  downloadUrl: string | null;
  filename: string | null;
  errorMessage: string | null;
  expiresAt: string;
}

interface CreateExportRequest {
  format: 'xlsx';
  zoneExternalId?: string;
  areaExternalId?: string;
  propertyExternalId?: string;
  semaforo?: string;
  occurredFrom?: string;
  occurredTo?: string;
  incidentTypeExternalIds?: readonly string[];
}

interface CreateExportResponse {
  externalId: string;
  status: 'queued';
}

/**
 * Mapea el `IncidentListFilters` del listado al body que espera el endpoint
 * `POST /incidents/exports`. Solo manda los campos definidos.
 */
export function buildExportRequest(filters: IncidentListFilters): CreateExportRequest {
  const req: CreateExportRequest = { format: 'xlsx' };
  if (filters.zoneExternalId !== undefined) {
    req.zoneExternalId = filters.zoneExternalId;
  }
  if (filters.areaExternalId !== undefined) {
    req.areaExternalId = filters.areaExternalId;
  }
  if (filters.propertyExternalId !== undefined) {
    req.propertyExternalId = filters.propertyExternalId;
  }
  if (filters.semaforo !== undefined) {
    req.semaforo = filters.semaforo;
  }
  if (filters.occurredFrom !== undefined) {
    req.occurredFrom = filters.occurredFrom;
  }
  if (filters.occurredTo !== undefined) {
    req.occurredTo = filters.occurredTo;
  }
  if (filters.incidentTypeExternalIds !== undefined && filters.incidentTypeExternalIds.length > 0) {
    req.incidentTypeExternalIds = filters.incidentTypeExternalIds;
  }
  return req;
}

export function useCreateIncidentExport(): UseMutationResult<
  CreateExportResponse,
  Error,
  CreateExportRequest
> {
  return useMutation<CreateExportResponse, Error, CreateExportRequest>({
    mutationFn: (body) => apiClient.post<CreateExportResponse>('/incidents/exports', body),
  });
}

/**
 * Polling del status. Refetch cada 1.5 s mientras `queued` o `running`;
 * detiene polling automáticamente cuando llega a un estado terminal.
 *
 * Pasar `externalId=null` deshabilita el query (cuando todavía no se
 * encoló el job).
 */
export function useIncidentExportStatus(
  externalId: string | null,
): UseQueryResult<ExportJobStatusResponse> {
  return useQuery<ExportJobStatusResponse>({
    queryKey: ['incidents', 'exports', externalId],
    queryFn: () => apiClient.get<ExportJobStatusResponse>(`/incidents/exports/${externalId ?? ''}`),
    enabled: externalId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return 1500;
      }
      if (data.status === 'queued' || data.status === 'running') {
        return 1500;
      }
      return false;
    },
    // Mientras se procesa NO queremos cache stale: cada poll trae el último estado.
    staleTime: 0,
    // Si el modal se cierra y reabre con el mismo jobId, re-fetch al instante.
    refetchOnMount: 'always',
  });
}
