import { redirect } from 'next/navigation';

/**
 * `/settings` sin sub-ruta: el layout siempre tiene sidebar interno con
 * 4 secciones. No hay valor en una landing extra cuando ya hay nav
 * visible — redirigimos directo a Perfil (la sección más usada).
 */
export default function SettingsIndexPage(): never {
  redirect('/settings/perfil');
}
