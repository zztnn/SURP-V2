# LIST-VIEW-STANDARD — Estándar mínimo para páginas-lista

> **Lectura obligatoria** antes de tocar cualquier `app/(protected)/{module}/page.tsx`
> que renderice un listado paginado.
>
> **Implementación de referencia:** `app/(protected)/incidents/page.tsx` + su detail
> `app/(protected)/incidents/[externalId]/page.tsx`. Cualquier listado nuevo (causas,
> denuncias, personas, vehículos, predios, bloqueos, seguimientos, etc.) replica
> esta estructura. Las **diferencias** justificadas por el dominio se documentan
> en el header del archivo, no se omiten silenciosamente.

---

## Por qué este estándar

La URP de Arauco va a operar **diariamente** una decena de listados (incidentes,
denuncias, causas, personas, vehículos, predios, bloqueos, seguimientos, fuegos,
maat, etc.). Si cada listado tiene su propio sabor de filtros, paginación,
exports, refetch y acciones, el usuario sufre la inconsistencia en cada click.

Este documento define el contrato mínimo. La consistencia visual y de
comportamiento entre listados **no** es opcional — es la promesa más barata
y de mayor retorno que tiene el frontend.

---

## Piezas mandatorias (toda lista debe tenerlas)

### 1. Estructura de la página

```tsx
'use client';

export default function {Module}Page(): ReactElement {
  // 1. State canónico de lista
  const { page, setPage, pageSize, sorting, setSorting,
          filters, setFilter, removeFilter, clearAll,
          isOpen, togglePanel, activeFilters, hasActiveFilters,
          search, debouncedSearch, handleSearchChange } = useListPageState({
    filterLabels: { /* clave → etiqueta humana */ },
    search: { minLength: 2 },
  });

  // 2. Query principal con TanStack Query v5
  const query = use{Module}({ page, pageSize, sorting, ...filters, q: debouncedSearch });

  // 3. Catálogos auxiliares (opt-in según el dominio)
  const zonesQuery = useCatalogZones();
  // ...

  // 4. Columnas de tabla (con icon en meta)
  const columns = useMemo<ColumnDef<{Module}ListItem>[]>(() => [...], [/* deps */]);

  // 5. Render
  return (
    <div className="space-y-4">
      <PageHeader icon={Activity} title="..." description="..." />
      <ListToolbar { ...search, refresh, filters, activeFilters... } />
      <DataListView { ...data, columns, isFetching, exportConfig... } />
      <{Module}DestructiveDialog ... />     {/* si hay acciones destructivas */}
    </div>
  );
}
```

### 2. Estado canónico — `useListPageState`

Todo listado consume `@/hooks/use-list-page-state`. Provee:

| Pieza                                             | Significado                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `page` / `setPage`                                | Página actual (1-indexed). El hook NO la persiste a URL hoy.                     |
| `pageSize`                                        | Lee del store de preferencias (`list-preferences-store`). NO se pasa por prop.   |
| `sorting`                                         | `SortingState` de TanStack Table. Server-side (se manda al backend).             |
| `filters` + helpers                               | API de filtros avanzados con activeFilters, chips removibles, panel open/closed. |
| `search`, `debouncedSearch`, `handleSearchChange` | **opt-in** vía `search: { minLength, debounceMs }`.                              |

**Prohibido** crear `useState<filterState>` paralelo. Si necesitas un filtro
nuevo, se agrega en `filterLabels` y se setea con `setFilter(key, value)`.

### 3. Toolbar — `<ListToolbar>`

Single source of truth para search + refresh + filtros + chips. **No** se
duplican esos controles en otros lugares de la página. Forwardea:

- `searchValue`, `onSearchChange` ← bindeados a `search` / `handleSearchChange`.
- `searchFields` (string[]) — nombres de columnas que la búsqueda matchea, para el chip.
- `searchPlaceholder` — específico del módulo.
- `onRefresh` ← `query.refetch()`.
- `isRefreshing` ← `query.isFetching` (NO `isLoading`).
- `showFilters`, `onToggleFilters` ← `isOpen`, `togglePanel`.
- `hasActiveFilters`, `activeFilters`, `onRemoveFilter`, `onClearFilters`.
- `filterContent` — JSX con los `<Label>` + controls del panel (cascader, multiselect, dateRange, select, etc.).

