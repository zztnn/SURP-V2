# CREATE-LIST-PAGE — Receta paso a paso

> **Pre-requisito:** leer `standards/LIST-VIEW-STANDARD.md` antes de empezar.
> Este skill es la receta concreta; el estándar es el contrato.
>
> **Implementación de referencia:** módulo `incidents`. Esta receta replica
> exactamente esa estructura sustituyendo `incidents` por el nuevo módulo.

---

## Inventario de archivos a crear

Para un módulo nuevo `{module}` (ej: `complaints`, `cases`, `persons`):

| #   | Archivo                                                            | Rol                                                                                                |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | `src/types/{module}.ts`                                            | DTOs (`{Module}ListItem`, `{Module}Detail`, `{Module}ListFilters`, `{Module}ListResponse`) + enums |
| 2   | `src/hooks/use-{module}.ts`                                        | `use{Module}` (lista), `use{Module}Detail`, mutaciones, helpers de query string                    |
| 3   | `src/lib/{module}-format.ts`                                       | Labels + classes (state, severity, type, etc.)                                                     |
| 4   | `src/components/{module}/{module}-row-actions.tsx`                 | Acciones por fila (inline + dropdown via `useEffectiveActionMenuStyle`)                            |
| 5   | `src/components/{module}/{action}-{entity}-dialog.tsx` (si aplica) | Diálogo destructivo con razón obligatoria                                                          |
| 6   | `src/app/(protected)/{module}/page.tsx`                            | Listado completo                                                                                   |
| 7   | `src/app/(protected)/{module}/[externalId]/page.tsx`               | Detail page                                                                                        |
| 8   | (backend) `apps/api/src/modules/{module}/...`                      | Use cases + controller + repository — ver `apps/api/.ai-docs/skills/ADD-DOMAIN-MODULE.md`          |

---

## 1. Tipos — `src/types/{module}.ts`

Una sola fuente de verdad para los DTOs del módulo. Cualquier interfaz
referenciada por el listado, detail, hooks o componentes vive aquí.

```ts
export type {Module}State = 'draft' | 'active' | 'voided'; // ajustar al dominio

export interface {Module}ListItem {
  externalId: string;
  // ...campos visibles en lista
}

export interface {Module}ListResponse {
  items: readonly {Module}ListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface {Module}ListFilters {
  page?: number;
  pageSize?: number;
  // un campo por filtro del panel
  q?: string;
}

export interface {Module}Detail {
  externalId: string;
  // ...todos los campos del registro
}
```

---

## 2. Hooks — `src/hooks/use-{module}.ts`

Patrón canónico (ver `hooks/use-incidents.ts`):

```ts
'use client';
import { useMutation, useQuery, useQueryClient,
         type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { {Module}Detail, {Module}ListFilters,
              {Module}ListResponse } from '@/types/{module}';

function build{Module}Query(f: {Module}ListFilters): string {
  const params = new URLSearchParams();
  if (f.page !== undefined) params.set('page', String(f.page));
  if (f.pageSize !== undefined) params.set('pageSize', String(f.pageSize));
  // ...resto de filtros
  if (f.q !== undefined && f.q.length > 0) params.set('q', f.q);
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export function use{Module}(filters: {Module}ListFilters = {}):
  UseQueryResult<{Module}ListResponse> {
  return useQuery<{Module}ListResponse>({
    queryKey: ['{module}', 'list', filters],
    queryFn: () => apiClient.get<{Module}ListResponse>(
      `/{module}${build{Module}Query(filters)}`),
    staleTime: 15_000,
    placeholderData: (previous) => previous,  // ← MANDATORIO
  });
}

export function use{Module}Detail(externalId: string | null):
  UseQueryResult<{Module}Detail> {
  return useQuery<{Module}Detail>({
    queryKey: ['{module}', 'detail', externalId],
    queryFn: () => apiClient.get<{Module}Detail>(`/{module}/${externalId ?? ''}`),
    enabled: externalId !== null,
    staleTime: 15_000,
  });
}

// Mutaciones que invalidan ['{module}'] completo en onSuccess.
```

---

## 3. Format — `src/lib/{module}-format.ts`

Centralizar labels y classes humanas:

