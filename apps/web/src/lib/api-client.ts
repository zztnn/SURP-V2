import { clearAccessToken, getAccessToken, setAccessToken } from './auth-token-store';

/**
 * API client para SURP backend (puerto 3201). Maneja:
 *   - Authorization: Bearer <jwt> (access JWT en memoria).
 *   - credentials: 'include' (refresh cookie httpOnly viaja con la request).
 *   - Auto-refresh on 401: intenta `/auth/refresh` (cookie), reintenta la
 *     request original con el nuevo access token. Si refresh falla → null
 *     access token, el caller maneja la redirección a /login.
 *   - Errores parseados desde el body JSON del backend (`{ code, message }`).
 *
 * NO maneja sesiones ni redirecciones — eso lo hace `useAuth` con TanStack
 * Query + Next router.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorBody {
  error?: string;
  code?: string;
  message?: string;
  errors?: unknown;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Si false, no intenta auto-refresh on 401 (úsalo en /auth/login y /auth/refresh para evitar loops). */
  autoRefresh?: boolean;
  /** Si true, considera 204 como respuesta vacía válida y devuelve null. */
  allowEmpty?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, allowEmpty = false } = options;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const accessToken = getAccessToken();
  if (accessToken !== null) {
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: finalHeaders,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : null,
  });

  if (res.status === 204 || allowEmpty) {
    return null as T;
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!res.ok) {
    const errBody = (parsed ?? {}) as ApiErrorBody;
    throw new ApiError(
      res.status,
      errBody.code ?? `HTTP_${String(res.status)}`,
      errBody.message ?? `HTTP ${String(res.status)}`,
      errBody.errors ?? null,
    );
  }

  return parsed as T;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh atómico — si dos requests piden refresh al mismo tiempo,
 * solo se hace UNA llamada al backend y ambas reciben el mismo token.
 *
 * Exportado: `useMe` lo usa al primer mount para evitar pegarle a
 * `/auth/me` cuando no hay token en memoria (lo cual produciría un 401
 * ruidoso + un retry post-refresh).
 */
export async function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    try {
      const result = await rawRequest<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: {},
        autoRefresh: false,
      });
      setAccessToken(result.accessToken);
      return result.accessToken;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { autoRefresh = true } = options;
  try {
    return await rawRequest<T>(path, options);
  } catch (e) {
    if (autoRefresh && e instanceof ApiError && e.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken !== null) {
        return rawRequest<T>(path, { ...options, autoRefresh: false });
      }
    }
    throw e;
  }
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> => request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> => request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> => request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