### 4. Vista — `<DataListView>`

Renderiza tabla **o** cards (toggle persistido en `list-preferences-store`).
Toda lista nueva pasa los siguientes props:

| Prop                                          | Origen / regla                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                                        | `query.data?.items ?? []`                                                                                                                                              |
| `isLoading`                                   | `query.isLoading` (TanStack v5 — true SOLO en la primera carga sin data previa)                                                                                        |
| `isFetching`                                  | `query.isFetching` (true en refetch / page change / filter change con data previa)                                                                                     |
| `isError`                                     | `query.isError`                                                                                                                                                        |
| `onRetry`                                     | `() => query.refetch()`                                                                                                                                                |
| `page`, `totalPages`, `totalItems`            | derivado de la respuesta paginada                                                                                                                                      |
| `columns`                                     | con `meta.label`, `meta.icon`, `meta.responsive`, `meta.stickyRight` para acciones                                                                                     |
| `renderCard`                                  | función que renderiza la card del item (modo cards). **Mandatorio** — toda lista nueva soporta cards.                                                                  |
| `exportConfig`                                | si la lista exporta (lo normal). Provee `title`, `columns`, `fetchAllData?`. Activa botones Excel + PDF en el toolbar de paginación. Ver `skills/ADD-ASYNC-EXPORT.md`. |
| `exportLabel`                                 | obligatorio cuando hay export (`"Exportar incidentes"`, `"Exportar denuncias"`).                                                                                       |
| `emptyIcon`, `emptyTitle`, `emptyDescription` | todos en español, específicos al dominio.                                                                                                                              |

### 5. Acciones por fila

Las acciones por fila usan `<{Module}RowActions>` (ej: `IncidentRowActions`)
que internamente conmuta `useEffectiveActionMenuStyle()`:

- `inline`: cluster de íconos (Eye, Pencil, Ban, etc.) que aparece atenuado y
  se ilumina al hover de la fila. Usado en desktop.
- `dropdown`: trigger `⋯` que abre menú contextual. Usado en viewports angostos
  o cuando el usuario lo prefiere (preferencia del store).

La columna `actions` lleva `meta.stickyRight: actionMenuStyle === 'dropdown'`
(solo el dropdown se hace sticky para no entorpecer scroll horizontal).

**Click en la fila ≠ click en una acción.** Las acciones llaman
`e?.stopPropagation()`. El click en zona muerta de la fila navega al detail.

### 6. Página de detalle

Toda lista cuyo dominio tenga representación atómica (incidente, denuncia,
causa, persona, vehículo, predio, bloqueo, seguimiento) provee
`/{module}/[externalId]/page.tsx`:

- `useParams<{ externalId: string }>()` para tomar el ID.
- `use{Module}(externalId)` (TanStack Query, staleTime configurado).
- Estados: `isLoading` → skeleton, `isError || !data` → `<EmptyState>` con
  icon, mensaje y botón "Volver al listado".
- Header con `<PageHeader>` + acciones (Volver, Editar, acciones destructivas).
- Body como **cards** semánticas (no tabs vacíos para placeholders futuros).
- Banner amarillo arriba si el registro está en estado terminal (anulado,
  archivado, cerrado, cancelado).

Referencia: `app/(protected)/incidents/[externalId]/page.tsx`.

### 7. Diálogos destructivos

Las acciones que cambian estado de forma irreversible o quasi-irreversible
(anular, cerrar, eliminar lógicamente) viven en componentes propios:
`components/{module}/{action}-{entity}-dialog.tsx`. **No** embebidos en la
página. Razones:

- Reuso entre listado y detalle.
- Aislar la mutación + el estado de form (motivo, confirmación, etc.).
- Test unitario más limpio.

Ejemplo: `components/incidents/void-incident-dialog.tsx`.

### 8. Tipos y hooks

