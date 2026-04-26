'use client';

import { Home } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { ReactElement } from 'react';

export default function DashboardPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Home}
        title="Dashboard"
        description="Bienvenido al SURP 2.0 — Sistema de Unidad de Resguardo Patrimonial"
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Incidentes activos</CardTitle>
            <CardDescription>Pendientes en tus zonas asignadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">F11 conectará con el módulo incidents</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bloqueos vigentes</CardTitle>
            <CardDescription>RUTs y patentes bloqueados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">F10 conectará con `/blocks`</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Causas en curso</CardTitle>
            <CardDescription>Asignadas a tus abogados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Post-MVP</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
