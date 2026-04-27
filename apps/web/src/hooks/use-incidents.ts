'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

import type {
  CatalogArea,
  CatalogIncidentType,
  CatalogProperty,
  CatalogZone,
  IncidentDetail,
  IncidentListFilters,
  IncidentListResponse,
} from '@/types/incidents';

function buildIncidentsQuery(f: IncidentListFilters): string {
  const params = new URLSearchParams();
  if (f.page !== undefined) {
    params.set('page', String(f.page));
  }
  if (f.pageSize !== undefined) {
    params.set('pageSize', String(f.pageSize));
  }
  if (f.zoneExternalId !== undefined) {
    params.set('zoneExternalId', f.zoneExternalId);
  }
  if (f.areaExternalId !== undefined) {
    params.set('areaExternalId', f.areaExternalId);
  }
  if (f.propertyExternalId !== undefined) {
    params.set('propertyExternalId', f.propertyExternalId);
  }
  if (f.semaforo !== undefined) {
    params.set('semaforo', f.semaforo);
  }
  if (f.occurredFrom !== undefined) {
    params.set('occurredFrom', f.occurredFrom);
  }
  if (f.occurredTo !== undefined) {
    params.set('occurredTo', f.occurredTo);
  }
  if (f.incidentTypeExternalIds !== undefined && f.incidentTypeExternalIds.length > 0) {
    params.set('incidentTypeExternalIds', f.incidentTypeExternalIds.join(','));
  }
  if (f.q !== undefined && f.q.length > 0) {
    params.set('q', f.q);
  }
  if (f.personSearch !== undefined && f.personSearch.length > 0) {
    params.set('personSearch', f.personSearch);
  }
  if (f.vehicleSearch !== undefined && f.vehicleSearch.length > 0) {
    params.set('vehicleSearch', f.vehicleSearch);
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export function useIncidents(
  filters: IncidentListFilters = {},
): UseQueryResult<IncidentListResponse> {
  return useQuery<IncidentListResponse>({
    queryKey: ['incidents', 'list', filters],
    queryFn: () => apiClient.get<IncidentListResponse>(`/incidents${buildIncidentsQuery(filters)}`),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useIncident(externalId: string | null): UseQueryResult<IncidentDetail> {
  return useQuery<IncidentDetail>({
    queryKey: ['incidents', 'detail', externalId],
    queryFn: () => apiClient.get<IncidentDetail>(`/incidents/${externalId ?? ''}`),
    enabled: externalId !== null,
    staleTime: 15_000,
  });
}

interface CatalogListResponse<T> {
  items: readonly T[];
}

export function useCatalogZones(): UseQueryResult<readonly CatalogZone[]> {
  return useQuery<readonly CatalogZone[]>({
    queryKey: ['catalog', 'zones'],
    queryFn: async () => {
      const r = await apiClient.get<CatalogListResponse<CatalogZone>>('/catalog/zones');
      return r.items;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Lista áreas. Si `zoneExternalId` viene definido, filtra por esa zona
 * (cascade del panel de filtros). Pasar `null` (default) trae el catálogo
 * completo — útil cuando todavía no se eligió zona.
 */
export function useCatalogAreas(
  zoneExternalId: string | null = null,
): UseQueryResult<readonly CatalogArea[]> {
  return useQuery<readonly CatalogArea[]>({
    queryKey: ['catalog', 'areas', zoneExternalId],
    queryFn: async () => {
      const qs = zoneExternalId !== null ? `?zoneExternalId=${zoneExternalId}` : '';
      const r = await apiClient.get<CatalogListResponse<CatalogArea>>(`/catalog/areas${qs}`);
      return r.items;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Lista predios filtrando por área (preferente) o zona. La cascada
 * Zona → Área → Predio del filtro de incidentes pasa siempre `areaExternalId`
 * cuando hay área seleccionada; si solo hay zona, pasa `zoneExternalId`.
 */
export function useCatalogProperties(
  areaExternalId: string | null = null,
  zoneExternalId: string | null = null,
): UseQueryResult<readonly CatalogProperty[]> {
  return useQuery<readonly CatalogProperty[]>({
    queryKey: ['catalog', 'properties', areaExternalId, zoneExternalId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (areaExternalId !== null) {
        params.set('areaExternalId', areaExternalId);
      }
      if (zoneExternalId !== null) {
        params.set('zoneExternalId', zoneExternalId);
      }
      const qs = params.toString();
      const r = await apiClient.get<CatalogListResponse<CatalogProperty>>(
        `/catalog/properties${qs.length > 0 ? `?${qs}` : ''}`,
      );
      return r.items;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCatalogIncidentTypes(): UseQueryResult<readonly CatalogIncidentType[]> {
  return useQuery<readonly CatalogIncidentType[]>({
    queryKey: ['catalog', 'incident-types'],
    queryFn: async () => {
      const r =
        await apiClient.get<CatalogListResponse<CatalogIncidentType>>('/catalog/incident-types');
      return r.items;
    },
    staleTime: 5 * 60_000,
  });
}

export function useVoidIncident(): UseMutationResult<
  IncidentDetail,
  Error,
  { externalId: string; voidReason: string }
> {
  const qc = useQueryClient();
  return useMutation<IncidentDetail, Error, { externalId: string; voidReason: string }>({
    mutationFn: ({ externalId, voidReason }) =>
      apiClient.post<IncidentDetail>(`/incidents/${externalId}/void`, { voidReason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}
