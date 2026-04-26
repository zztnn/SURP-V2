'use client';

import { Building2, KeyRound, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement } from 'react';

import { PageHeader } from '@/components/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-auth';
import { roleLabel } from '@/lib/role-labels';

import type { AuthUser, OrganizationType } from '@/hooks/use-auth';

const ORG_TYPE_LABEL: Record<OrganizationType, string> = {
  principal: 'Principal',
  security_provider: 'Empresa de seguridad',
  api_consumer: 'Consumidor API',
};

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  if (parts.length === 1) {
    return (parts[0]?.slice(0, 2) ?? '·').toUpperCase();
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
}

export default function SettingsPerfilPage(): ReactElement {
  const { data, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={User}
          title="Perfil"
          description="Tus datos personales, organización y roles"
        />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={User}
          title="Perfil"
          description="Tus datos personales, organización y roles"
        />
        <p className="text-sm text-muted-foreground">No hay sesión activa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={User}
        title="Perfil"
        description="Tus datos personales, organización y roles"
      />

      <ProfileHero user={data} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RolesCard roles={data.roles} />
        <PermissionsCard count={data.permissions.length} />
        <OrganizationCard
          name={data.organizationName}
          type={data.organizationType}
          id={data.organizationId}
        />
      </div>
    </div>
  );
}

function ProfileHero({ user }: { user: AuthUser }): ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {initialsFor(user.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{user.displayName}</h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{user.organizationName}</span>
            <Badge variant="secondary" className="text-xs">
              {ORG_TYPE_LABEL[user.organizationType]}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RolesCard({ roles }: { roles: readonly string[] }): ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Roles</CardTitle>
        <Shield className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{roles.length}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sin roles asignados</span>
          ) : (
            roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {roleLabel(r)}
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionsCard({ count }: { count: number }): ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Permisos</CardTitle>
        <KeyRound className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{count}</div>
        <Link
          href="/settings/seguridad"
          className="mt-2 inline-flex text-xs text-primary hover:underline"
        >
          Ver detalle en Seguridad →
        </Link>
      </CardContent>
    </Card>
  );
}

function OrganizationCard({
  name,
  type,
  id,
}: {
  name: string;
  type: OrganizationType;
  id: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Organización</CardTitle>
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="truncate text-base font-semibold" title={name}>
          {name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {ORG_TYPE_LABEL[type]}
          </Badge>
          <span className="font-mono">#{id}</span>
        </div>
      </CardContent>
    </Card>
  );
}