```ts
import type { {Module}State } from '@/types/{module}';

export const STATE_LABELS: Record<{Module}State, string> = {
  draft: 'Borrador',
  active: 'Activo',
  voided: 'Anulado',
};

export const STATE_BADGE_CLASS: Record<{Module}State, string> = {
  draft:  'bg-amber-500 text-white hover:bg-amber-600',
  active: 'bg-emerald-600 text-white hover:bg-emerald-700',
  voided: 'bg-zinc-500 text-white hover:bg-zinc-600',
};

// Catálogos cerrados de strings (severity, category, source) van aquí.
```

Si el módulo agrega un valor enum nuevo en el backend, este archivo es el
único que se actualiza para que toda la UI lo refleje.

---

## 4. Row actions — `src/components/{module}/{module}-row-actions.tsx`

Conmutador inline / dropdown idéntico al de incidents (ver
`incidents/incident-row-actions.tsx`). Mantener:

- `e?.stopPropagation()` en cada handler.
- `inline` con `<InlineActionCluster>` y `<InlineAction>`.
- `dropdown` con shadcn `<DropdownMenu>` y trigger `<MoreHorizontal>`.
- Disabled state cuando la acción no es válida (`canVoid = state === 'active'`).

Acciones típicas: Ver, Editar, Acción destructiva (Anular / Cerrar / Archivar).

---

## 5. Destructive dialog — `src/components/{module}/{action}-{entity}-dialog.tsx`

Aplica si la acción es irreversible o quasi-irreversible. Plantilla:

- Props: `target` (mínimo `externalId` + `correlativeCode | name`), `onClose`, `onAction?`.
- Estado interno: `reasonDraft` con validación de longitud mínima.
- Mutation con toast de éxito + handler de error.
- `<AlertDialog>` con título, descripción contextual, textarea de razón, botón rojo.

Referencia: `incidents/void-incident-dialog.tsx`.

---

## 6. Página de listado — `src/app/(protected)/{module}/page.tsx`

Esqueleto mínimo (replica `incidents/page.tsx`):

```tsx
'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, AlertTriangle /* + iconos por columna */ } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactElement } from 'react';

import { DataListView } from '@/components/data-list-view';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { {Module}RowActions } from '@/components/{module}/{module}-row-actions';
import { {Action}{Entity}Dialog, type {Action}{Entity}Target }
  from '@/components/{module}/{action}-{entity}-dialog';
import { ListToolbar } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useEffectiveActionMenuStyle } from '@/hooks/use-effective-action-menu-style';
import { use{Module} } from '@/hooks/use-{module}';
import { useListPageState } from '@/hooks/use-list-page-state';
import { STATE_BADGE_CLASS, STATE_LABELS } from '@/lib/{module}-format';

import type { {Module}ListFilters, {Module}ListItem } from '@/types/{module}';

function formatDateTime(iso: string): string {
  return format(new Date(iso), 'dd-MM-yyyy HH:mm', { locale: es });
}

export default function {Module}Page(): ReactElement {
  const router = useRouter();
  const actionMenuStyle = useEffectiveActionMenuStyle();
  const [pendingAction, setPendingAction] = useState<{Action}{Entity}Target | null>(null);

  const {
    page, setPage, pageSize, sorting, setSorting,
    filters, setFilter, removeFilter, clearAll,
    isOpen, togglePanel, activeFilters, hasActiveFilters,
    search, debouncedSearch, handleSearchChange,
  } = useListPageState({
    filterLabels: {
      // Mapear cada key de filtro a su etiqueta humana
    },
    search: { minLength: 2 },
  });

  // Resolver filtros raw → query parameters tipados
  const queryFilters: {Module}ListFilters = useMemo(() => ({
    page,
    pageSize,
    q: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    // ...mapear filters[k] a campos del DTO
  }), [page, pageSize, debouncedSearch, filters]);

  const query = use{Module}(queryFilters);
  const data = query.data?.items ?? [];
  const totalItems = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;

  // Resolver UUIDs → labels humanos para los chips activos
  const displayActiveFilters = useMemo(() => {
    return activeFilters.map((f) => {
      // ... resolver f.value cuando es UUID a label
      return f;
    });
  }, [activeFilters /* + catálogos */]);

  const columns = useMemo<ColumnDef<{Module}ListItem>[]>(() => {
    const actionsCol: ColumnDef<{Module}ListItem> = {
      id: 'actions',
      maxSize: actionMenuStyle === 'dropdown' ? 48 : 130,
      meta: { stickyRight: actionMenuStyle === 'dropdown', label: 'Acciones' },
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className={actionMenuStyle === 'dropdown' ? 'flex justify-center' : ''}>
          <{Module}RowActions
            item={row.original}
            onAction={(i) => {
              setPendingAction({ externalId: i.externalId, /* ... */ });
            }}
          />
        </div>
      ),
    };

    return [
      // ...columnas de dominio con meta.label + meta.icon + meta.responsive
      actionsCol,
    ];
  }, [actionMenuStyle]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Activity}
        title="..."
        description="..."
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchFields={[ /* nombres de columnas que la búsqueda matchea */ ]}
        searchPlaceholder="Buscar..."
        onRefresh={() => query.refetch()}
        isRefreshing={query.isFetching}
        showFilters={isOpen}
        onToggleFilters={togglePanel}
        hasActiveFilters={hasActiveFilters}
        activeFilters={displayActiveFilters}
        onRemoveFilter={removeFilter}
        onClearFilters={clearAll}
        filterContent={
          <>
            {/* JSX de los controls del panel: cascader, multiselect, etc. */}
          </>
        }
      />

      <DataListView<{Module}ListItem, unknown>
        data={data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        onRetry={() => query.refetch()}
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        itemLabel="..."
        onPageChange={setPage}
        columns={columns}
        sorting={sorting}
        onSortingChange={setSorting}
        renderCard={(item) => <div>{/* card layout */}</div>}
        onRowClick={(item) => {
          router.push(`/{module}/${item.externalId}`);
        }}
        emptyIcon={AlertTriangle}
        emptyTitle="Sin resultados"
        emptyDescription="No hay registros que coincidan con los filtros aplicados."
        // exportConfig={...} cuando aplique
        // exportLabel="Exportar..."
      />

      <{Action}{Entity}Dialog
        target={pendingAction}
        onClose={() => { setPendingAction(null); }}
      />
    </div>
  );
}
```

