# Architecture Decision Records — Frontend SURP 2.0

> Decisiones técnicas tomadas y **por qué**. Añadir ADR nuevo para cambios — no editar.

---

## ADR-F-001 — Next.js 16 + App Router

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** Next.js 16 con App Router. Turbopack en dev.

**Razón:**

- Server Components reducen bundle y permiten data fetching en el server.
- Route groups (`(protected)`, `(auth)`) organizan layouts sin ensuciar la URL.
- Stack validado en el proyecto BML-ERP de referencia.

**Consecuencias:**

- Default: Server Components. `'use client'` solo donde hay estado, efectos o handlers.

---

## ADR-F-002 — shadcn/ui + Radix sobre Chakra/Material/Ant

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** Componentes shadcn/ui (copy-paste) sobre Radix UI + Tailwind v4.

**Razón:** Los componentes viven en el repo → cero dependency lock-in. Customización sin pelear con design system ajeno.

---

## ADR-F-003 — TanStack Query para data fetching

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** TanStack Query v5. `fetch` crudo en componentes está prohibido.

**Consecuencias:** Cache, dedup, background refetch built-in. Query keys centralizadas en `@/lib/query-keys.ts`.

---

## ADR-F-004 — Zustand para estado global UI

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** Zustand para estado de UI (sidebar, preferencias de lista). Server state vive en TanStack Query — nunca en Zustand.

---

## ADR-F-005 — React Hook Form + Zod en todo formulario

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** RHF + `@hookform/resolvers/zod` en todo formulario. Schemas en `@/lib/validators/`.

---

## ADR-F-006 — Locale es-CL hardcodeado

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** `locale-config.ts` exporta `es-CL` fijo. Fechas `dd-MM-yyyy`, TZ `America/Santiago`, hora `HH:mm` 24h.

**Razón:** SURP se usa exclusivamente en Chile, operado por personal de Arauco.

---

## ADR-F-007 — Google Maps JavaScript API como motor único de mapas

**Fecha:** 2026-04-23 (revisado tras decisión del usuario)
**Estado:** Aceptado (no negociable)

**Contexto:** La versión inicial de este ADR proponía Leaflet por ligereza y stack open-source. Tras revisar los casos de uso de SURP (Street View eventual, integración natural con Places/autocomplete de direcciones chilenas, coherencia con el ecosistema que el usuario ya conoce), la decisión se revirtió a Google Maps como motor único.

**Decisión:** Google Maps JavaScript API vía `@vis.gl/react-google-maps` (wrapper oficial de Google Maps Platform para React). `@googlemaps/markerclusterer` para clustering cuando la densidad lo requiere. Dos Map IDs configurados en Cloud Console: claro (default) y oscuro (dark mode).

**Razón:**

- API key única vs. múltiples librerías: reduce superficie de decisión en el frontend.
- `@vis.gl/react-google-maps` es compatible con Next.js App Router y no requiere el workaround típico `dynamic({ ssr: false })` de Leaflet.
- Advanced Markers + Cloud-based styling hacen innecesario el trabajo de tematizar CSS.
- Places autocomplete restringido a Chile (`componentRestrictions: { country: 'cl' }`) encaja directamente con el formulario de domicilios.
- Street View a futuro es un feature gratuito que da valor operativo al equipo URP.

