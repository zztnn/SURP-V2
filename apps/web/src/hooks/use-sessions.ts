'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

export interface SessionItem {
  externalId: string;
  deviceLabel: string | null;
  deviceType: SessionDeviceType | null;
  locationLabel: string | null;
  ip: string;
  userAgent: string | null;
  issuedAt: string;
  lastRefreshedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function useSessions(): UseQueryResult<SessionItem[]> {
  return useQuery<SessionItem[]>({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiClient.get<SessionItem[]>('/auth/sessions'),
    staleTime: 30_000,
  });
}

export function useRevokeSession(): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, string>({
    mutationFn: async (externalId: string) => {
      await apiClient.delete<null>(`/auth/sessions/${encodeURIComponent(externalId)}`, {
        allowEmpty: true,
      });
      return undefined;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
}
