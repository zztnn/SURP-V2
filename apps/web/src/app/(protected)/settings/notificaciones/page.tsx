'use client';

import { Bell } from 'lucide-react';
import { type ReactElement } from 'react';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsNotificacionesPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Notificaciones"
        description="Preferencias de email y alertas operacionales"
      />

      <Card>
        <CardHeader>
          <CardTitle>Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Opt-in/out por categoría (incidentes críticos, plazos procesales, digests semanales,
          alertas operacionales). Las notificaciones mandatorias (auth, alertas críticas) no son
          configurables. Pendiente F11.7.
        </CardContent>
      </Card>
    </div>
  );
}
