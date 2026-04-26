import type { MenuTree } from '@/types/menu';

/**
 * Catálogo del menú lateral del SURP. Diferencia con el ERP:
 *   - Estático en código (no editable por admin desde BD).
 *   - Cada item declara `requiredPermissions` — el filtrado lo hace
 *     `useFilteredMenu()` con los permisos efectivos del `useMe()`.
 *
 * Convenciones:
 *   - `code` único, en kebab-case con prefijo del bounded context.
 *   - `icon` corresponde a un nombre exportado por `lucide-react`
 *     (resuelto por `<MenuIcon />`).
 *   - `requiredPermissions` vacío → siempre visible (todos los users
 *     autenticados lo ven).
 *   - Si CUALQUIERA de los permisos del array está en
 *     `user.permissions`, el item se muestra (OR semántico).
 *   - Para grupos: si todos sus children quedan filtrados, el grupo
 *     también desaparece.
 */
export interface MenuItemDef {
  code: string;
  label: string;
  icon: string;
  href?: string;
  requiredPermissions?: readonly string[];
  children?: readonly MenuItemDef[];
}

export const MENU_ROOT: readonly MenuItemDef[] = [
  {
    code: 'dashboard',
    label: 'Inicio',
    icon: 'Home',
    href: '/dashboard',
  },
  {
    code: 'incidents',
    label: 'Incidentes',
    icon: 'AlertTriangle',
    href: '/incidents',
    requiredPermissions: ['incidents.incidents.read'],
  },
  {
    code: 'complaints',
    label: 'Denuncias',
    icon: 'FileText',
    href: '/complaints',
    requiredPermissions: ['complaints.complaints.read'],
  },
  {
    code: 'cases',
    label: 'Causas',
    icon: 'Gavel',
    href: '/cases',
    requiredPermissions: ['cases.cases.read'],
  },
  {
    code: 'persons',
    label: 'Personas',
    icon: 'Users',
    href: '/persons',
    requiredPermissions: ['persons.persons.read'],
  },
  {
    code: 'vehicles',
    label: 'Vehículos',
    icon: 'Truck',
    href: '/vehicles',
    requiredPermissions: ['vehicles.vehicles.read'],
  },
  {
    code: 'blocks',
    label: 'Bloqueos',
    icon: 'ShieldOff',
    href: '/blocks',
    requiredPermissions: ['blocks.blocks.read'],
  },
  {
    code: 'fires',
    label: 'Incendios',
    icon: 'Flame',
    href: '/fires',
    requiredPermissions: ['fires.fires.read'],
  },
  {
    code: 'surveillance',
    label: 'Vigilancia',
    icon: 'Eye',
    requiredPermissions: [
      'surveillance.contractors.read',
      'surveillance.guards.read',
      'surveillance.shifts.read',
      'surveillance.patrols.read',
    ],
    children: [
      {
        code: 'surveillance-contractors',
        label: 'Contratistas',
        icon: 'Building2',
        href: '/surveillance/contractors',
        requiredPermissions: ['surveillance.contractors.read'],
      },
      {
        code: 'surveillance-guards',
        label: 'Guardias',
        icon: 'UserCheck',
        href: '/surveillance/guards',
        requiredPermissions: ['surveillance.guards.read'],
      },
      {
        code: 'surveillance-shifts',
        label: 'Turnos',
        icon: 'CalendarClock',
        href: '/surveillance/shifts',
        requiredPermissions: ['surveillance.shifts.read'],
      },
      {
        code: 'surveillance-patrols',
        label: 'Rondines',
        icon: 'Footprints',
        href: '/surveillance/patrols',
        requiredPermissions: ['surveillance.patrols.read'],
      },
    ],
  },
  {
    code: 'reports',
    label: 'Reportes',
    icon: 'BarChart3',
    href: '/reports',
    requiredPermissions: ['reports.reports.read', 'statistics.reports.read'],
  },
  {
    code: 'admin',
    label: 'Administración',
    icon: 'Settings',
    requiredPermissions: [
      'users.users.manage',
      'roles.roles.manage',
      'organizations.organizations.manage',
      'audit.logs.read',
    ],
    children: [
      {
        code: 'admin-users',
        label: 'Usuarios',
        icon: 'UserCog',
        href: '/admin/users',
        requiredPermissions: ['users.users.manage'],
      },
      {
        code: 'admin-roles',
        label: 'Roles',
        icon: 'KeyRound',
        href: '/admin/roles',
        requiredPermissions: ['roles.roles.manage'],
      },
      {
        code: 'admin-orgs',
        label: 'Organizaciones',
        icon: 'Network',
        href: '/admin/organizations',
        requiredPermissions: ['organizations.organizations.manage'],
      },
      {
        code: 'admin-audit',
        label: 'Audit Logs',
        icon: 'ScrollText',
        href: '/admin/audit',
        requiredPermissions: ['audit.logs.read'],
      },
    ],
  },
];

/**
 * Convierte el catálogo a árbol filtrado por permisos. Un item se
 * conserva si:
 *   - No declara `requiredPermissions` (siempre visible), o
 *   - Al menos uno de sus permisos requeridos está en `userPerms`
 *     (semántica OR), o
 *   - Algún child sobrevive al filtrado (los grupos se mantienen
 *     si tienen al menos un child accesible).
 */
export function filterMenuByPermissions(userPermissions: readonly string[]): MenuTree {
  const perms = new Set(userPermissions);
  let nextId = 1;

  function map(items: readonly MenuItemDef[]): MenuTree['nodes'] {
    const out: MenuTree['nodes'] = [];
    for (const item of items) {
      const childNodes = item.children ? map(item.children) : [];
      const hasOwnAccess =
        !item.requiredPermissions || item.requiredPermissions.length === 0
          ? true
          : item.requiredPermissions.some((p) => perms.has(p));
      const visible = hasOwnAccess || childNodes.length > 0;
      if (!visible) {
        continue;
      }
      out.push({
        id: nextId++,
        code: item.code,
        kind: childNodes.length > 0 ? 'group' : 'item',
        label: item.label,
        icon: item.icon,
        href: item.href ?? null,
        children: childNodes,
      });
    }
    return out;
  }

  return { nodes: map(MENU_ROOT), favorites: [] };
}
