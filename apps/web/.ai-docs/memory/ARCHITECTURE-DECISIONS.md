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

## ADR-F-007 — Leaflet como motor de mapas

**Fecha:** 2026-04-23
**Estado:** Aceptado (revisable a MapLibre GL si se necesitan mapas vectoriales 3D)

**Decisión:** Leaflet + React-Leaflet para visualización de mapas interactivos. Tiles: OpenStreetMap o tiles propios de Arauco.

**Razón:**
- Leaflet es liviano y bien soportado.
- SURP necesita mostrar puntos de incidentes y polígonos de predios — no hay necesidad de 3D ni mapas vectoriales complejos en Fase 1.

**Consecuencias:**
- `<MapView>` componente compartido que encapsula React-Leaflet.
- `<IncidentMap>` y `<PropertyMap>` son variantes específicas del dominio.
- Los GeoJSON retornados por el backend se renderizan directamente con `<GeoJSON>` de React-Leaflet.

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

**Decisión:** Los módulos con entidades geoespaciales exponen tres vistas: Lista (tabla), Mapa (Leaflet), Detalle. El toggle Lista/Mapa se incluye en el `ListToolbar`.

**Consecuencias:**
- Componente `<MapView>` compartido con props de data.
- Endpoint `/incidents/map` retorna `FeatureCollection` GeoJSON.
- Sin paginación en la vista mapa — se limita por bounding box del viewport.

---

## ADR-F-013 — Sin módulos de DTE, finanzas, ni multi-empresa

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** SURP no tiene módulos de facturación, contabilidad, ni selección de empresa. El sistema sirve a una sola organización (Arauco/URP).

**Consecuencias:** Sidebar más simple. Sin company switcher. Sin módulos de ledger/DTE.
