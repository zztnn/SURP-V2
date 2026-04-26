'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

export type LoginOutcome =
  | 'success'
  | 'bad_password'
  | 'unknown_email'
  | 'locked'
  | 'mfa_failed'
  | 'mfa_required'
  | 'inactive';

export interface LoginAttemptItem {
  outcome: LoginOutcome;
  mfaUsed: boolean;
  ip: string;
  userAgent: string | null;
  attemptedAt: string;
}

export function useLoginHistory(): UseQueryResult<LoginAttemptItem[]> {
  return useQuery<LoginAttemptItem[]>({
    queryKey: ['auth', 'login-history'],
    queryFn: () => apiClient.get<LoginAttemptItem[]>('/auth/login-history'),
    staleTime: 60_000,
  });
}
