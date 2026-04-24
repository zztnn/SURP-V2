# Vistas Razor del SURP Legacy

> Mapeo exhaustivo de las 281 vistas Razor del legacy. Propósito: que el equipo frontend de SURP 2.0 sepa qué construir y cómo mapear cada pantalla al nuevo App Router de Next.js 16.

---

## Resumen

- **281 vistas `.cshtml`** distribuidas en **55+ controllers**.
- Patrón dominante: **CRUD estándar** (Index, Create, Edit, Details, Delete) + **variantes especiales** (ReportPrint, Previsualizacion, Importar, dashboards por rol).
- Layouts principales: `_Application.cshtml` (master), `_Layout2.cshtml` (default con sidenav), `_ApplicationPDF.cshtml` / `_LayoutPDF.cshtml` (reportes PDF).
- **14 View Components** compartidos bajo `Views/Shared/Components/`.

---

## Vistas por controller

### Catálogos / mantenedores CRUD estándar

#### Geográficos (30 vistas)

| Controller | Ruta | Vistas | Crítico |
|------------|------|--------|---------|
| Regiones | `Views/Regiones/` | Index, Create, Edit, Details, Delete | Sí (base para provincias) |
| Provincias | `Views/Provincias/` | Index, Create, Edit, Details, Delete | Sí (base para comunas) |
| Comunas | `Views/Comunas/` | Index, Create, Edit, Details, Delete | Sí (base para predios). Contiene bloques comentados. |
| Zonas | `Views/Zonas/` | Index, Create, Edit, Details, Delete | Sí (estadísticas, incidentes) |
| Áreas | `Views/Areas/` | Index, Create, Edit, Details, Delete | Sí (unidad geográfica principal) |
| Predios | `Views/Predios/` | Index, Create, Edit, Details, Delete | Sí (central en incidentes) |

#### Seguridad institucional (25 vistas)

| Controller | Vistas | Crítico |
|------------|--------|---------|
| Tribunales | Index, Create, Edit, Details, Delete | Sí (resoluciones, causas) |
| Fiscalias | Index, Create, Edit, Details, Delete | Sí (denuncias) |
| Fiscales | Index, Create, Edit, Details, Delete | Medio (catálogo de personas) |
| UnidadPoliciales | Index, Create, Edit, Details, Delete | Sí (denuncias) |
| Permisos | Index, Create, Edit, Details, Delete | Sí (RBAC). Contiene HTML comentado. |

#### Identidad (19 vistas)

| Controller | Vistas | Notas |
|------------|--------|-------|
| Usuarios | Index, Create, Edit, Details, Delete + `Abogados.cshtml`, `CambiarPassword.cshtml` | Vista parcialmente con lógica de negocio (`.Where()`, `.FirstOrDefault()`) |
| Personas | Index, Create, Edit, Details, Delete + `Personas.cshtml` (variante legacy) | Lógica embebida en vista |
| EmpresaExternas | Index, Create, Edit (sin Delete) | Bajo |

#### Bienes e incautaciones (18 vistas)

| Controller | Vistas | Crítico |
|------------|--------|---------|
| BienAfectados | Index, Create, Edit, Details, Delete | Sí (referenciado por incidentes) |
| Vehiculos | Index, Create, Edit, Details, Delete | Medio |
| VehiculosNI | Index, Create, Edit, Details, Delete | Bajo |
| MedioIncautados | Index, Create, Edit, Details, Delete | Sí (evidencia forense) |
| NoIncautados | Index, Create, Edit, Delete | Bajo |

### Procesos jurídicos (27 vistas)

| Controller | Vistas | Notas |
|------------|--------|-------|
| Denuncias | Index, Create, Edit, Details, Delete | Formularios con cascadas (Institución → UnidadPolicial/Fiscalía) |
| DenunciaImputados | Index, Create, Edit, Details, Delete | Relación Denuncia↔Persona (imputados). Lógica embebida. |
| DenunciaTestigos | Index, Create, Edit, Details, Delete | Relación Denuncia↔Persona (testigos) |
| DenunciaVehiculos | Index, Create, Edit, Details, Delete | Relación Denuncia↔Vehiculo |
| DenunciaVehiculosNI | Create, Edit (solo) | Vehículos no identificados |

### Incidentes y seguimiento (37 vistas)