| Archivo                  | Contenido                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `types/{module}.ts`      | DTOs (`{Module}ListItem`, `{Module}Detail`, `{Module}ListFilters`, `{Module}ListResponse`) + enums del dominio.       |
| `hooks/use-{module}.ts`  | `use{Module}`, `use{Module}Detail`, mutaciones (`useCreate{Module}`, `useUpdate{Module}`, `useVoid{Module}`).         |
| `lib/{module}-format.ts` | Labels y clases (`STATE_LABELS`, `STATE_BADGE_CLASS`, `XX_DOT_CLASS`, etc.) compartidas entre listado, detail y form. |

---

## Piezas condicionales

### Cascada Zona → Área → Predio

Todo módulo cuyo dominio toque ubicación territorial Arauco usa
`<LocationCascader>` (`components/ui/location-cascader.tsx`):

- Carga catálogos completos (`useCatalogAreas(null)`, `useCatalogProperties(null, null)`).
- El cascader filtra localmente por el path seleccionado y soporta búsqueda
  global por **nombre o código** en zonas, áreas y predios.
- Un solo `value: { zoneExternalId, areaExternalId, propertyExternalId }`
  controlado, un solo `onChange`. **Prohibido** los 3 selects independientes.

### Multi-select

Catálogos cerrados (tipos de incidente, agravantes, perfiles, etc.) usan
`<MultiSelect>` (`components/ui/multi-select.tsx`) con `MultiSelectOption[]`
y `value: string[]`.

### Rango de fechas

Filtros temporales (`occurredAt`, `reportedAt`, `formalizadoEn`) usan
`<DateRangePicker>` (`components/ui/date-range-picker.tsx`) que devuelve
`{ from?: string; to?: string }` con strings ISO.

### Búsquedas dirigidas (persona, vehículo)

Cuando el dominio justifica búsquedas separadas por entidad (RUT del imputado,
PPU del vehículo), van como filtros propios (`personSearch`, `vehicleSearch`)
con `<Input>` controlado, debounce manual o vía `useDebounce` y placeholder
`"Contiene: 'RUT'…"` / `"Contiene: 'PPU'…"`.

> Recordatorio: la patente vehicular se llama **PPU** en la UI, nunca "Patente".
> Ver memoria de proyecto.

### Exports Excel + PDF

`exportConfig` con `fetchAllData` que llama al endpoint con `pageSize=10000`
o a un endpoint dedicado de export. **Nunca** exportar solo la página visible.
Ver `skills/ADD-ASYNC-EXPORT.md`.

### KPI cards arriba del listado

Solo si el dominio tiene métricas operativas accionables que cambian la
decisión del usuario (cuántos incidentes con semáforo rojo abiertos, cuántas
causas en formalización pendientes, cuántos bloqueos activos). **No** agregar
KPIs decorativos.

---

## Contrato de comportamiento (no negociable)

### Loading vs refetch

Sólo se muestran skeletons **en la primera carga sin data previa**
(`isLoading === true`). Cualquier refetch posterior (cambio de filtro,
cambio de página, click en refresh) deja la tabla visible y muestra:

1. Una **barra indeterminada** sobre el header de la tabla (`isFetching === true`).
2. Un **overlay translúcido** sobre el body con `bg-background/30 backdrop-blur-[1px]`.
3. La paginación queda interactiva.

Esto está implementado en `<DataListView>` — basta pasar `isFetching` correctamente.

> **Anti-pattern crítico:** usar `isLoading` para el botón de refresh o para
> mostrar feedback visual del refetch. `isLoading` solo es `true` la primera
> carga. Para todo lo demás, `isFetching`.

### Reset a página 1

Cualquier cambio de filtro, búsqueda o sort vuelve a `page=1`. El hook
`useListPageState` lo hace automáticamente para la búsqueda; los filtros
se hacen explícitamente en el handler:

```tsx
const handleZoneChange = (zoneExternalId: string | null) => {
  if (zoneExternalId === null) removeFilter('zoneExternalId');
  else setFilter('zoneExternalId', zoneExternalId);
  setPage(1);
};
```

### `placeholderData: previous`

