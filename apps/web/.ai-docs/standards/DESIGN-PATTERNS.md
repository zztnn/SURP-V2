# Design Patterns — SURP 2.0 (apps/web)

> Define los patrones usados en el frontend. NO mezclar patrones.
> NO introducir patrones nuevos sin actualizar este archivo.

---

## 1. Entity Page Pattern

Cada módulo CRUD sigue la misma estructura.

**Split de archivos:**

| Concern | File | Export |
|---------|------|--------|
| Validator + constants | `src/lib/validators/{entity}.ts` | `{entity}FormSchema`, constants |
| Column definitions | `src/components/tables/columns/{entity}-columns.tsx` | `use{Entity}Columns()` |
| Form fields | `src/components/forms/{entity}-form.tsx` | `{Entity}FormFields` |
| List page | `src/app/(protected)/{category}/{entity}/page.tsx` | default (Next.js) |
| Detail page | `src/app/(protected)/{category}/{entity}/[id]/page.tsx` | default (Next.js) |
| Map page | `src/app/(protected)/{category}/{entity}/map/page.tsx` | default (solo si es geo) |

**Page anatomy (orden de render):**

1. `PageHeader` — ícono + título + descripción
2. `KpiCardsRow` — 4 KPI cards con click-to-filter
3. `ListToolbar` — search + filter dropdowns + toggle Lista/Mapa (si aplica)
4. `DataListView` — tabla o mapa + paginación + estados empty/error
5. `EntityFormModal` — diálogo de create/edit (RHF + Zod)
6. `ConfirmDialog` — confirmación de delete/close

**State management:**

| Data | Tool | Location |
|------|------|----------|
| Server data (API) | TanStack Query | `useQuery` / `useMutation` en page |
| Global UI (sidebar, tema) | Zustand | `src/stores/` |
| Form data | React Hook Form + Zod | Page es dueña de `useForm()` |
| URL state (pagination, filters) | `useSearchParams` | Page component |
| Local UI (modal, search) | `useState` | Page component |

---

## 2. Map View Pattern (específico de SURP)

Para módulos geoespaciales (incidentes, predios, patrullajes):

### Toggle Lista / Mapa

```typescript
const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
```

En el `ListToolbar`:
```tsx
<ToggleGroup value={viewMode} onValueChange={(v) => v && setViewMode(v as 'list' | 'map')}>
  <ToggleGroupItem value="list" aria-label="Vista lista">
    <List className="h-4 w-4" />
  </ToggleGroupItem>
  <ToggleGroupItem value="map" aria-label="Vista mapa">
    <Map className="h-4 w-4" />
  </ToggleGroupItem>
</ToggleGroup>
```

### Queries separadas por vista

```typescript
// Vista lista: paginada
const { data: listData } = useQuery({
  queryKey: queryKeys.incidents.list(params),
  queryFn: () => apiClient.get('/incidents', params),
  enabled: viewMode === 'list',
});

// Vista mapa: FeatureCollection filtrada por bounding box
const { data: mapData } = useQuery({
  queryKey: queryKeys.incidents.map(mapBounds),
  queryFn: () => apiClient.get('/incidents/map', { bounds: mapBounds }),
  enabled: viewMode === 'map',
  staleTime: 30_000, // el mapa no necesita refetch frecuente
});
```

### Componente `<IncidentMap>`

```tsx
import dynamic from 'next/dynamic';

const IncidentMap = dynamic(
  () => import('@/components/maps/incident-map'),
  { ssr: false, loading: () => <MapSkeleton /> }
);

// Uso
<IncidentMap
  features={mapData?.features ?? []}
  onMarkerClick={(externalId) => setSelectedIncident(externalId)}
  onBoundsChange={setMapBounds}
/>
```

### Icono del marcador por tipo de incidente

```typescript
const INCIDENT_TYPE_ICONS: Record<IncidentType, string> = {
  theft: '🔴',
  fire: '🟠',
  illegal_logging: '🟤',
  intrusion: '🟡',
  occupation: '🟣',
  other: '⚫',
};
```

---

## 3. Shared Composable Components