**Consecuencias:**

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` con restricciones de referer + APIs limitadas (Maps JS, Places, Geocoding). Billing alert obligatorio.
- `APIProvider` montado una sola vez en el layout protegido — nunca en el layout raíz (páginas públicas no cargan Google Maps).
- Componente `<MapView>` envuelve `<Map>` de `@vis.gl/react-google-maps` con defaults SURP (centro Arauco, zoom, map ID según tema).
- `<AdvancedMarker>` (no `<Marker>` — deprecado). Clustering via `@googlemaps/markerclusterer` cuando features > 200.
- GeoJSON del backend se inyecta en el Data Layer del mapa con `map.data.addGeoJson(...)`.
- Se prohíbe Leaflet, MapLibre y OpenLayers para evitar stack duplicado.

**Ver:** `standards/MAP-PATTERNS.md`.

---

## ADR-F-008 — FloatingActionBar canónica en todo formulario

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** Todo formulario que guarda data usa `<FloatingActionBar>`. Sin excepciones.

---

## ADR-F-009 — Guard de cambios no guardados

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** Todo form editable monta `useFormCloseGuard`. Confirmación: "¿Descartar cambios no guardados?".

---

## ADR-F-010 — DataTable (TanStack Table) para toda tabla tabular

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** `<DataTable>` compartido para toda tabla. No elementos `<table>` HTML crudos.

---

## ADR-F-011 — Async exports con ExportProgressModal

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** Todo export (Excel, PDF) usa el contrato 3-endpoint con `<ExportProgressModal>`. Export síncrono BANEADO.

---

## ADR-F-012 — Vista de mapa como tercera vista (junto a lista y detalle)

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** Los módulos de incidentes y predios son intrinsecamente geoespaciales. Los usuarios necesitan ver la distribución geográfica de incidentes.

**Decisión:** Los módulos con entidades geoespaciales exponen tres vistas: Lista (tabla), Mapa (Google Maps), Detalle. El toggle Lista/Mapa se incluye en el `ListToolbar`.

**Consecuencias:**

- Componente `<MapView>` compartido con props de data (implementado sobre `@vis.gl/react-google-maps` — ver ADR-F-007).
- Endpoint `/incidents/map` retorna `FeatureCollection` GeoJSON.
- Sin paginación en la vista mapa — se limita por bounding box del viewport.

---

## ADR-F-013 — Sin módulos de DTE, finanzas, ni multi-empresa

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** SURP no tiene módulos de facturación, contabilidad, ni selección de empresa. El sistema sirve a una sola organización (Arauco/URP).

**Consecuencias:** Sidebar más simple. Sin company switcher. Sin módulos de ledger/DTE.

---

## ADR-F-014 — Scanner móvil con sesión efímera + QR

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** El personal URP y guardias de empresas de seguridad operan mayoritariamente en terreno con celular (fotografiar evidencia, escanear documentos físicos, leer QR/placa para consulta de bloqueos). El sistema vive en desktop; se necesita puente rápido celular ↔ desktop sin forzar login en el celular ni instalar app nativa. Patrón equivalente ya funciona en IGM (`/Users/jean/Projects/IGM/frontend/app/scan`).

**Decisión (revisado 2026-04-24):** Flujo web de escaneo con **sesión efímera autenticada por token**, iniciada desde el desktop. **Tres modalidades** (no cuatro — el modo `chilean_id` se eliminó, ver sección siguiente):

1. Desktop autenticado pide `POST /scan-sessions` → backend crea sesión con `token_hash` (SHA-256), TTL 10 min, y devuelve QR que codifica `https://app.surp.cl/scan/:sessionId?t=:token`.
2. Celular escanea el QR → abre la página pública `/scan/:sessionId` → valida token → elige modalidad: **foto de evidencia / documento físico / QR-patente**.
3. Cada modalidad usa la librería que mejor encaja: `MediaDevices` nativa para foto, `jscanify` para documentos, `@zxing/browser` para QR, `tesseract.js` para OCR de placa.
4. Uploads incrementales al backend via endpoint público token-autenticado. SSE al desktop actualiza thumbnails en vivo. Offline-first con IndexedDB queue para foto de evidencia.
5. Usuario cierra sesión → desktop asocia el resultado a la entidad dueña (incidente, denuncia, etc.).

### Por qué se eliminó el modo `chilean_id`

El diseño inicial incluía captura de cédulas chilenas con PDF417 + OCR de RUT. Se elimina porque **los guardias de empresas de seguridad privada (régimen OS-10 / DL 3.607) no tienen atribución legal** para exigir, capturar ni almacenar fotografías de cédulas. Solo personal con facultades específicas (Carabineros, PDI) puede hacerlo. Los RUTs se ingresan **a mano** en el formulario con validación de módulo 11 local, sin captura física del documento.

Si un flujo puntual requiere captura de cédula con acompañamiento de autoridad, se diseña como módulo aparte fuera del scanner genérico — no es MVP.

**Razón:**

- Sin app nativa: cualquier celular con cámara y navegador moderno (Chrome Android ≥120, Safari iOS ≥16) funciona.
- Sin login en el celular: el token es suficiente, no hay que crear cuentas para guardias en terreno.
- Modalidades separadas permiten cargar librerías pesadas sólo cuando se necesitan (`@zxing/browser` solo en QR, `tesseract.js` solo en OCR de placa).
- Paralelo a IGM simplifica adopción y mantenimiento.
- Eliminar `chilean_id` cierra riesgo legal Ley 21.719 + DL 3.607 sin perder funcionalidad real.

**Consecuencias:**

