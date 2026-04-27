# Known Pitfalls — Frontend SURP 2.0

> Errores que ya pagamos. Leer antes de proponer cambios.

---

## PITFALL-F-001 — Sort client-side de lista paginada

**Qué pasa:** `DataTable` maneja `sorting` y reordena `data?.data` en `useMemo`. Solo reordena la página visible, no toda la colección.

**Regla:** Si la lista es paginada server-side, el sort va al backend como `sortField` + `sortOrder` en query params. PostgreSQL hace el ORDER BY.

---

## PITFALL-F-002 — Archivos >800 líneas

**Qué pasa:** Un agente AI añade features al mismo archivo. Llega a 1200 líneas.

**Regla:** Límite duro 1000 líneas (ESLint). Extraer unidades cohesivas.

---

## PITFALL-F-003 — Mezclar español e inglés en identificadores

**Qué pasa:** `const nombrePredio = incident.property_name` — variables en español.

**Regla:** Identificadores en **inglés**. UI y comentarios en **español**. Sin mezclar.

---

## PITFALL-F-004 — `useEffect` para todo

**Qué pasa:** `useEffect(() => { fetch(...) }, [])`, `useEffect(() => setX(deriveFromY(y)), [y])`, `useEffect` como relay de eventos. Todas son anti-patterns que el policy banea.

**Regla:** ESLint bloquea `useEffect`/`useLayoutEffect`/`useInsertionEffect` directos fuera de `src/hooks/**` y `src/providers/**`. Aplicar la jerarquía del policy: derivar inline (Rule 1) → TanStack Query para server state (Rule 2) → event handler (Rule 3) → `useMountEffect` para sync único (Rule 4) → `key` para reset (Rule 5). Ver `standards/USE-EFFECT-POLICY.md`.

---

## PITFALL-F-005 — Toast sin inline error (o viceversa)

**Qué pasa:** El backend devuelve 400, el frontend hace `toast.error(message)` pero no marca el campo. O marca el campo pero el error está bajo el fold.

**Regla:** Siempre los dos — `form.setError` (inline) **y** `toast.error`. Ver `skills/HANDLE-SERVER-ERRORS-IN-FORMS.md`.

---

## PITFALL-F-006 — Asterisco rojo para campos requeridos

**Qué pasa:** `<span className="text-red-500">*</span>`. Se mezcla con errores inline.

**Regla:** Usar `<RequiredBadge />` (pill gris "Requerido"). Asterisco rojo BANEADO.

---

## PITFALL-F-007 — Fecha nativa `<Input type="date">`

**Qué pasa:** Rendering depende del browser. No se puede forzar `dd-MM-yyyy`.

**Regla:** Usar siempre `<DateInput>` compartido. Valor en form state es ISO `YYYY-MM-DD`. Ver `skills/USE-DATE-PICKER.md`.

---

## PITFALL-F-008 — `invalidateQueries` universal tras mutación

**Qué pasa:** Tras guardar un incidente se refetchean todas las queries de incidentes. El mapa, la lista y los contadores se recargan todos. Flicker y scroll reset.

**Regla:** Usar `surgicalUpdateListCache` / `surgicalRemoveFromListCache`. `invalidateQueries` universal BANEADO en mutations normales.

---

## PITFALL-F-009 — Hardcodear `en-GB` en `Intl.DateTimeFormat`

**Qué pasa:** Una utilidad escribe `new Intl.DateTimeFormat('en-GB', …)`. La fecha sale en inglés.

**Regla:** `getLocaleConfig().locale` siempre (retorna `'es-CL'`). Ningún literal `'en-GB'`/`'en-US'`/`'es-ES'`.

---

## PITFALL-F-010 — Formulario sin `useFormCloseGuard`

**Qué pasa:** El usuario edita un incidente 10 minutos, presiona ESC y pierde todo.

**Regla:** Toda superficie con form editable monta `useFormCloseGuard`. Sin excepciones. Ver `skills/PREVENT-UNSAVED-CHANGES-LOSS.md`.

---

## PITFALL-F-011 — Export síncrono sin modal de progreso

**Qué pasa:** Botón "Excel" exporta 10k incidentes síncrono. El browser se congela.

**Regla:** Async export 3-endpoint + `<ExportProgressModal>`. Ver `skills/ADD-ASYNC-EXPORT.md`.

---

## PITFALL-F-012 — Campo sin `data-field`

**Qué pasa:** `applyServerErrorToForm` no puede hacer scroll-to-error.

**Regla:** Todo wrapper de campo tiene `data-field={fieldName}`.

---

## PITFALL-F-013 — Inicializar el mapa sin `dynamic` import en Next.js

**Qué pasa:** Leaflet usa `window` directamente. En Server Components (Next.js) falla con "window is not defined".

**Regla:** Los componentes de Leaflet siempre con `dynamic(() => import('...'), { ssr: false })`. Encapsular en `<MapView>` compartido que ya lo maneja.

---

## PITFALL-F-014 — GeoJSON con [lat, lng] en lugar de [lng, lat]

**Qué pasa:** GeoJSON spec usa `[longitude, latitude]`. Leaflet también. Si se invierte, los marcadores aparecen en el océano.

**Regla:** GeoJSON siempre `[lng, lat]`. Para coordenadas de display al usuario (`-37.46, -72.35`) usar `lat, lng`. Documentar en el DTO con `@ApiProperty`.

---

> **Añadir pitfall nuevo:** fecha, qué pasa, root cause, regla, a qué aplica.
