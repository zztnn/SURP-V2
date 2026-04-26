'use client';

import { Check, Copy, Info } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { siteConfig } from '@/config/site';
import { useMe } from '@/hooks/use-auth';
import { roleLabels } from '@/lib/role-labels';
import { cn } from '@/lib/utils';

interface SystemInfoModalProps {
  isExpanded: boolean;
}

/**
 * Modal "Información del sistema". Diferencia con el ERP:
 *   - SURP es mono-org: omitimos lista de companies accesibles + tenant.
 *   - Mostramos versión de SURP, datos del user (nombre, email, roles)
 *     y entorno (API URL, env). El user pertenece a UNA organization
 *     (campo `organizationId`).
 */
export function SystemInfoModal({ isExpanded }: SystemInfoModalProps): ReactElement {
  const me = useMe();
  const [copied, setCopied] = useState(false);

  const env = process.env['NEXT_PUBLIC_APP_ENV'] ?? 'development';
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201';

  const infoText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Versión: ${siteConfig.templateVersion}`);
    lines.push(`Usuario: ${me.data?.displayName ?? '—'}`);
    lines.push(`Email: ${me.data?.email ?? '—'}`);
    lines.push(`Roles: ${me.data ? roleLabels(me.data.roles) : '—'}`);
    lines.push(`Organización: #${me.data?.organizationId ?? '—'}`);
    lines.push(`Permisos: ${me.data?.permissions.length ?? 0}`);
    lines.push(`Entorno: ${env}`);
    lines.push(`API: ${apiUrl}`);
    lines.push(`User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`);
    return lines.join('\n');
  }, [me.data, env, apiUrl]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(infoText);
      setCopied(true);
      toast.success('Copiado al portapapeles');
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label="Información del sistema"
      className={cn(
        'flex items-center gap-2 rounded-md text-sidebar-foreground/50 transition-colors hover:bg-white/8 hover:text-sidebar-foreground',
        isExpanded ? 'h-8 px-3 text-[11px] w-full' : 'h-9 w-9 justify-center',
      )}
    >
      <Info className="h-3.5 w-3.5" />
      {isExpanded ? <span className="truncate">Información del sistema</span> : null}
    </button>
  );

  return (
    <Dialog>
      {isExpanded ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={10}
            className="bg-primary text-primary-foreground text-xs"
          >
            Información del sistema
          </TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{siteConfig.name}</DialogTitle>
          <DialogDescription>{siteConfig.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aplicación
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Versión</dt>
              <dd className="font-mono">{siteConfig.templateVersion}</dd>
            </dl>
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sesión
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Usuario</dt>
              <dd className="font-medium">{me.data?.displayName ?? '—'}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono text-xs">{me.data?.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Roles</dt>
              <dd>{me.data ? roleLabels(me.data.roles) : '—'}</dd>
              <dt className="text-muted-foreground">Organización</dt>
              <dd className="font-mono">#{me.data?.organizationId ?? '—'}</dd>
              <dt className="text-muted-foreground">Permisos</dt>
              <dd>{me.data?.permissions.length ?? 0}</dd>
            </dl>
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Entorno
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Ambiente</dt>
              <dd className="font-mono text-xs">{env}</dd>
              <dt className="text-muted-foreground">API URL</dt>
              <dd className="font-mono text-xs break-all">{apiUrl}</dd>
            </dl>
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              void handleCopy();
            }}
          >
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