| Controller | Vistas | Notas |
|------------|--------|-------|
| Incidentes | Index, Create, Edit, Details, Delete + `Previsualizacion.cshtml`, `ReportPrint.cshtml`, `ReportPrint2.cshtml` + `EditorTemplates/CondicionPortonEditor.cshtml` | Caso central del sistema, muy alta complejidad |
| IncidenteExternos | Index, Create, Edit, Previsualizacion | Incidentes de terceros |
| IncidentePredios | Index, Create, Edit, Details, Delete | Relación Incidente↔Predio |
| IncidenteBienAfectados | Index, Create, Edit, Details, Delete | Lógica embebida (`.Where()`, `.Count()`) |
| IncidenteExternoBienAfectados | Create, Edit | |
| IncidenteSeguimientos | Index, Create, Edit, Details, Delete | Trazabilidad |
| Fotos | Index, Create, Edit, Details, Delete | Galería. Lógica embebida. |
| FotosIncidenteExternos | Create, Edit | |

### Causas legales (22 vistas)

| Controller | Vistas | Notas |
|------------|--------|-------|
| Causas | Index, Create, Edit, Details, Delete + `Reporte.cshtml` (parcial, "hacer list causa"), `ReportPrint.cshtml` | Complejidad alta |
| CausaQuerellas | Index, Create | Relación |
| Querellas | Index, Create, Edit, Delete | HTML comentado extenso (features deshabilitadas) |
| Resoluciones | Index, Create, Edit, Details, Delete | Resultado final |
| ResolucionPersonas | Create, Edit | Personas vinculadas a resoluciones |
| AbogadoCausas | Index, Create, Edit, Details, Delete | Asignación abogados↔causas |

### Procesos especializados (13 vistas)

| Controller | Vistas | Notas |
|------------|--------|-------|
| Incendios | Index, Create, Edit, Details, Delete + `Importar.cshtml` (batch Excel), `GenerarCarta.cshtml`, `indexcausas.cshtml` | Módulo de temporada |
| Seguimientos | Index, Create, Edit, Details, Delete | Seguimiento genérico |
| SeguimientoVehiculos | Index, Create, Edit, Details, Delete | Rastreo vehículos sospechosos |
| DocumentoCausas | Index, Create, Edit, Details, Delete | Documentación de causas |

---

## Vistas especiales (no CRUD estándar)

### `Home/` — Dashboards por perfil (8 vistas)

- `Index.cshtml` — Dashboard Admin (top 10 predios afectados, filtros de fecha). Lógica de dominio en la vista.
- `Privacy.cshtml` — Página de privacidad (estándar).
- `Abogados.cshtml` — Dashboard para abogados litigantes.
- `AbogadosJefe.cshtml` — Dashboard para jefes de abogados.
- `UnidadPatrimonial.cshtml` — Dashboard para unidad de patrimonio.
- `EstadisticasIncidentes.cshtml` — Estadísticas con gráficos.
- `Estadisticas2.cshtml` — Variante (legacy duplicado).
- `Documento.cshtml` — Generador de documentos.

### `Estadisticas/` — Reportes (24 vistas en 12 pares Screen/Printable)

- `CausasPorZona` / `CausasPorZonaPrintable`
- `CausasPorAbogado` / `CausasPorAbogadoPrintable`
- `CausaAbogadoZona` / `CausaAbogadoZonaPrintable`
- `CausasTerminadas` / `CausasTerminadasPrintable`
- `CausasTerminadasPorEstado` / `CausasTerminadasPorEstadoPrintable`
- `CausasTerminadasPorAbogado` / `CausasTerminadasPorAbogadoPrintable`
- `HallazgosPorZona` / `HallazgosPorZonaPrintable`
- `AvaluoPorZona` / `AvaluoPorZonaPrintable`
- `NumeroImputados` / `NumeroImputadosPrintable`
- `AbogadosUltimos6meses` / `AbogadosUltimos6mesesPrintable`
- `AbogadosCausaImputados` / `AbogadosCausaImputadosPrintable`
- `EstadisticaMensual.cshtml`, `GestionLegal.cshtml`

### `Consultas/` — Consultas especializadas (4 vistas)

- `Auditoria.cshtml` — **Parcialmente funcional: el `@foreach` está comentado (líneas 113-126).** Modelo `IEnumerable<AuditoriaConsulta>` no se usa. Tabla sin datos.
- `Bloqueos.cshtml` — Estado de bloqueos/transacciones BD (mantenimiento).
- `PatenteMasivos.cshtml` — Búsqueda masiva por patente (API externa MAAT).
- `RutMasivos.cshtml` — Búsqueda masiva por RUT (API externa MAAT).

