'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Download,
  FileText,
  Gauge,
  Hash,
  MapPin,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactElement } from 'react';

import { DataListView } from '@/components/data-list-view';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { ExportIncidentsModal } from '@/components/incidents/export-incidents-modal';
import { IncidentRowActions } from '@/components/incidents/incident-row-actions';
import {
  VoidIncidentDialog,
  type VoidIncidentTarget,
} from '@/components/incidents/void-incident-dialog';
import { ListToolbar } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocationCascader, type LocationCascaderValue } from '@/components/ui/location-cascader';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEffectiveActionMenuStyle } from '@/hooks/use-effective-action-menu-style';
import { buildExportRequest, useCreateIncidentExport } from '@/hooks/use-incident-export';
import {
  useCatalogAreas,
  useCatalogIncidentTypes,
  useCatalogProperties,
  useCatalogZones,
  useIncidents,
} from '@/hooks/use-incidents';
import { useListPageState } from '@/hooks/use-list-page-state';
import {
  SEMAFORO_DOT_CLASS,
  SEMAFORO_LABELS,
  STATE_BADGE_CLASS,
  STATE_LABELS,
} from '@/lib/incidents-format';

import type { IncidentListFilters, IncidentListItem, IncidentSemaforo } from '@/types/incidents';

const ALL = '__all__';

function formatDateTime(iso: string): string {
  return format(new Date(iso), 'dd-MM-yyyy HH:mm', { locale: es });
}

function formatDateOnly(iso: string): string {
  return format(new Date(iso), 'dd-MM-yyyy', { locale: es });
}

