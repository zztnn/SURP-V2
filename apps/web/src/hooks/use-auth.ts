'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, ApiError, refreshAccessToken } from '@/lib/api-client';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/auth-token-store';

export type OrganizationType = 'principal' | 'security_provider' | 'api_consumer';

export interface AuthUser {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  active: boolean;
  mustResetPassword: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  permissions: readonly string[];
  roles: readonly string[];
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    externalId: string;
    email: string;
    displayName: string;
    organizationId: string;
    organizationName: string;
    organizationType: OrganizationType;
    permissions: readonly string[];
    roles: readonly string[];
  };
  requiresPasswordReset: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Lookup del usuario actual.
 *
 * Optimización al primer load: si NO hay access token en memoria
 * (caso típico tras recargar la página o entrar fresco), intenta
 * `/auth/refresh` primero. La cookie httpOnly `surp_refresh` viaja
 * automáticamente; si existe y es válida, recupera el access token.
 * Si no, marcamos `null` sin pegarle a `/auth/me`.
 *
 * Esto evita los dos 401 consecutivos (`/auth/me` → 401 → auto-refresh
 * → 401) que aparecían en consola al cargar la app sin sesión.
 *
 * Si SÍ hay access token (post-login o sesión activa), llamamos
 * directo `/auth/me`. El api-client maneja auto-refresh transparente
 * si el access token expiró.
 */
export function useMe(): UseQueryResult<AuthUser | null> {
  return useQuery<AuthUser | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      // Sin access token: intentamos refresh primero. Si falla, no hay
      // sesión y retornamos null sin tocar /auth/me.
      if (getAccessToken() === null) {
        const newToken = await refreshAccessToken();
        if (newToken === null) {
          return null;
        }
      }
      try {
        return await apiClient.get<AuthUser>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          return null;
        }
        throw e;
      }
    },
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Login con email + password. En éxito:
 *   1. Guarda access JWT en memoria.
 *   2. **Hidrata la cache de `useMe`** con el snapshot del response —
 *      esto evita el flash de "no autenticado" en `ProtectedShell`
 *      cuando el form redirige a /dashboard. Sin esto, había una race:
 *      `invalidateQueries` marca stale pero no espera al refetch, y
 *      el router.replace navegaba antes de que `useMe` tuviera data.
 *   3. `await invalidateQueries` para que el siguiente refetch traiga
 *      los campos completos (`active`, `mfaRequired`, etc.) del
 *      endpoint `/auth/me` que NO vienen en `/auth/login`.
 *
 * El backend setea la cookie httpOnly `surp_refresh` automáticamente.
 */
export function useLogin(): UseMutationResult<LoginResponse, Error, LoginInput> {
  const queryClient = useQueryClient();
  return useMutation<LoginResponse, Error, LoginInput>({
    mutationFn: (input: LoginInput) =>
      apiClient.post<LoginResponse>('/auth/login', input, { autoRefresh: false }),
    onSuccess: async (result) => {
      setAccessToken(result.accessToken);
      // Snapshot inicial — campos del response. Los que no vienen
      // (active/mfaRequired/etc.) se completan con defaults seguros
      // y se actualizan al refetch siguiente.
      const optimisticUser: AuthUser = {
        id: result.user.id,
        externalId: result.user.externalId,
        email: result.user.email,
        displayName: result.user.displayName,
        organizationId: result.user.organizationId,
        organizationName: result.user.organizationName,
        organizationType: result.user.organizationType,
        permissions: result.user.permissions,
        roles: result.user.roles,
        active: true,
        mustResetPassword: result.requiresPasswordReset,
        mfaRequired: false,
        mfaEnrolled: false,
      };
      queryClient.setQueryData<AuthUser | null>(['auth', 'me'], optimisticUser);
      // Refetch en background para reconciliar con backend (sin bloquear).
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/**
 * Logout — backend revoca la sesión y limpia la cookie. Frontend limpia
 * el access JWT y vacía toda la cache.
 */
export function useLogout(): UseMutationResult<undefined, Error, undefined> {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, undefined>({
    mutationFn: async () => {
      await apiClient.post<null>('/auth/logout', {}, { autoRefresh: false, allowEmpty: true });
      return undefined;
    },
    onSuccess: () => {
      clearAccessToken();
      queryClient.clear();
    },
    onError: () => {
      clearAccessToken();
      queryClient.clear();
    },
  });
}