### `Cruce/` — Sistema de cruces (3 vistas)

- `Index.cshtml` — Registro de cruces positivos. Formularios modales anidados para personas y empresas.
- `Detalle.cshtml` — Detalle de un cruce.
- `Historial.cshtml` — Historial con lógica embebida.

### `Maat/` — Sistema MAAT (1 vista)

- `Index.cshtml` — Importador de RUTs con upload Excel + procesamiento async + progress tracking.

### Auditorías de API (2 vistas)

- `AuditoriaApis/Index.cshtml` — Log de llamadas a APIs externas.
- `AuditoriaPersonaApis/Index.cshtml` — Log de consultas de personas (JavaScript extenso para rangos de fecha).

### Otros

- `Reportes/Index.cshtml` — Contenedor WebReport (Crystal/Stimulsoft). Layout especial `~/Views/Incidentes/_Actualizar.cshtml`. Probablemente deprecated.
- `Account/Login.cshtml` — Formulario de login.
- `Shared/Error.cshtml` — Página de error genérica.

---

## Componentes compartidos (`Views/Shared/`)

### Layouts

- `_Layout.cshtml` — layout antiguo, comentado/deshabilitado (referencias a SACL.WEB).
- `_Application.cshtml` — master principal. Incluye: Bootstrap 4, DataTables 1.10.20, jQuery 3.3.1, Google Analytics GA4 (ID hardcoded `G-LP0YS0FVPM`).
- `_Layout2.cshtml` — hereda de `_Application`, añade sidenav.
- `_ApplicationPDF.cshtml` / `_LayoutPDF.cshtml` — layouts para PDF.
- `_ValidationScriptsPartial.cshtml` — scripts jQuery validation.

### Partials

- `_LayoutNavbar.cshtml` — barra superior.
- `_LayoutSidenav.cshtml` — menú lateral dinámico.
- `_LayoutFooter.cshtml` — pie.

### View Components (bajo `Shared/Components/`)

1. **SideMenu/Default.cshtml** — Menú lateral dinámico basado en permisos. **Autorización vive aquí** (itera enum `Controlador`, filtra por `Model.Permisos`, construye según `Model.Perfil`). Ver PITFALL-B-017 y PITFALL-B-024. Contiene ~80 líneas de código comentado.
2. **HeaderMenu/Default.cshtml** — menú de header (probablemente deprecated).
3. **VistaIncidente/Default.cshtml** — componente reutilizable para mostrar incidente (tabla de predios, acciones, tooltips).
4. **VistaDenuncia/Default.cshtml** — display reutilizable de denuncia.
5. **VistaIncidenteExterno/Default.cshtml** — variante con lógica embebida.
6. **PrediosContainer/Default.cshtml** — contenedor con tabs.
7. **FotosContainer/Default.cshtml** — galería.
8. **Incendios/Default.cshtml** — display de incendios.
9. **Identificacion/Default.cshtml** — card con datos personales.
10. **Especie/Default.cshtml** — detalle de especie (con lógica).
11. **Causas/Default.cshtml** — display de causa.

---

## Librerías JS/CSS

### CSS
- Bootstrap 4 + custom theme (`appwork.css`, `theme-air.css`, `colors.css`).
- RTL Bootstrap (`rtl/bootstrap.css`).

### JS
- **DataTables 1.10.20** + FixedHeader 3.1.6 + Responsive 2.2.3.
- **Select2** (dropdowns avanzados).
- **Numeral.js** (formato de números).
- **jQuery Validate + Unobtrusive Validation**.
- **SweetAlert2** (modales).
- **Perfect Scrollbar** (scrolling).
- **Toastr** (notificaciones).
- **Summernote** (editor HTML, comentado en algunas vistas).
- **Busyload** (loading spinner).
- **Axios** (AJAX).
- **jQuery 3.3.1, jQuery UI 1.12.1**.
- **Bootstrap Bundle 5.2.2** como fallback.

### Mapas y gráficos
- **OpenStreetMap** (referencias en componentes de incidentes).
- Generación KML para descargas.
- **No se detecta** Chart.js, ApexCharts ni Leaflet estándar.

### Iconos
- FontAwesome (v5+), Ionicons, LinearIcons, Open Iconic, PE Icon 7 Stroke.

---

## Problemas detectados

### 1. Lógica de negocio en vistas (66 archivos)