La query principal **siempre** usa `placeholderData: (prev) => prev` para
mantener la data anterior visible durante el refetch. Sin esto, el overlay
no tiene nada que cubrir.

### Chips legibles, nunca UUID

Los `activeFilters` se mapean a labels humanos antes de pasarlos al toolbar.
Ej: `zoneExternalId: "8b1f-..."` → chip `Zona: Cordillera`. La resolución
se hace en un `useMemo` que depende de los catálogos cargados.

### Localización chilena

- Fechas en formato `dd-MM-yyyy [HH:mm]`, locale `es` de date-fns.
- Validación RUT módulo 11 cuando aplique (`personSearch` puede ser RUT parcial).
- PPU en lugar de "Patente" (memoria del proyecto).
- Coordenadas WGS84 decimales `-37.461700, -72.355200`.

### Acciones destructivas con confirmación

Anular, cerrar, eliminar lógicamente: dialog con razón obligatoria
(mínimo 10 caracteres), botón rojo, mutation con `isPending` que deshabilita
el confirm. Toast de éxito con identificador legible (correlativo, código).
Ver `void-incident-dialog.tsx`.

### TanStack Query — disciplina

- `staleTime` específico por dominio (15 s para listas operativas, 5 min para catálogos).
- `enabled` cuando el query depende de un parámetro que puede ser null.
- Mutaciones invalidan `['{module}']` completo en `onSuccess` para que el
  listado se refresque sin que el usuario lo pida.
- **Prohibido** `useEffect + fetch` para cargar datos. Ver `USE-EFFECT-POLICY.md`.

---

## Layout de archivos

```
apps/web/src/
├── app/(protected)/{module}/
│   ├── page.tsx                       — listado (este estándar)
│   └── [externalId]/page.tsx          — detail
├── components/{module}/
│   ├── {module}-row-actions.tsx       — inline + dropdown action cluster
│   ├── {action}-{entity}-dialog.tsx   — diálogos destructivos / acción
│   └── {module}-card.tsx?             — render de card si es complejo
├── hooks/
│   └── use-{module}.ts                — queries + mutations + catálogos relevantes
├── lib/
│   └── {module}-format.ts             — labels y clases compartidas
└── types/
    └── {module}.ts                    — DTOs y enums del módulo
```

---

## Checklist de features

> **Cómo usar:** copiá esta sección al PR descriptivo o a tu lista de tareas
> al empezar un listado nuevo. Toda lista debe completar los `[M]` (mandatorios).
> Los `[C]` (condicionales) aplican cuando el dominio lo justifica. Los `[O]`
> (opcionales) son polish para listas que lo merezcan.
>
> **Living document:** cuando aparezca una capacidad nueva común a todos los
> listados, primero se implementa en `/incidents`, luego se agrega como item
> aquí. Ver "Cómo evolucionar el estándar" más abajo.

### Header

- [ ] **[M]** `<PageHeader>` con icono + título + descripción.
- [ ] **[M]** Observable que llena el breadcrumb del topbar al hacer scroll
      (lo provee `<PageHeader>` automáticamente).

### Toolbar (`<ListToolbar>`)

- [ ] **[M]** Input de búsqueda con debounce.
- [ ] **[O]** Largo mínimo (`minLength`) cuando la búsqueda es costosa o ambigua.
- [ ] **[M]** Botón refresh con feedback visual durante el refetch (vinculado a `query.isFetching`).
- [ ] **[C]** Botón "+ Nuevo" cuando el módulo permite crear desde la lista.
- [ ] **[C]** Toggle de panel de filtros con contador (cuando hay filtros).
- [ ] **[C]** Botón "Limpiar filtros" (cuando hay filtros activos).

### Panel de filtros (`<FiltersPanel>`)

- [ ] **[C]** Panel colapsable animado.
- [ ] **[C]** Highlight visual (borde + fondo) cuando hay filtros activos.
- [ ] **[C]** Grid responsive (1 col móvil → 5 col desktop).
- [ ] **[M]** Reset automático a `page=1` al cambiar cualquier filtro.

### Chips de filtros activos (`<ActiveFiltersBar>`)