- Rutas `apps/web/app/scan/[sessionId]/page.tsx` (pública, layout mínimo) y launcher en `apps/web/app/(protected)/.../scan-launcher-button.tsx`.
- HTTPS obligatorio en prod (requisito de `navigator.mediaDevices`). En dev, localhost o túnel.
- Librerías pesadas cargan con `next/dynamic({ ssr: false })` por modalidad.
- Foto de evidencia preserva EXIF/GPS originales en `surp-evidence`; versión sanitizada se genera al exportar a PDF.
- **Offline-first** con IndexedDB queue para foto de evidencia; el código correlativo del incidente se asigna al sincronizar (ver `apps/api/.ai-docs/standards/INCIDENT-CODE.md`).
- Token se almacena como SHA-256; comparación timing-safe en validación; rate limit agresivo en endpoints públicos.

**Ver:** `standards/MOBILE-SCANNER.md`, `apps/api/.ai-docs/standards/STORAGE.md` (container `surp-scan-temp`).

---

## ADR-F-015 — Stack frontend oficial (consolidación post-auditoría)

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable — fundacional)

**Contexto:** Espejo de `ADR-B-019` del lado frontend. Tras auditar ERP e iwarehouse-2.0, se consolida el stack del frontend en `STACK.md` (raíz del repo).

**Decisión:** Adoptar `STACK.md` §11 como inventario único del frontend. Las piezas clave:

- **Next.js 16 App Router + React 19.2 + TypeScript 6 strict (flags completos).**
- **Tailwind v4 + Radix UI + shadcn/ui copy-paste.**
- **React Hook Form + Zod** (obligatorio en todo formulario).
- **TanStack Query v5** + **Zustand 5** (una store por dominio).
- **TanStack Table v8** con `<DataTable>` compartido.
- **Google Maps JS API** vía `@vis.gl/react-google-maps` (ver ADR-F-007).
- **Scanner móvil** con `jscanify` + `tesseract.js` + `@zxing/browser` (ver ADR-F-014).
- **date-fns 4, Sonner 2, lucide-react, Framer Motion 12, next-themes.**
- **Vitest + Testing Library + Playwright** con coverage 80%.

### Piezas disciplinadas adoptadas de iwarehouse-2.0

1. **Hooks discipline (React 19).**
   - Regla ESLint `no-restricted-syntax` bloquea `useEffect` directo en componentes.
   - `useMountEffect` (hook propio) envuelve `useEffect` + `useEffectEvent` y es la **única** forma aprobada de correr side effects en mount.
   - `useRef` permitido solo en `src/hooks/**` y `src/providers/**`.
   - Objetivo: eliminar la clase de bugs por stale closures.

2. **Client/server boundary clara.**
   - Server Components por default; `'use client'` solo donde hay estado, efectos, listeners, browser APIs.
   - Ningún componente `ui/` importa librerías de navegador directas.

3. **Form draft persistence.**
   - Utilidad `form-draft-snapshot.ts` (patrón iwarehouse) guarda en localStorage un snapshot del RHF mientras el usuario tipea.
   - Al volver al form, si hay draft, se ofrece restaurar.
   - Útil en formularios largos: denuncias, causas, personas.

4. **Build info expuesto en UI.**
   - `APP_VERSION`, `GIT_SHA`, `BUILD_TIME` inyectados en build.
   - Footer del layout protegido lee esos valores; útil para soporte ("qué build está corriendo el usuario").

### Piezas adoptadas de ERP

1. **Regla ESLint `max-lines: 1000`** (`1500` para tests/generated). Archivos más grandes se extraen en submódulos cohesivos.
2. **TS flags completos:** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, etc. — mismos flags que backend.
3. **Coverage threshold 80%** en Vitest.
4. **Un ESLint flat config por app** (`apps/web/eslint.config.mjs`), no configuración raíz monolítica.
5. **Múltiples stores Zustand especializados** (una por dominio: sidebar, theme, locale, list-preferences, active-entity) — no un megastore global.
6. **Sonner 2 global** con `<Toaster>` único en el layout protegido.

### Consecuencias

- Cualquier adición de librería frontend requiere ADR previo.
- PR que desactive un flag TS o regla ESLint tiene que argumentarlo y abrir ADR.
- Se prohíbe cualquier biblioteca de mapas que no sea Google Maps (ADR-F-007 — Leaflet, MapLibre, OpenLayers fuera).
- Se prohíbe GraphQL/tRPC en el frontend (ADR-B-019) — `apiClient` REST es la única puerta de salida.
- Se prohíbe Redux / MobX — Zustand es el único store global.
- Se prohíbe Storybook **por ahora** (costo > beneficio en fase inicial); revisable cuando la librería `ui/` estabilice.

**Ver:** `STACK.md` §11 y §12 (raíz), `ADR-F-007` (mapas), `ADR-F-014` (scanner), `apps/web/.ai-docs/standards/` (patrones específicos).
