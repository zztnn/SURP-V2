'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ShieldOff } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { useBlocks } from '@/hooks/use-blocks';

import type { BlockListItem } from '@/types/blocks';

const TARGET_LABELS: Record<BlockListItem['targetType'], string> = {
  party: 'Persona',
  vehicle: 'Vehículo',
};

function formatDateTime(iso: string): string {
  return format(new Date(iso), 'dd-MM-yyyy HH:mm', { locale: es });
}

const columns: ColumnDef<BlockListItem>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-xs">#{row.original.id}</span>,
  },
  {
    id: 'target',
    header: 'Target',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          {TARGET_LABELS[row.original.targetType]}
        </Badge>
        <span className="font-mono text-sm">#{row.original.targetId}</span>
      </div>
    ),
  },
  {
    accessorKey: 'reason',
    header: 'Razón',
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-md text-sm" title={row.original.reason}>
        {row.original.reason}
      </span>
    ),
  },
  {
    accessorKey: 'grantedAt',
    header: 'Otorgado',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{formatDateTime(row.original.grantedAt)}</span>
    ),
  },
  {
    id: 'status',
    header: 'Estado',
    cell: ({ row }) =>
      row.original.active ? (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Activo</Badge>
      ) : (
        <Badge variant="secondary">Revocado</Badge>
      ),
  },
];

export default function BlocksPage(): ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { data, isLoading, isError } = useBlocks({ page, pageSize });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldOff}
        title="Bloqueos"
        description="RUTs y PPUs con bloqueo vigente o histórico"
      />

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No se pudieron cargar los bloqueos. Verifica tu conexión y permisos.
        </div>
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            skeletonRows={5}
          />
          {data ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Mostrando {data.items.length} de {data.total} bloqueos
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                  }}
                >
                  ← Anterior
                </button>
                <span className="font-mono">
                  Página {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-1 disabled:opacity-40"
                  disabled={data.page * data.pageSize >= data.total}
                  onClick={() => {
                    setPage(page + 1);
                  }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