---

## 7. Detail page — `src/app/(protected)/{module}/[externalId]/page.tsx`

Ver `incidents/[externalId]/page.tsx` como referencia. Estructura:

- `useParams<{ externalId: string }>()` (destructurar — sin `?? null`).
- `use{Module}Detail(externalId)`.
- Loading → skeleton del header + cards.
- Error / no data → `<EmptyState>` con botón "Volver al listado".
- Header con `<PageHeader>` + acciones (Volver, Editar, Acción destructiva).
- Banner de estado terminal arriba si el registro está anulado/archivado/etc.
- Cards semánticas (Clasificación, Ubicación, Tiempo, Captura, etc.) con
  un `<FieldRow label="..." />` interno para alinear `dt`/`dd`.
- Reusar `<{Action}{Entity}Dialog>`.

---

## 8. Backend

Para que el frontend tenga datos reales:

1. Schema en `database/schema/` (ver convenciones del backend).
2. Use cases en `apps/api/src/modules/{module}/use-cases/` — ver
   `apps/api/.ai-docs/skills/ADD-DOMAIN-MODULE.md`.
3. Controller con endpoints `GET /{module}` (lista paginada con filtros) y
   `GET /{module}/:externalId` (detail).
4. Mutaciones requeridas (register, void, etc.) según dominio.

---

## Checklist final antes del PR

El checklist exhaustivo (categorizado por feature, con marcadores
`[M]` mandatorio / `[C]` condicional / `[O]` opcional) vive en
`standards/LIST-VIEW-STANDARD.md` → sección "Checklist de features".

**Copiá esa sección al cuerpo del PR** y marcá los items que correspondan
al alcance del módulo.

Quick gates antes de pedir review (no reemplaza al checklist completo):

- [ ] Lint + typecheck limpios (`pnpm check`).
- [ ] Probado en navegador: filtros, refresh, paginación, sort, click en fila,
      acción destructiva, modo cards, exports si aplica.
- [ ] Detail page existe y maneja loading, 404 / sin permiso, estado terminal.
- [ ] Mutaciones invalidan `['{module}']` y la lista refresca sola.
