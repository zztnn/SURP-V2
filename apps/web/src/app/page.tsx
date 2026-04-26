import { redirect } from 'next/navigation';

/**
 * Root route. Redirige al dashboard que, vía `ProtectedShell`, valida
 * sesión con `/auth/me` y manda a `/login` si no hay sesión activa.
 */
export default function HomePage(): never {
  redirect('/dashboard');
}
