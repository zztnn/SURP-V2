# PR Review Checklist — Frontend SURP 2.0

> Checklist para el revisor. Un PR no se aprueba si falla algún ítem crítico (🔴).

---

## Quality gates

- 🔴 `pnpm typecheck` pasa sin errores
- 🔴 `pnpm lint` pasa sin errores
- 🔴 `pnpm build` pasa sin errores
- 🟡 `pnpm check:filesize` — ningún bundle nuevo excede el límite

---

## Patrones y estructura

- 🔴 Entity Page Pattern aplicado (validator, columns, form, pages)
- 🔴 `<DataTable>` para toda tabla tabular (no `<table>` HTML crudo)
- 🔴 `<FloatingActionBar>` en todo form que guarda
- 🔴 `useFormCloseGuard` en todo form editable
- 🟡 Query keys centralizadas en `@/lib/query-keys.ts`

### Effects (USE-EFFECT-POLICY.md)

ESLint bloquea `useEffect`/`useLayoutEffect`/`useInsertionEffect` directos fuera de `src/hooks/**` y `src/providers/**`. El revisor debe enforcear las cosas que ESLint NO ve:

- 🔴 **Regla 1 — derive, no sync.** Sin `useState` + `useEffect(() => setX(deriveFromY(y)), [y])`. Si `X` se computa de `Y`, hacerlo inline (`const x = deriveFromY(y)`) o memoizar con `useMemo`.
- 🔴 **Regla 2 — server state en TanStack Query.** Sin `useEffect` que llame `fetch()` y guarde en `useState`. Sin re-implementación de cache, retry, cancelación, staleness — todo eso ya lo hace `useQuery`.
- 🔴 **Regla 3 — event handlers, no effects.** Sin "set flag → effect dispara acción real". La acción del usuario va directo en el `onClick`/`onSubmit`/etc.
- 🔴 **Regla 5 — reset con `key`, no coreografía.** Para que un componente se reinicie cuando cambia un ID/prop, usar `<Comp key={id} />`, no un `useEffect` que reinicie estado local.
- 🔴 **Hooks custom nuevos.** Si el PR introduce un nuevo hook en `src/hooks/` que usa `useEffect`, el header del archivo debe declarar la **Regla del policy** que implementa (ej. `// Policy: Rule 4 — ResizeObserver subscription`) o citar la **excepción permitida** (debounce, focus post-transición, query-driven state machine, keyboard listener global, DOM attribute sync en provider). Un hook nuevo sin ese tag no se aprueba.
- 🟡 **`useMountEffect` para external sync único.** Si la lógica es "setup on mount, cleanup on unmount" sin reactividad, debería usar `useMountEffect` en vez de `useEffect(fn, [])`.
- 🟡 **`useEffectEvent` para callbacks estables.** Hooks que reciben callbacks reactivos del consumidor deberían envolverlos con `useEffectEvent` para evitar exhaustive-deps disables.

---

## Formularios

- 🔴 RHF + Zod en todo formulario
- 🔴 `data-field={fieldName}` en todo wrapper de campo
- 🔴 `<RequiredBadge />` en lugar de asterisco rojo
- 🔴 `<DateInput>` en lugar de `<Input type="date">`
- 🔴 Errores inline + toast (nunca solo uno)
- 🟡 Campos de RUT con validación módulo 11 (si aplica)
- 🟡 Campos de coordenadas con `<CoordinateInput>` (si aplica)

---

## Mapas

- 🔴 Componentes Leaflet con `dynamic(..., { ssr: false })`
- 🔴 GeoJSON usa `[lng, lat]` (no `[lat, lng]`)
- 🔴 Leaflet recibe `[lat, lng]` en `center` y `position`
- 🟡 Máx 2000 features en carga de mapa (filtrar por bounds o fecha)
- 🟡 Link a Google Maps junto a coordenadas mostradas al usuario

---

## Localización

- 🔴 Sin literales `'en-GB'` / `'en-US'` / `'es-ES'` — usar `getLocaleConfig().locale`
- 🔴 Identificadores en inglés; UI en español latinoamericano
- 🔴 Fechas con `<DateInput>` (no `<Input type="date">`)

---

## Performance

- 🟡 Sin sort client-side en listas paginadas server-side
- 🟡 `surgicalUpdateListCache` en mutaciones (no `invalidateQueries` universal)
- 🟡 Skeletons en estados de carga (sin flicker de layout)

---

## Seguridad / UX

- 🔴 `useFormCloseGuard` en forms — no perder trabajo del usuario
- 🔴 Export async con `<ExportProgressModal>` (no export síncrono)
- 🟡 AuditTrail en la última sección del detalle (si aplica)