- [ ] **[C]** Píldora por filtro con label humano y valor.
- [ ] **[M]** UUID resuelto a nombre legible (ej. `Zona: Cordillera Norte`,
      no `Zona: 8b1f-...`). Resolución vía `useMemo` que depende de los catálogos.
- [ ] **[C]** Botón ✕ por chip para quitar individualmente.
- [ ] **[C]** Botón "Limpiar" global.
- [ ] **[C]** Contador "N filtros activos".
- [ ] **[C]** La búsqueda aparece también como chip removible (cuando hay search).

### Controles de filtro reusables

- [ ] **[C]** `<LocationCascader>` cuando el dominio toca Zona → Área → Predio.
      Búsqueda global por nombre o código (cross-niveles). **No** 3 selects separados.
- [ ] **[C]** `<MultiSelect>` para catálogos cerrados (tipos, categorías, perfiles).
- [ ] **[C]** `<DateRangePicker>` para filtros temporales.
- [ ] **[C]** `<Select>` con encoding visual (ej. dots de color para semáforo).
- [ ] **[C]** `<Input>` con placeholder específico para búsquedas dirigidas
      (ej. `"Contiene: 'RUT'…"`, `"Contiene: 'PPU'…"`).

### Vista de datos (`<DataListView>`)

- [ ] **[M]** Soporte para dos modos: **tabla** y **cards**.
- [ ] **[M]** Toggle de modo persistido en `list-preferences-store` (sobrevive recarga).
- [ ] **[M]** Mismo dataset en ambos modos; sólo cambia el render.

### Tabla

- [ ] **[M]** Columnas con `meta.label`, `meta.icon`, `meta.responsive`,
      `meta.stickyRight`, `meta.flex` según corresponda.
- [ ] **[M]** Header de columna con indicador de sort (asc/desc/none) clickeable.
- [ ] **[M]** Sort server-side (controlado vía `sorting` + `onSortingChange`).
- [ ] **[M]** Click en zona muerta de la fila navega a `/{module}/[externalId]`.
- [ ] **[M]** Acciones por fila como **inline cluster** en desktop
      (atenuadas, se iluminan al hover).
- [ ] **[M]** Acciones por fila como **dropdown ⋯** en mobile (sticky right).
- [ ] **[M]** Auto-switch del estilo según viewport / preferencia
      (`useEffectiveActionMenuStyle`).
- [ ] **[M]** Feedback visual de hover y selección.
- [ ] **[C]** Línea de detalle expandible con iconos contextuales por columna
      (`meta.icon` se usa también ahí).

### Cards

- [ ] **[M]** `renderCard` provisto: render custom por item.
- [ ] **[M]** Grid responsive (`<EntityCardsGrid>`).
- [ ] **[M]** Mismas acciones por fila disponibles que en modo tabla.

### Loading y refetch

- [ ] **[M]** Skeletons SOLO en la primera carga sin data previa
      (`isLoading === true`).
- [ ] **[M]** En refetch con data previa: tabla visible + barra indeterminada
      arriba + overlay translúcido sobre el body (`isFetching === true`).
- [ ] **[M]** Paginación queda interactiva durante el refetch.
- [ ] **[M]** `placeholderData: (prev) => prev` en la query principal.

### Estados vacío y error

- [ ] **[M]** Empty state con icono + título + descripción específicos al dominio.
- [ ] **[O]** Acción opcional en empty state (ej. "+ Crear primero" si aplica).
- [ ] **[M]** Error state con icono + mensaje + botón "Reintentar".

### Paginación

- [ ] **[M]** Controles: primera / anterior / página actual / siguiente / última.
- [ ] **[M]** Total de items y total de páginas visibles.
- [ ] **[M]** `itemLabel` específico al dominio (`"incidentes"`, `"denuncias"`, etc.).
- [ ] **[M]** `pageSize` leído del store de preferencias del usuario (no hardcodeado).

### Exports

- [ ] **[C]** Excel nativo cuando el dominio justifica export operativo.
- [ ] **[C]** PDF nativo (orientación + page size configurables).
- [ ] **[C]** `fetchAllData` para exportar TODO el dataset filtrado, no la página visible.
- [ ] **[C]** `exportLabel` específico al módulo (`"Exportar incidentes"`, etc.).