Contienen `.Where()`, `.OrderBy()`, `.FirstOrDefault()`, `.Count()` dentro de Razor. Ejemplos: `Home/Index.cshtml`, `Home/Abogados.cshtml`, `Consultas/Auditoria.cshtml`, `Incidentes/Details.cshtml`, `Usuarios/Index.cshtml`, múltiples View Components. Violación de separation of concerns.

### 2. Código comentado extenso

- `SideMenu/Default.cshtml`: ~80 líneas comentadas (menús alternativos).
- `Querellas/Create.cshtml`: referencias a Summernote comentadas.
- `Permisos/Edit.cshtml`: bloques grandes de HTML comentado.
- `Home/AbogadosJefe.cshtml`: secciones de formulario comentadas.
- `Estadisticas/`: líneas de debug comentadas.

### 3. Vistas parcialmente implementadas

- `Causas/Reporte.cshtml` — comentario "hacer list causa", estructura incompleta.
- `Consultas/Auditoria.cshtml` — `@foreach` comentado, tabla vacía en producción.

### 4. Vistas duplicadas

- `Home/Estadisticas2.cshtml`
- `Incidentes/ReportPrint.cshtml` y `ReportPrint2.cshtml`
- 12 pares Screen/Printable en `Estadisticas/` (Printable debería ser CSS `@media print`).

### 5. Referencias a layouts legacy inexistentes

- `Reportes/Index.cshtml` → `Layout = "~/Views/Incidentes/_Actualizar.cshtml"` (no encontrado).

### 6. Modelos complejos sin validación cliente robusta

- `Denuncias/Create.cshtml`: cascadas manuales con JS vanilla (no TypeScript, sin schema compartido con backend).

### 7. Google Analytics hardcoded

- `_Application.cshtml:159` → `G-LP0YS0FVPM` (debería ser config).

### 8. Paths relativos inconsistentes

Mezcla de `~/` y `/assets/` directos.

---

## Mapa de migración Razor → Next.js 16 App Router

### Convenciones

- CRUD estándar: `/[resource]/page.tsx` (index), `/[resource]/new/page.tsx`, `/[resource]/[id]/page.tsx`, `/[resource]/[id]/edit/page.tsx`.
- Delete: modal en cliente + API, no ruta propia.
- Dashboards: `/admin/dashboard/page.tsx` o `/admin/dashboards/[role]/page.tsx`.
- Reportes: `/reports/[report]/page.tsx` con PDF export server-side.
- Maestros: `/admin/master-data/[resource]/page.tsx`.
- Printable: `?print=true` + CSS `@media print` (eliminar duplicación Screen/Printable).

### Tabla de mapeo (selección)