| Component | File | Purpose |
|-----------|------|---------|
| `EntityCard` | `src/components/entity-card.tsx` | Card shell con avatar, badges, acciones |
| `KpiCard` | `src/components/kpi-card.tsx` | Métrica clickeable con borde accent |
| `ListToolbar` | `src/components/list-toolbar.tsx` | Search + filter + toggle vista |
| `DataListView` | `src/components/data-list-view.tsx` | Toggle table/card, paginación, empty/error |
| `EntityFormModal` | `src/components/entity-form-modal.tsx` | Wrapper de diálogo para forms create/edit |
| `PageHeader` | `src/components/page-header.tsx` | Título con ícono y descripción |
| `MapView` | `src/components/maps/map-view.tsx` | Wrapper de Leaflet (con ssr: false) |
| `CoordinateInput` | `src/components/forms/coordinate-input.tsx` | Input de lat/lng con mini-mapa |

---

## 4. API Integration Pattern

```typescript
// GET list
const { data } = useQuery({
  queryKey: queryKeys.incidents.list(params),
  queryFn: () => apiClient.get<PaginatedResponse<Incident>>('/incidents', params),
  ...QUERY_DEFAULTS.list,
});

// POST create
const createMutation = useMutation({
  mutationFn: (values: CreateIncidentPayload) =>
    apiClient.post<Incident>('/incidents', values),
  onSuccess: (data) => {
    surgicalUpdateListCache(queryClient, {
      detail: queryKeys.incidents.detail(data.externalId),
      list: queryKeys.incidents.all,
    }, data);
    toast.success('Incidente registrado exitosamente');
  },
});
```

---

## 5. Form Fields Extraction

```typescript
// src/components/forms/incident-form.tsx
export function IncidentFormFields({ form }: { form: UseFormReturn<IncidentFormValues> }) {
  return (
    <>
      <FormField control={form.control} name="incidentType" ... />
      <FormField control={form.control} name="occurredAt" ... />
      <CoordinateInput control={form.control} name="location" ... />
      <FormField control={form.control} name="propertyId" ... />
    </>
  );
}
```

---

## 6. FloatingActionBar — Universal

Todo formulario que guarda usa `<FloatingActionBar>`. Ver `standards/DESIGN-PATTERNS.md` del ERP para API completa. Resumen:

```tsx
<FloatingActionBar
  isVisible={isDirty && isValid}
  mode={isEditing ? 'edit' : 'create'}
  entityName="Incidente"
  onSubmit={form.handleSubmit(onSubmit)}
  onCancel={() => router.back()}
  isSubmitting={mutation.isPending}
/>
```

---

## 7. Anti-Patterns (NUNCA)

| Anti-Pattern | En su lugar |
|-------------|-------------|
| `useState` para datos de API | TanStack Query |
| `useEffect` para data fetching | TanStack Query |
| `<table>` HTML crudo | `<DataTable>` |
| `import L from 'leaflet'` en Server Component | `dynamic(() => import(...), { ssr: false })` |
| Sort client-side de lista paginada | Sort params al backend |
| Export síncrono directo | Async export 3-endpoint |
| Asterisco rojo `*` para requeridos | `<RequiredBadge />` |
| `new Intl.DateTimeFormat('en-GB', ...)` | `getLocaleConfig().locale` |
| `[lat, lng]` en GeoJSON | `[lng, lat]` (spec GeoJSON) |

---

## 8. Estructura de rutas

```
app/
├── (auth)/
│   └── login/page.tsx
└── (protected)/
    ├── layout.tsx                  ← layout con sidebar
    ├── dashboard/page.tsx
    ├── incidents/
    │   ├── page.tsx                ← lista de incidentes
    │   ├── map/page.tsx            ← vista mapa (si aplica)
    │   └── [id]/page.tsx           ← detalle de incidente
    ├── complaints/
    ├── cases/
    ├── persons/
    ├── vehicles/
    ├── fires/
    ├── maat/
    ├── surveillance/
    ├── statistics/
    └── catalog/
        ├── zones/
        ├── areas/
        ├── properties/
        └── incident-types/
```