### Acciones por fila

- [ ] **[M]** Variantes contextuales (Ver, Editar, destructiva).
- [ ] **[M]** `e?.stopPropagation()` en cada handler para no disparar el click de fila.
- [ ] **[M]** Estado `disabled` por fila según el estado del registro
      (ej. `canVoid = state === 'active'`).
- [ ] **[C]** Variante destructiva con color rojo + tooltip.
- [ ] **[M]** `aria-label` por acción (especialmente en cluster inline).

### Navegación al detalle

- [ ] **[M]** Click en folio (link explícito con estilo destacado).
- [ ] **[M]** Click en zona muerta de la fila.
- [ ] **[M]** Acción "Ver" del cluster / dropdown.
- [ ] **[M]** Todas las rutas convergen a `/{module}/[externalId]`.

### Diálogo destructivo

- [ ] **[C]** Componente reusable extraído (no embebido en `page.tsx`).
- [ ] **[C]** Razón obligatoria con largo mínimo (≥ 10 caracteres).
- [ ] **[C]** Toast de éxito con identificador legible (correlativo, código).
- [ ] **[C]** `mutation.isPending` deshabilita el botón confirm + cancel.
- [ ] **[C]** Auto-close + auto-clear del form al éxito.
- [ ] **[C]** Reusable entre listado y detail.

### Estado canónico (`useListPageState`)

- [ ] **[M]** `page` / `setPage` (1-indexed).
- [ ] **[M]** `pageSize` desde el store de preferencias (NO `useState` ni prop).
- [ ] **[M]** `sorting` / `setSorting` server-side.
- [ ] **[M]** `filters` + helpers (`setFilter`, `removeFilter`, `clearAll`).
- [ ] **[C]** `isOpen` / `togglePanel` del panel.
- [ ] **[C]** `activeFilters` para chips.
- [ ] **[C]** `search` / `debouncedSearch` / `handleSearchChange` (opt-in).
- [ ] **[O]** `selectedCode` / `setSelectedCode` (highlight de fila opt-in).
- [ ] **[O]** `showInactive` / `setShowInactive` (toggle "incluir inactivos").
- [ ] **[M]** `defaultSort` configurado por el módulo.

### TanStack Query — disciplina

- [ ] **[M]** `staleTime` específico por dominio (15 s listas operativas, 5 min catálogos).
- [ ] **[M]** `placeholderData: (prev) => prev` en la query principal.
- [ ] **[M]** `enabled` cuando la query depende de un parámetro nullable.
- [ ] **[M]** Mutaciones invalidan `['{module}']` completo en `onSuccess`.
- [ ] **[M]** **Prohibido** `useEffect + fetch`. TanStack Query lo cubre.

### Localización es-CL

- [ ] **[M]** Fechas en formato `dd-MM-yyyy [HH:mm]` con locale `es` de date-fns.
- [ ] **[M]** Labels y mensajes en español latinoamericano.
- [ ] **[M]** PPU en lugar de "Patente" en toda etiqueta visible.
- [ ] **[C]** Validación RUT módulo 11 en filtros / inputs de identificación de personas.
- [ ] **[M]** Coordenadas WGS84 decimales (`-37.461700, -72.355200`) cuando se muestran.

### Accesibilidad

- [ ] **[M]** `aria-hidden` en elementos decorativos (dots de color, separadores).
- [ ] **[M]** `aria-label` en botones de íconos (refresh, acciones, paginación).
- [ ] **[M]** `title` en celdas con truncamiento (line-clamp) para mostrar el texto completo en hover.
- [ ] **[M]** `<span className="sr-only">` en headers de columna de acciones (sin texto visible).
- [ ] **[M]** Focus management entre toolbar, tabla y paginación coherente.

### Responsive

- [ ] **[M]** Columnas con `meta.responsive: true` se ocultan bajo cierto breakpoint.
- [ ] **[M]** Toolbar reflows en mobile (search arriba, controles abajo).
- [ ] **[M]** Sticky-right de la columna de acciones SOLO cuando es dropdown
      (no entorpece scroll horizontal en inline).
