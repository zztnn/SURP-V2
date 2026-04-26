'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

import type { BlockListFilters, BlockListResponse } from '@/types/blocks';

function buildQuery(filters: BlockListFilters): string {
  const params = new URLSearchParams();
  if (filters.page !== undefined) {
    params.set('page', String(filters.page));
  }
  if (filters.pageSize !== undefined) {
    params.set('pageSize', String(filters.pageSize));
  }
  if (filters.targetType !== undefined) {
    params.set('targetType', filters.targetType);
  }
  if (filters.active !== undefined) {
    params.set('active', String(filters.active));
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export function useBlocks(filters: BlockListFilters = {}): UseQueryResult<BlockListResponse> {
  return useQuery<BlockListResponse>({
    queryKey: ['blocks', 'list', filters],
    queryFn: () => apiClient.get<BlockListResponse>(`/blocks${buildQuery(filters)}`),
    staleTime: 10_000,
  });
}
