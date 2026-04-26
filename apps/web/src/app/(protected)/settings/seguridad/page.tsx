'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  Bot,
  Check,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Monitor,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-auth';
import {
  useLoginHistory,
  type LoginAttemptItem,
  type LoginOutcome,
} from '@/hooks/use-login-history';
import {
  useRevokeSession,
  useSessions,
  type SessionDeviceType,
  type SessionItem,
} from '@/hooks/use-sessions';

import type { LucideIcon } from 'lucide-react';

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

export default function SettingsSeguridadPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Seguridad"
        description="Sesiones activas, historial de inicio de sesión, permisos y MFA"
      />

      <SessionsSection />
      <LoginHistorySection />
      <PermissionsSection />
      <PasswordSection />
      <MfaSection />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sesiones activas
// ────────────────────────────────────────────────────────────────────

function SessionsSection(): ReactElement {
  const { data, isLoading, isError } = useSessions();
  const revoke = useRevokeSession();
  const [pendingRevoke, setPendingRevoke] = useState<SessionItem | null>(null);

  const handleConfirmRevoke = (): void => {
    if (!pendingRevoke) {
      return;
    }
    revoke.mutate(pendingRevoke.externalId, {
      onSuccess: () => {
        toast.success('Sesión cerrada correctamente');
        setPendingRevoke(null);
      },
      onError: (e) => {
        toast.error(`No se pudo cerrar la sesión: ${e.message}`);
        setPendingRevoke(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesiones activas</CardTitle>
        <CardDescription>
          Dispositivos donde tu cuenta está abierta. Puedes cerrar cualquier sesión que no
          reconozcas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">No se pudieron cargar tus sesiones.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay sesiones activas.</p>
        ) : (
          <ul className="space-y-2">
            {data.map((session) => (
              <SessionRow
                key={session.externalId}
                session={session}
                onRevoke={() => {
                  setPendingRevoke(session);
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRevoke(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar esta sesión</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke
                ? `Vas a cerrar la sesión de ${pendingRevoke.deviceLabel ?? 'dispositivo desconocido'}. El usuario tendrá que iniciar sesión nuevamente.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRevoke}
              disabled={revoke.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoke.isPending ? 'Cerrando…' : 'Cerrar sesión'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const DEVICE_ICON: Record<SessionDeviceType, LucideIcon> = {
  desktop: Laptop,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: Monitor,
};

function SessionRow({
  session,
  onRevoke,
}: {
  session: SessionItem;
  onRevoke: () => void;
}): ReactElement {
  const Icon = session.deviceType ? DEVICE_ICON[session.deviceType] : Monitor;
  const lastRefreshed = formatDistanceToNow(new Date(session.lastRefreshedAt), {
    locale: es,
    addSuffix: true,
  });

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {session.deviceLabel ?? 'Sesión sin información de dispositivo'}
            </span>
            {session.isCurrent ? (
              <Badge variant="default" className="text-xs">
                Tu sesión actual
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{session.ip}</span>
            {' · '}
            <span>Última actividad {lastRefreshed}</span>
          </p>
        </div>
      </div>
      {session.isCurrent ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          Usa <span className="whitespace-nowrap font-mono">/auth/logout</span>
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onRevoke}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="mr-1 h-3.5 w-3.5" />
          Cerrar
        </Button>
      )}
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────
// Historial de inicio de sesión
// ────────────────────────────────────────────────────────────────────

function LoginHistorySection(): ReactElement {
  const { data, isLoading, isError } = useLoginHistory();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de inicio de sesión</CardTitle>
        <CardDescription>Últimos 20 intentos (exitosos y fallidos)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">No se pudo cargar el historial.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividad reciente.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((attempt, idx) => (
              <LoginAttemptRow key={`${attempt.attemptedAt}-${String(idx)}`} attempt={attempt} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const OUTCOME_LABEL: Record<LoginOutcome, string> = {
  success: 'Éxito',
  bad_password: 'Contraseña incorrecta',
  unknown_email: 'Email desconocido',
  locked: 'Cuenta bloqueada',
  mfa_failed: 'MFA fallido',
  mfa_required: 'MFA requerido',
  inactive: 'Cuenta inactiva',
};

function LoginAttemptRow({ attempt }: { attempt: LoginAttemptItem }): ReactElement {
  const isSuccess = attempt.outcome === 'success';
  const date = new Date(attempt.attemptedAt);
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {isSuccess ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <X className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{OUTCOME_LABEL[attempt.outcome]}</span>
            {attempt.mfaUsed ? (
              <Badge variant="outline" className="text-xs">
                MFA
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{attempt.ip}</span>
            {' · '}
            <span>{format(date, "dd-MM-yyyy 'a las' HH:mm", { locale: es })}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────
// Permisos por módulo (movido desde /me)
// ────────────────────────────────────────────────────────────────────

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

function PermissionsSection(): ReactElement {
  const { data, isLoading } = useMe();
  const groups = data ? groupByModule(data.permissions) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos por módulo</CardTitle>
        <CardDescription>
          {data
            ? `${String(data.permissions.length)} permisos efectivos en ${String(groups.length)} módulos`
            : 'Permisos efectivos derivados de tus roles'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No hay sesión activa.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.module} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {MODULE_LABELS[g.module] ?? g.module}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {g.count}
                  </Badge>
                </div>
                <ul className="space-y-0.5">
                  {g.codes.map((c) => (
                    <li key={c} className="truncate font-mono text-xs text-muted-foreground">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────
// Cambiar contraseña (placeholder — endpoint pendiente)
// ────────────────────────────────────────────────────────────────────

function PasswordSection(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Contraseña
        </CardTitle>
        <CardDescription>Cambia tu contraseña periódicamente</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>
              Cambio de contraseña pendiente — requiere endpoint{' '}
              <code className="font-mono text-xs">PATCH /auth/password</code> con verificación de
              contraseña actual + invalidación de sesiones.
            </p>
            <p className="text-xs">Disponible post-MVP.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────
// MFA (placeholder — F11.x post-MVP)
// ────────────────────────────────────────────────────────────────────

function MfaSection(): ReactElement {
  const { data } = useMe();
  const enrolled = data?.mfaEnrolled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Autenticación de dos factores (MFA)
        </CardTitle>
        <CardDescription>
          {enrolled ? 'MFA activo en tu cuenta' : 'Aún no tienes MFA configurado'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>
              Configuración TOTP pendiente — requiere flujo de enrollment + QR + verificación.
              Decisión: MFA obligatorio para humanos según política del proyecto.
            </p>
            <p className="text-xs">Disponible post-MVP.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
