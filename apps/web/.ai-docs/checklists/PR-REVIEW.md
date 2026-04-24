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
- 🔴 Sin `useEffect` para data fetching — solo TanStack Query
- 🔴 Sin `useState` para server data
- 🔴 `<DataTable>` para toda tabla tabular (no `<table>` HTML crudo)
- 🔴 `<FloatingActionBar>` en todo form que guarda
- 🔴 `useFormCloseGuard` en todo form editable
- 🟡 Query keys centralizadas en `@/lib/query-keys.ts`

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