| Vista legacy | Ruta Next.js 16 | Tipo |
|--------------|-----------------|------|
| `Home/Index.cshtml` | `/admin/dashboard/page.tsx` | Dashboard |
| `Home/Abogados.cshtml` | `/admin/dashboards/lawyers/page.tsx` | Dashboard |
| `Home/AbogadosJefe.cshtml` | `/admin/dashboards/lawyers-chief/page.tsx` | Dashboard |
| `Home/UnidadPatrimonial.cshtml` | `/admin/dashboards/patrimony/page.tsx` | Dashboard |
| `Home/EstadisticasIncidentes.cshtml` | `/admin/analytics/incidents/page.tsx` | Analytics |
| `Account/Login.cshtml` | `/login/page.tsx` | Auth |
| `Incidentes/Index.cshtml` | `/incidents/page.tsx` | Lista |
| `Incidentes/Create.cshtml` | `/incidents/new/page.tsx` | Form |
| `Incidentes/Edit.cshtml` | `/incidents/[id]/edit/page.tsx` | Form |
| `Incidentes/Details.cshtml` | `/incidents/[id]/page.tsx` | Detalle |
| `Incidentes/Previsualizacion.cshtml` | `/incidents/[id]/preview/page.tsx` | Preview |
| `Denuncias/Index.cshtml` | `/complaints/page.tsx` | Lista |
| `Denuncias/Create.cshtml` | `/complaints/new/page.tsx` | Form (cascadas) |
| `Causas/Index.cshtml` | `/legal-cases/page.tsx` | Lista |
| `Causas/Reporte.cshtml` | `/legal-cases/[id]/report/page.tsx` | Reporte (completar impl.) |
| `Querellas/Index.cshtml` | `/complaints-private/page.tsx` | Lista |
| `Incendios/Index.cshtml` | `/fires/page.tsx` | Lista |
| `Incendios/Importar.cshtml` | `/fires/import/page.tsx` | Upload batch |
| `Resoluciones/Index.cshtml` | `/resolutions/page.tsx` | Lista |
| `Regiones/Index.cshtml` | `/admin/master-data/regions/page.tsx` | Maestro |
| `Provincias/Index.cshtml` | `/admin/master-data/provinces/page.tsx` | Maestro |
| `Comunas/Index.cshtml` | `/admin/master-data/communes/page.tsx` | Maestro |
| `Zonas/Index.cshtml` | `/admin/master-data/zones/page.tsx` | Maestro |
| `Areas/Index.cshtml` | `/admin/master-data/areas/page.tsx` | Maestro |
| `Predios/Index.cshtml` | `/admin/master-data/properties/page.tsx` | Maestro |
| `Tribunales/Index.cshtml` | `/admin/master-data/courts/page.tsx` | Maestro |
| `Fiscalias/Index.cshtml` | `/admin/master-data/fiscalias/page.tsx` | Maestro |
| `Fiscales/Index.cshtml` | `/admin/master-data/prosecutors/page.tsx` | Maestro |
| `UnidadPoliciales/Index.cshtml` | `/admin/master-data/police-units/page.tsx` | Maestro |
| `Usuarios/Index.cshtml` | `/admin/security/users/page.tsx` | Seguridad |
| `Usuarios/CambiarPassword.cshtml` | `/settings/change-password/page.tsx` | Config |
| `Permisos/Index.cshtml` | `/admin/security/roles/page.tsx` | Seguridad |
| `Personas/Index.cshtml` | `/persons/page.tsx` | Maestro |
| `Vehiculos/Index.cshtml` | `/vehicles/page.tsx` | Maestro |
| `BienAfectados/Index.cshtml` | `/admin/master-data/affected-goods/page.tsx` | Maestro |
| `MedioIncautados/Index.cshtml` | `/seizures/page.tsx` | Registro |
| `Cruce/Index.cshtml` | `/searches/cross-search/page.tsx` | Herramienta |
| `Consultas/Auditoria.cshtml` | `/admin/audit/page.tsx` | Auditoría (arreglar bug) |
| `Consultas/RutMasivos.cshtml` | `/searches/bulk-rut/page.tsx` | Herramienta |
| `Consultas/PatenteMasivos.cshtml` | `/searches/bulk-plate/page.tsx` | Herramienta |
| `Maat/Index.cshtml` | `/maat/import/page.tsx` | Herramienta |
| Estadísticas (12 pares) | `/reports/[report-name]/page.tsx` | Reporte (+ `?print=true`) |

---

## Esfuerzo estimado de migración

- 281 vistas → **~180 componentes/páginas** en Next.js (consolidación de Printable y duplicados).
- 55+ controllers → **30–40 route groups** lógicos en App Router.

### Criticidad

1. **Inmediato**: Incidentes (8), Denuncias (5), Causas (7), Usuarios/Seguridad (7), Dashboards (8), Maestros geográficos (30). Total: ~65.
2. **Semana 2-3**: Estadísticas (24 → 10 consolidadas), Incendios (8), Resoluciones (5), Querellas (4).
3. **Semana 3-4**: Seguimientos (5), Documentos (5), Cruce/Búsquedas (7), Auditoría (2).
4. **Post-MVP**: WebReport, utilidades, mantenimiento BD.

### Problemas técnicos clave

1. **SideMenu dinámico** → RBAC en middleware Next.js + layouts por rol.
2. **Cascadas de select** → React + TanStack Query.
3. **DataTables** → TanStack Table.
4. **Validación cliente-servidor** → schemas Zod compartidos.
5. **View Components con lógica** → Server Components + Client Components.
6. **Print/PDF** → librería server-side (pdfkit, Puppeteer).
7. **Lógica en vistas** → API routes o Server Actions.

---

## Conclusión

281 vistas bien estructuradas siguiendo CRUD estándar Razor MVC. Mayoría son **mantenedores simples**; los procesos complejos (Incidentes, Denuncias, Causas) requieren atención especial. Hay deuda técnica clara (lógica en vistas, código comentado, vistas parcialmente implementadas, duplicación Screen/Printable).

El mapeo 1:1 proporcionado permite planificación del frontend SURP 2.0 con Next.js 16 App Router.
