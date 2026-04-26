'use client';

import { Building2, KeyRound, Shield, User, Users } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-auth';
import { roleLabel } from '@/lib/role-labels';

interface PermissionGroup {
  module: string;
  count: number;
  codes: string[];
}

function groupByModule(permissions: readonly string[]): PermissionGroup[] {
  const map = new Map<string, string[]>();
  for (const code of permissions) {
    const moduleName = code.split('.')[0] ?? 'unknown';
    const list = map.get(moduleName);
    if (list) {
      list.push(code);
    } else {
      map.set(moduleName, [code]);
    }
  }
  return Array.from(map.entries())
    .map(([module, codes]) => ({
      module,
      count: codes.length,
      codes: codes.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

const MODULE_LABELS: Record<string, string> = {
  audit: 'Auditoría',
  blocks: 'Bloqueos',
  cases: 'Causas',
  catalog: 'Catálogos',
  complaints: 'Denuncias',
  fires: 'Incendios',
  incidents: 'Incidentes',
  maat: 'MAAT',
  organizations: 'Organizaciones',
  persons: 'Personas',
  police_units: 'Unidades policiales',
  queries: 'Consultas',
  reports: 'Reportes',
  roles: 'Roles',
  rules: 'Reglas',
  statistics: 'Estadísticas',
  surveillance: 'Vigilancia',
  users: 'Usuarios',
  vehicles: 'Vehículos',
};

export default function MePage(): ReactElement {
  const { data, isLoading } = useMe();
  const groups = useMemo<PermissionGroup[]>(
    () => (data ? groupByModule(data.permissions) : []),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">No hay sesión activa.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={User} title="Mi cuenta" description={data.email} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuario</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="truncate text-lg font-semibold">{data.displayName}</div>
            <p className="text-xs text-muted-foreground">ID #{data.id}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organización</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">#{data.organizationId}</div>
            <p className="text-xs text-muted-foreground">Mono-org SURP</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{data.roles.length}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {data.roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-xs">
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permisos</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{data.permissions.length}</div>
            <p className="text-xs text-muted-foreground">en {groups.length} módulos</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Permisos por módulo</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.module}>
              <CardHeader>
                <CardTitle className="text-base capitalize">
                  {MODULE_LABELS[g.module] ?? g.module}
                </CardTitle>
                <CardDescription>{g.count} permisos</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {g.codes.map((c) => (
                    <li key={c} className="font-mono text-xs text-muted-foreground">
                      {c}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