export default function IncidentsPage(): ReactElement {
  const router = useRouter();

  const actionMenuStyle = useEffectiveActionMenuStyle();
  const [pendingVoid, setPendingVoid] = useState<VoidIncidentTarget | null>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportMutation = useCreateIncidentExport();

  const {
    page,
    setPage,
    pageSize,
    sorting,
    setSorting,
    filters,
    setFilter,
    removeFilter,
    clearAll,
    isOpen,
    togglePanel,
    activeFilters,
    hasActiveFilters,
    search,
    debouncedSearch,
    handleSearchChange,
  } = useListPageState({
    filterLabels: {
      zoneExternalId: 'Zona',
      areaExternalId: 'Área',
      propertyExternalId: 'Predio',
      incidentTypeExternalIds: 'Tipo',
      semaforo: 'Semáforo',
      dateRange: 'Fechas',
      personSearch: 'Persona',
      vehicleSearch: 'Vehículo',
    },
    search: { minLength: 0 },
    defaultSort: [{ id: 'occurredAt', desc: true }],
  });

  const zoneFilter = filters['zoneExternalId'] as string | undefined;
  const areaFilter = filters['areaExternalId'] as string | undefined;
  const propertyFilter = filters['propertyExternalId'] as string | undefined;
  const typeFilterRaw = filters['incidentTypeExternalIds'] as string[] | undefined;
  const typeFilter = useMemo<readonly string[]>(() => typeFilterRaw ?? [], [typeFilterRaw]);
  const semaforoFilter = filters['semaforo'] as IncidentSemaforo | undefined;
  const dateRangeFilter = (filters['dateRange'] as string | undefined) ?? '';
  const personSearchFilter = (filters['personSearch'] as string | undefined) ?? '';
  const vehicleSearchFilter = (filters['vehicleSearch'] as string | undefined) ?? '';

  const dateRangeValue: DateRangeValue = useMemo(() => {
    if (dateRangeFilter === '') {
      return { from: null, to: null };
    }
    // Formato canónico: `from|to` (ambos pueden ser cadena vacía).
    const [from = '', to = ''] = dateRangeFilter.split('|');
    return {
      from: from.length > 0 ? from : null,
      to: to.length > 0 ? to : null,
    };
  }, [dateRangeFilter]);

  const zonesQuery = useCatalogZones();
  const typesQuery = useCatalogIncidentTypes();
  // Cargamos los catálogos COMPLETOS (sin filtrar por zona/área) para que el
  // cascader pueda hacer búsqueda global cross-niveles. Los selectores
  // locales del cascader filtran en frontend según la zona/área en draft.
  const areasQuery = useCatalogAreas(null);
  const propertiesQuery = useCatalogProperties(null, null);

  // Mapas UUID → label legible para resolver los chips de filtros activos.
  // El hook genérico `useAdvancedFilters` no conoce estos catálogos, así que
  // sería el chip mostraría el `externalId` crudo.
  const zoneNameById = useMemo(
    () =>
      new Map((zonesQuery.data ?? []).map((z) => [z.externalId, `Z${z.shortCode} · ${z.name}`])),
    [zonesQuery.data],
  );
  const areaNameById = useMemo(
    () => new Map((areasQuery.data ?? []).map((a) => [a.externalId, a.name])),
    [areasQuery.data],
  );
  const propertyNameById = useMemo(
    () => new Map((propertiesQuery.data ?? []).map((p) => [p.externalId, p.name])),
    [propertiesQuery.data],
  );
  const typeNameById = useMemo(
    () => new Map((typesQuery.data ?? []).map((t) => [t.externalId, t.name])),
    [typesQuery.data],
  );

  const displayActiveFilters = useMemo(
    () =>
      activeFilters.map((f) => {
        switch (f.key) {
          case 'zoneExternalId':
            return { ...f, value: zoneNameById.get(f.value) ?? f.value };
          case 'areaExternalId':
            return { ...f, value: areaNameById.get(f.value) ?? f.value };
          case 'propertyExternalId':
            return { ...f, value: propertyNameById.get(f.value) ?? f.value };
          case 'incidentTypeExternalIds': {
            const labels = f.value
              .split(', ')
              .map((id) => typeNameById.get(id) ?? id)
              .join(', ');
            return { ...f, value: labels };
          }
          case 'semaforo': {
            const label = (SEMAFORO_LABELS as Record<string, string>)[f.value];
            return { ...f, value: label ?? f.value };
          }
          case 'dateRange': {
            const [from = '', to = ''] = f.value.split('|');
            const hasFrom = from.length > 0;
            const hasTo = to.length > 0;
            if (hasFrom && hasTo) {
              return { ...f, value: `${formatDateOnly(from)} → ${formatDateOnly(to)}` };
            }
            if (hasFrom) {
              return { ...f, value: `Desde ${formatDateOnly(from)}` };
            }
            if (hasTo) {
              return { ...f, value: `Hasta ${formatDateOnly(to)}` };
            }
            return f;
          }
          default:
            return f;
        }
      }),
    [activeFilters, zoneNameById, areaNameById, propertyNameById, typeNameById],
  );

  const apiFilters: IncidentListFilters = useMemo(() => {
    const f: IncidentListFilters = { page, pageSize };
    if (zoneFilter !== undefined) {
      f.zoneExternalId = zoneFilter;
    }
    if (areaFilter !== undefined) {
      f.areaExternalId = areaFilter;
    }
    if (propertyFilter !== undefined) {
      f.propertyExternalId = propertyFilter;
    }
    if (typeFilter.length > 0) {
      f.incidentTypeExternalIds = typeFilter;
    }
    if (semaforoFilter !== undefined) {
      f.semaforo = semaforoFilter;
    }
    if (dateRangeValue.from !== null) {
      f.occurredFrom = dateRangeValue.from;
    }
    if (dateRangeValue.to !== null) {
      f.occurredTo = dateRangeValue.to;
    }
    const trimmedSearch = debouncedSearch.trim();
    if (trimmedSearch.length > 0) {
      f.q = trimmedSearch;
    }
    if (personSearchFilter.length > 0) {
      f.personSearch = personSearchFilter;
    }
    if (vehicleSearchFilter.length > 0) {
      f.vehicleSearch = vehicleSearchFilter;
    }
    return f;
  }, [
    page,
    pageSize,
    zoneFilter,
    areaFilter,
    propertyFilter,
    typeFilter,
    semaforoFilter,
    dateRangeValue.from,
    dateRangeValue.to,
    debouncedSearch,
    personSearchFilter,
    vehicleSearchFilter,
  ]);

  const { data, isLoading, isFetching, isError, refetch } = useIncidents(apiFilters);

  const handleExport = (): void => {
    setExportJobId(null);
    setExportError(null);
    setExportModalOpen(true);
    exportMutation.mutate(buildExportRequest(apiFilters), {
      onSuccess: ({ externalId }) => {
        setExportJobId(externalId);
      },
      onError: (e) => {
        setExportError(e.message);
      },
    });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const columns = useMemo<ColumnDef<IncidentListItem>[]>(() => {
    const actionsCol: ColumnDef<IncidentListItem> = {
      id: 'actions',
      enableSorting: false,
      size: actionMenuStyle === 'dropdown' ? 48 : 130,
      maxSize: actionMenuStyle === 'dropdown' ? 48 : 130,
      meta: { stickyRight: actionMenuStyle === 'dropdown', label: 'Acciones' },
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className={actionMenuStyle === 'dropdown' ? 'flex justify-center' : ''}>
          <IncidentRowActions
            incident={row.original}
            onVoid={(i) => {
              setPendingVoid({ externalId: i.externalId, correlativeCode: i.correlativeCode });
            }}
          />
        </div>
      ),
    };

    const dataCols: ColumnDef<IncidentListItem>[] = [
      {
        id: 'correlativeCode',
        accessorKey: 'correlativeCode',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Folio" />,
        cell: ({ row }) => (
          <Link
            href={`/incidents/${row.original.externalId}`}
            className="font-mono text-sm font-semibold text-primary hover:underline"
          >
            {row.original.correlativeCode ?? '—'}
          </Link>
        ),
        size: 140,
        meta: { label: 'Folio', icon: Hash },
      },
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ocurrido" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{formatDateTime(row.original.occurredAt)}</span>
        ),
        size: 150,
        meta: { label: 'Ocurrido', icon: Calendar },
      },
      {
        id: 'incidentTypeName',
        accessorKey: 'incidentTypeName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => (
          <span className="text-sm" title={row.original.incidentTypeCode}>
            {row.original.incidentTypeName}
          </span>
        ),
        size: 180,
        meta: { label: 'Tipo', icon: Tag },
      },
      {
        id: 'zone',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Zona / Predio" />,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                Z{row.original.zoneShortCode}
              </Badge>
              <span className="text-xs text-muted-foreground">{row.original.zoneName}</span>
            </div>
            {(row.original.propertyName ?? row.original.areaName) !== null && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {row.original.propertyName ?? row.original.areaName}
              </span>
            )}
          </div>
        ),
        size: 200,
        meta: { responsive: true, label: 'Zona / Predio', icon: MapPin },
      },
      {
        id: 'state',
        accessorKey: 'state',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }) => (
          <Badge className={STATE_BADGE_CLASS[row.original.state]}>
            {STATE_LABELS[row.original.state]}
          </Badge>
        ),
        size: 130,
        meta: { label: 'Estado', icon: Activity },
      },
      {
        id: 'semaforo',
        accessorKey: 'semaforo',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Semáforo" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEMAFORO_DOT_CLASS[row.original.semaforo]}`}
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              {SEMAFORO_LABELS[row.original.semaforo]}
            </span>
          </div>
        ),
        size: 140,
        meta: { responsive: true, label: 'Semáforo', icon: Gauge },
      },
      {
        id: 'descriptionExcerpt',
        accessorKey: 'descriptionExcerpt',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
        cell: ({ row }) => (
          <span
            className="line-clamp-2 max-w-md text-xs text-muted-foreground"
            title={row.original.descriptionExcerpt}
          >
            {row.original.descriptionExcerpt}
          </span>
        ),
        size: 240,
        meta: { flex: true, responsive: true, label: 'Descripción', icon: FileText },
      },
    ];

    // Inline → primera columna (acciones a la izquierda).
    // Dropdown → última columna sticky a la derecha.
    return actionMenuStyle === 'inline' ? [actionsCol, ...dataCols] : [...dataCols, actionsCol];
  }, [actionMenuStyle]);

  const typeOptions: MultiSelectOption[] = useMemo(
    () =>
      (typesQuery.data ?? []).map((t) => ({
        value: t.externalId,
        label: t.name,
      })),
    [typesQuery.data],
  );

  const handleLocationChange = (next: LocationCascaderValue): void => {
    if (next.zoneExternalId === null) {
      removeFilter('zoneExternalId');
    } else {
      setFilter('zoneExternalId', next.zoneExternalId);
    }
    if (next.areaExternalId === null) {
      removeFilter('areaExternalId');
    } else {
      setFilter('areaExternalId', next.areaExternalId);
    }
    if (next.propertyExternalId === null) {
      removeFilter('propertyExternalId');
    } else {
      setFilter('propertyExternalId', next.propertyExternalId);
    }
  };

  const handleDateRangeChange = (next: DateRangeValue): void => {
    if (next.from === null && next.to === null) {
      removeFilter('dateRange');
      return;
    }
    setFilter('dateRange', `${next.from ?? ''}|${next.to ?? ''}`);
  };

  const filterContent = (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Rango de fechas</Label>
        <DateRangePicker value={dateRangeValue} onChange={handleDateRangeChange} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tipo (Delito)</Label>
        <MultiSelect
          options={typeOptions}
          value={typeFilter}
          onChange={(next) => {
            setFilter('incidentTypeExternalIds', [...next]);
          }}
          placeholder="Todos"
          searchPlaceholder="Buscar tipo…"
          emptyText="Sin tipos"
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs">Ubicación</Label>
        <LocationCascader
          value={{
            zoneExternalId: zoneFilter ?? null,
            areaExternalId: areaFilter ?? null,
            propertyExternalId: propertyFilter ?? null,
          }}
          onChange={handleLocationChange}
          zones={zonesQuery.data ?? []}
          areas={areasQuery.data ?? []}
          properties={propertiesQuery.data ?? []}
          placeholder="Cualquier zona, área o predio"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Semáforo</Label>
        <Select
          value={semaforoFilter ?? ALL}
          onValueChange={(v) => {
            if (v === ALL) {
              removeFilter('semaforo');
            } else {
              setFilter('semaforo', v);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {Object.entries(SEMAFORO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEMAFORO_DOT_CLASS[k as IncidentSemaforo]}`}
                    aria-hidden
                  />
                  {v}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Personas</Label>
        <Input
          value={personSearchFilter}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length === 0) {
              removeFilter('personSearch');
            } else {
              setFilter('personSearch', v);
            }
          }}
          placeholder="Contiene: 'Rut', 'Nombre'…"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Vehículos</Label>
        <Input
          value={vehicleSearchFilter}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length === 0) {
              removeFilter('vehicleSearch');
            } else {
              setFilter('vehicleSearch', v);
            }
          }}
          placeholder="Contiene: 'PPU'…"
          autoComplete="off"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        icon={AlertTriangle}
        title="Incidentes"
        description="Informes de hechos contra el patrimonio forestal"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exportMutation.isPending}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Excel
        </Button>
      </PageHeader>

      <ListToolbar
        onNew={() => {
          router.push('/incidents/new');
        }}
        newLabel="Registrar incidente"
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Buscar en folio, descripción, zona, área, predio…"
        onRefresh={() => {
          void refetch();
        }}
        isRefreshing={isFetching}
        showFilters={isOpen}
        onToggleFilters={togglePanel}
        hasActiveFilters={hasActiveFilters}
        activeFilterCount={activeFilters.length}
        onClearFilters={clearAll}
        activeFilters={displayActiveFilters}
        onRemoveFilter={removeFilter}
        filterContent={filterContent}
      />

      <DataListView
        data={data?.items ? [...data.items] : []}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        onRetry={() => {
          void refetch();
        }}
        page={page}
        totalPages={totalPages}
        totalItems={data?.total ?? 0}
        itemLabel="incidentes"
        onPageChange={setPage}
        columns={columns}
        sorting={sorting}
        onSortingChange={setSorting}
        emptyIcon={AlertTriangle}
        emptyTitle="Sin incidentes"
        emptyDescription="No hay incidentes que coincidan con los filtros aplicados."
      />

      <VoidIncidentDialog
        target={pendingVoid}
        onClose={() => {
          setPendingVoid(null);
        }}
      />

      <ExportIncidentsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        jobExternalId={exportJobId}
        createError={exportError}
      />
    </div>
  );
}