- [ ] **[O]** Forzar modo cards en viewports muy angostos (a definir cuando se valide).

### Detail page

- [ ] **[M]** Existe `/{module}/[externalId]/page.tsx`.
- [ ] **[M]** Maneja loading (skeleton) / error / no-data (`<EmptyState>` con botón
      "Volver al listado").
- [ ] **[M]** Banner contextual cuando el registro está en estado terminal
      (anulado / archivado / cerrado).
- [ ] **[M]** Cards semánticas, sin tabs vacíos para placeholders futuros.
- [ ] **[C]** Reusa el diálogo destructivo del listado.
- [ ] **[O]** Link "Ver en Google Maps" cuando hay coordenadas (sin embed por ahora).

---

## Anti-patterns (rechazo en review)

1. ❌ `useState` paralelo para filtros, page, sort. Usar `useListPageState`.
2. ❌ `isLoading` en el botón refresh / overlay. Usar `isFetching`.
3. ❌ Reemplazar la tabla por skeletons en refetch. El overlay lo maneja.
4. ❌ Chips con UUID visible. Resolver a label humano.
5. ❌ Embeber el dialog destructivo en `page.tsx`. Componente aparte.
6. ❌ 3 selects separados Zona/Área/Predio. Usar `<LocationCascader>`.
7. ❌ Exportar solo la página visible. `fetchAllData` o endpoint de export.
8. ❌ "Patente" en labels. Es **PPU**.
9. ❌ `useEffect` para cargar data. Es TanStack Query.
10. ❌ Tabs vacíos para futuros (personas, vehículos, evidencia) en el detail.
    Cuando exista el módulo, se agrega. Sin placeholders.
11. ❌ KPI cards decorativos. Solo cuando cambian la decisión del usuario.
12. ❌ Hardcodear labels (`'Activo'`, `'Anulado'`) en cada componente. Centralizar en `lib/{module}-format.ts`.

---

## Cómo evolucionar el estándar

Cuando aparezca una capacidad nueva que tenga sentido para todas las listas
(URL state persistence, columnas configurables por usuario, vista de mapa
integrada, etc.):

1. Implementarla **primero** en `/incidents` (referencia).
2. Actualizar este documento (sección correspondiente: mandatoria,
   condicional u opcional).
3. Crear ADR en `apps/web/.ai-docs/memory/ARCHITECTURE-DECISIONS.md`
   si la capacidad cambia un contrato existente.
4. Migrar listados ya existentes en una iteración posterior, no en la misma
   PR.

---

## Referencia rápida

| Necesito…                              | Mirar                                             |
| -------------------------------------- | ------------------------------------------------- |
| Checklist para copiar al PR            | Sección "Checklist de features" arriba            |
| Esqueleto completo de listado nuevo    | `skills/CREATE-LIST-PAGE.md`                      |
| Cómo agrego un export Excel/PDF        | `skills/ADD-ASYNC-EXPORT.md`                      |
| Política sobre `useEffect`             | `standards/USE-EFFECT-POLICY.md`                  |
| Patrones de mapas                      | `standards/MAP-PATTERNS.md`                       |
| Detail page completa                   | `app/(protected)/incidents/[externalId]/page.tsx` |
| Listado completo                       | `app/(protected)/incidents/page.tsx`              |
| Hook de estado canónico                | `hooks/use-list-page-state.ts`                    |
| DataListView (tabla + cards + overlay) | `components/data-list-view.tsx`                   |
| ListToolbar                            | `components/list-toolbar.tsx`                     |
| Cascader                               | `components/ui/location-cascader.tsx`             |
| MultiSelect                            | `components/ui/multi-select.tsx`                  |
| DateRangePicker                        | `components/ui/date-range-picker.tsx`             |
| Format module ejemplo                  | `lib/incidents-format.ts`                         |
| Row actions ejemplo                    | `components/incidents/incident-row-actions.tsx`   |
| Destructive dialog ejemplo             | `components/incidents/void-incident-dialog.tsx`   |
