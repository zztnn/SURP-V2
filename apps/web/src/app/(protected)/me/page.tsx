import { redirect } from 'next/navigation';

/**
 * `/me` se desactivó en F11 — el contenido se split entre
 * `/settings/perfil` (identidad, organización, roles) y
 * `/settings/seguridad` (sesiones, login-history, permisos por módulo).
 *
 * Mantenemos el path como redirect 307 server-side para que enlaces
 * antiguos sigan funcionando sin error 404.
 */
export default function MePage(): never {
  redirect('/settings/perfil');
}
