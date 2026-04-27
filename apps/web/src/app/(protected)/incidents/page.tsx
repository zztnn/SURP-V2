'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  Calendar,
  FileText,
  Gauge,
  Hash,
  MapPin,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { DataListView } from '@/components/data-list-view';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { IncidentRowActions } from '@/components/incidents/incident-row-actions';
import { ListToolbar } from '@/components/list-toolbar';
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
import { Textarea } from '@/components/ui/textarea';
import { useEffectiveActionMenuStyle } from '@/hooks/use-effective-action-menu-style';
import {
  useCatalogAreas,
  useCatalogIncidentTypes,
  useCatalogProperties,
  useCatalogZones,
  useIncidents,
  useVoidIncident,
} from '@/hooks/use-incidents';
import { useListPageState } from '@/hooks/use-list-page-state';

import type {
  IncidentListFilters,
  IncidentListItem,
  IncidentSemaforo,
  IncidentState,
} from '@/types/incidents';

const STATE_LABELS: Record<IncidentState, string> = {
  draft: 'Borrador',
  active: 'Activo',
  voided: 'Anulado',
};

const SEMAFORO_LABELS: Record<IncidentSemaforo, string> = {
  no_determinado: 'Sin determinar',
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
};

const STATE_BADGE_CLASS: Record<IncidentState, string> = {
  draft: 'bg-amber-500 text-white hover:bg-amber-600',
  active: 'bg-emerald-600 text-white hover:bg-emerald-700',
  voided: 'bg-zinc-500 text-white hover:bg-zinc-600',
};

const SEMAFORO_DOT_CLASS: Record<IncidentSemaforo, string> = {
  no_determinado: 'bg-muted-foreground',
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-destructive',
};

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
  const voidMutation = useVoidIncident();
  const [pendingVoid, setPendingVoid] = useState<IncidentListItem | null>(null);
  const [voidReasonDraft, setVoidReasonDraft] = useState('');

  const handleConfirmVoid = (): void => {
    if (!pendingVoid) {
      return;
    }
    if (voidReasonDraft.trim().length < 10) {
      toast.error('La razón debe tener al menos 10 caracteres');
      return;
    }
    const target = pendingVoid;
    voidMutation.mutate(
      { externalId: target.externalId, voidReason: voidReasonDraft.trim() },
      {
        onSuccess: () => {
          toast.success(`Incidente ${target.correlativeCode ?? ''} anulado`);
          setPendingVoid(null);
          setVoidReasonDraft('');
        },
        onError: (e) => {
          toast.error(`No se pudo anular: ${e.message}`);
        },
      },
    );
  };

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
              setPendingVoid(i);
              setVoidReasonDraft('');
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
          placeholder="Contiene: 'Patente'…"
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
      />

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

      <AlertDialog
        open={pendingVoid !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingVoid(null);
            setVoidReasonDraft('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular incidente</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingVoid
                ? `Vas a anular el incidente ${pendingVoid.correlativeCode ?? ''}. El correlativo se mantiene ocupado (no se libera el número). La razón quedará registrada en el historial del informe.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="void-reason">Razón de anulación (mínimo 10 caracteres)</Label>
            <Textarea
              id="void-reason"
              value={voidReasonDraft}
              onChange={(e) => {
                setVoidReasonDraft(e.target.value);
              }}
              rows={3}
              placeholder="Ej: Reporte duplicado, evento ya registrado en informe previo"
              disabled={voidMutation.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmVoid}
              disabled={voidMutation.isPending || voidReasonDraft.trim().length < 10}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {voidMutation.isPending ? 'Anulando…' : 'Anular incidente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
