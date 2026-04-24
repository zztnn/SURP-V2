# Pre-Commit Checklist — Frontend SURP 2.0

> Correr antes de cada commit o PR.

---

## Checks automáticos (obligatorios)

```bash
pnpm typecheck        # cero errores TypeScript
pnpm lint             # cero errores ESLint
pnpm build            # compila sin errores
pnpm test             # todos los tests pasan
```

Si alguno falla: **arreglar antes de commitear**. No omitir con `--no-verify`.

---

## Revisión manual

### Código general

- [ ] Ningún `any`, `@ts-ignore`, `eslint-disable` nuevo
- [ ] Ningún `console.log`
- [ ] Identificadores en inglés; UI en español latinoamericano
- [ ] Ningún literal `'en-GB'` / `'en-US'` / `'es-ES'` hardcodeado

### Formularios

- [ ] Todos los campos con `data-field={fieldName}` para scroll-to-error
- [ ] `<RequiredBadge />` (no asterisco rojo `*`)
- [ ] `<DateInput>` (no `<Input type="date">`)
- [ ] `<FloatingActionBar>` en todo form que guarda
- [ ] `useFormCloseGuard` en todo form editable
- [ ] Errores inline + toast en errores del servidor

### Mapas (si aplica)

- [ ] Componentes Leaflet con `dynamic({ ssr: false })`
- [ ] GeoJSON con `[lng, lat]` (no `[lat, lng]`)
- [ ] `<CoordinateInput>` para campos de coordenadas

### Tablas

- [ ] `<DataTable>` para toda tabla (no `<table>` HTML)
- [ ] Columnas con `size` + `meta.label` declarados

### Queries

- [ ] Data fetching con TanStack Query (no `useEffect` + fetch)
- [ ] `surgicalUpdateListCache` en mutaciones (no `invalidateQueries` universal)
- [ ] Query keys en `@/lib/query-keys.ts`
