# Create List Page — SURP 2.0

> Guía para crear una página de lista siguiendo el Entity Page Pattern.

---

## Checklist de archivos a crear

1. `src/lib/validators/{entity}.ts` — schema Zod + tipos
2. `src/lib/query-keys.ts` — agregar las keys del módulo
3. `src/lib/api/{entity}.ts` — funciones del API client
4. `src/components/tables/columns/{entity}-columns.tsx` — definición de columnas
5. `src/components/forms/{entity}-form.tsx` — campos de formulario
6. `src/app/(protected)/{category}/{entity}/page.tsx` — página de lista
7. `src/app/(protected)/{category}/{entity}/[id]/page.tsx` — página de detalle
8. (Opcional) `src/components/maps/{entity}-map.tsx` — si tiene datos geo

---

## Estructura de la página de lista

```tsx
// src/app/(protected)/incidents/page.tsx
'use client';

export default function IncidentsPage() {
  // 1. State de UI
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);

  // 2. Query de datos (lista)
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.incidents.list({ page, search }),
    queryFn: () => apiClient.get<PaginatedResponse<Incident>>('/incidents', { page, search }),
    placeholderData: keepPreviousData,
  });

  // 3. Query de mapa (solo cuando viewMode === 'map')
  const { data: mapData } = useQuery({
    queryKey: queryKeys.incidents.map(mapBounds),
    queryFn: () => apiClient.get<IncidentFeatureCollection>('/incidents/map', mapBounds),
    enabled: viewMode === 'map' && !!mapBounds,
  });

  // 4. Mutaciones
  const createMutation = useMutation({ ... });
  const deleteMutation = useMutation({ ... });

  // 5. Columnas de tabla
  const columns = useIncidentColumns({
    onView: (id) => router.push(`/incidents/${id}`),
    onEdit: (incident) => { setEditingIncident(incident); setFormOpen(true); },
    onDelete: (id) => deleteMutation.mutate(id),
  });

  // 6. Render
  return (
    <div>
      <PageHeader title="Incidentes" icon={AlertTriangle} description="..." />

      <KpiCardsRow data={data} />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onNew={() => { setEditingIncident(null); setFormOpen(true); }}
        hasMapToggle={true}  // ← habilita el toggle Lista/Mapa
      />

      {viewMode === 'list' ? (
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          pagination={{ page, pageSize: 50, total: data?.pagination.total ?? 0, onPageChange: setPage }}
        />
      ) : (
        <IncidentMap
          features={mapData?.features ?? []}
          onBoundsChange={setMapBounds}
          onMarkerClick={(id) => router.push(`/incidents/${id}`)}
        />
      )}

      <IncidentFormModal
        open={formOpen}
        incident={editingIncident}
        onClose={() => { setFormOpen(false); setEditingIncident(null); }}
      />
    </div>
  );
}
```

---

## KPI Cards estándar para incidentes

```tsx
<KpiCardsRow>
  <KpiCard label="Total" value={data?.pagination.total} icon={AlertTriangle} />
  <KpiCard label="Abiertos" value={data?.summary.open} icon={AlertCircle} accent="red" />
  <KpiCard label="En proceso" value={data?.summary.inProgress} icon={Clock} accent="yellow" />
  <KpiCard label="Cerrados" value={data?.summary.closed} icon={CheckCircle} accent="green" />
</KpiCardsRow>
```

---

## Column definition estándar

```typescript
export function useIncidentColumns({ onView, onEdit, onDelete }: IncidentColumnCallbacks) {
  return useMemo<ColumnDef<Incident>[]>(() => [
    {
      accessorKey: 'incidentType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      size: 150,
      meta: { label: 'Tipo', icon: Tag },
    },
    {
      accessorKey: 'occurredAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => formatDate(row.original.occurredAt),
      size: 120,
      meta: { label: 'Fecha', icon: Calendar, responsive: true },
    },
    {
      accessorKey: 'propertyName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Predio" />,
      size: 200,
      meta: { label: 'Predio', icon: MapPin, responsive: true },
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <IncidentStatusBadge status={row.original.status} />,
      size: 100,
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onView(row.original.externalId)}>
              Ver detalle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => onDelete(row.original.externalId)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [onView, onEdit, onDelete]);
}
```
