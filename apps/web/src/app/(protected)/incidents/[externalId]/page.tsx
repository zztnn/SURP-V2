'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  Calendar,
  ExternalLink,
  Hash,
  MapPin,
  Tag,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactElement, type ReactNode } from 'react';

import { EmptyState } from '@/components/empty-state';
import {
  VoidIncidentDialog,
  type VoidIncidentTarget,
} from '@/components/incidents/void-incident-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIncident } from '@/hooks/use-incidents';
import {
  AGGRAVATING_FACTOR_LABELS,
  LOCATION_SOURCE_LABELS,
  ORG_TYPE_LABELS,
  SEMAFORO_DOT_CLASS,
  SEMAFORO_LABELS,
  STATE_BADGE_CLASS,
  STATE_LABELS,
} from '@/lib/incidents-format';

function formatDateTime(iso: string): string {
  return format(new Date(iso), 'dd-MM-yyyy HH:mm', { locale: es });
}

function FieldRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function IncidentDetailPage(): ReactElement {
  const { externalId } = useParams<{ externalId: string }>();
  const router = useRouter();

  const { data: incident, isLoading, isError } = useIncident(externalId);
  const [pendingVoid, setPendingVoid] = useState<VoidIncidentTarget | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !incident) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Activity} title="Incidente" description="Detalle del informe" />
        <EmptyState
          icon={AlertTriangle}
          title="Incidente no encontrado"
          description="El incidente no existe, fue eliminado, o no tienes permiso para verlo."
          action={
            <Button
              variant="outline"
              onClick={() => {
                router.push('/incidents');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al listado
            </Button>
          }
        />
      </div>
    );
  }

  const canVoid = incident.state === 'active';
  const titleCode = incident.correlativeCode ?? incident.externalId.slice(0, 8);
  const headerDescription = `${incident.zone.shortCode} · ${formatDateTime(incident.occurredAt)}`;
  const mapsUrl = `https://www.google.com/maps?q=${incident.location.lat},${incident.location.lng}`;

  return (
    <div className="space-y-6">
      <PageHeader icon={Activity} title={`Incidente ${titleCode}`} description={headerDescription}>
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${SEMAFORO_DOT_CLASS[incident.semaforo]}`}
          title={`Semáforo ${SEMAFORO_LABELS[incident.semaforo]}`}
        />
        <Badge className={STATE_BADGE_CLASS[incident.state]}>{STATE_LABELS[incident.state]}</Badge>
        <Button variant="outline" size="sm" asChild>
          <Link href="/incidents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>
        {canVoid ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setPendingVoid({
                externalId: incident.externalId,
                correlativeCode: incident.correlativeCode,
              });
            }}
          >
            <Ban className="mr-2 h-4 w-4" />
            Anular
          </Button>
        ) : null}
      </PageHeader>

      {incident.state === 'voided' ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          Este incidente fue anulado. El correlativo se mantiene ocupado en el histórico.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            Clasificación y descripción
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Tipo de incidente">
              {incident.incidentType.name}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {incident.incidentType.code}
              </span>
            </FieldRow>
            <FieldRow label="Semáforo">
              <span className="inline-flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${SEMAFORO_DOT_CLASS[incident.semaforo]}`}
                />
                {SEMAFORO_LABELS[incident.semaforo]}
              </span>
            </FieldRow>
            <FieldRow label="Agravantes">
              {incident.aggravatingFactors.length === 0 ? (
                <span className="text-muted-foreground">Sin agravantes registrados</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {incident.aggravatingFactors.map((code) => (
                    <Badge key={code} variant="outline">
                      {AGGRAVATING_FACTOR_LABELS[code] ?? code}
                    </Badge>
                  ))}
                </div>
              )}
            </FieldRow>
            {incident.timberFate !== null ? (
              <FieldRow label="Destino de la madera">{incident.timberFate}</FieldRow>
            ) : null}
            <FieldRow label="Descripción">
              <p className="whitespace-pre-wrap leading-relaxed">{incident.description}</p>
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            Ubicación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Zona">
              {incident.zone.name}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                ({incident.zone.shortCode})
              </span>
            </FieldRow>
            <FieldRow label="Área">
              {incident.area ? (
                incident.area.name
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Predio">
              {incident.property ? (
                incident.property.name
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Comuna">
              {incident.commune ? (
                incident.commune.name
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Coordenadas (WGS84)">
              <span className="font-mono">
                {incident.location.lat.toFixed(6)}, {incident.location.lng.toFixed(6)}
              </span>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Ver en Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </FieldRow>
            <FieldRow label="Origen de la coordenada">
              <Badge variant="outline">
                {LOCATION_SOURCE_LABELS[incident.locationSource] ?? incident.locationSource}
              </Badge>
            </FieldRow>
            {incident.gpsAccuracyMeters !== null ? (
              <FieldRow label="Precisión GPS">{incident.gpsAccuracyMeters} m</FieldRow>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            Tiempo y reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Ocurrido">{formatDateTime(incident.occurredAt)}</FieldRow>
            <FieldRow label="Detectado">
              {incident.detectedAt !== null ? (
                formatDateTime(incident.detectedAt)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Reportado">{formatDateTime(incident.reportedAt)}</FieldRow>
            <FieldRow label="Sincronizado al servidor">
              {incident.submittedAt !== null ? (
                formatDateTime(incident.submittedAt)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            Captura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Capturado por">{incident.capturedByUser.displayName}</FieldRow>
            <FieldRow label="Organización">
              <span className="inline-flex flex-wrap items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {incident.createdByOrganization.name}
                <Badge variant="outline">
                  {ORG_TYPE_LABELS[incident.createdByOrganization.type] ??
                    incident.createdByOrganization.type}
                </Badge>
              </span>
            </FieldRow>
            <FieldRow label="ID del informe">
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                <Hash className="h-3 w-3 text-muted-foreground" />
                {incident.externalId}
              </span>
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <VoidIncidentDialog
        target={pendingVoid}
        onClose={() => {
          setPendingVoid(null);
        }}
        onVoided={() => {
          // El backend invalida la query del incidente; tras anular, el detail
          // se re-renderiza con state=voided y muestra el banner.
        }}
      />
    </div>
  );
}
