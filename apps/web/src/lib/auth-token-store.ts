/**
 * Storage en memoria del access JWT. NO usamos localStorage / sessionStorage
 * para que un XSS no pueda leer el token. La cookie httpOnly del refresh
 * sobrevive recargas; tras un reload, el frontend llama `/auth/refresh`
 * automáticamente para obtener un nuevo access JWT en memoria.
 *
 * Patrón: módulo singleton, no hook (los hooks reactivos generarían
 * re-renders innecesarios cuando cambia el token).
 */

let accessToken: string | null = null;
const listeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) {
    listener();
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

/** Para componentes que necesitan re-render cuando cambia el token. */
export function subscribeToAccessToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
