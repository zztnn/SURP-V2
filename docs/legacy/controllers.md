# Catálogo Completo de Controllers y Endpoints - SURP Legacy

**Documento:** Catálogo de controllers y endpoints para rediseño de SURP v2.0 (NestJS)  
**Fecha generada:** 2026-04-23  
**Scope:** ASP.NET Core 3.1 MVC + Web API  
**Nivel de detalle:** Very thorough — todas las acciones, rutas, filtros, auditoría

---

## Resumen Ejecutivo

### Conteo General
- **SURP.WEB (MVC Razor):** 57 controllers
- **SURP.API (External API):** 3 controllers  
- **Total:** 60 controllers

### Distribución por Seguridad (SURP.WEB)
- **Con [Authorize] a nivel clase:** 41 controllers
- **Sin [Authorize] a nivel clase:** 16 controllers (CRÍTICO)

### Controllers Más Complejos (por cantidad de métodos)
1. **EstadisticasController** — 37 métodos (1906 líneas)
2. **IncidentesController** — 36 métodos (2983 líneas)
3. **DenunciasController** — 24 métodos (1338 líneas)
4. **CausasController** — 20 métodos (1248 líneas)
5. **UsuariosController** — 16 métodos (701 líneas)
6. **IncendiosController** — 16 métodos (1077 líneas)
7. **ConsultasController** — 16 métodos (707 líneas)

### Hallazgos Críticos de Seguridad

| Hallazgo | Controllers Afectados | Severidad | Riesgo |
|----------|----------------------|-----------|--------|
| Sin [Authorize] | 16 controllers | CRÍTICO | Acceso público no autorizado |
| Filtro por empresa comentado | DenunciasController (línea 86) | CRÍTICO | Data leak cross-tenant |
| Sin filtro de empresa | IncidentesController, EstadisticasController, VehiculosController, PersonasController | CRÍTICO | Visibility de datos cruzados |
| Endpoint expone TODO sin filtro | `/araucaria/incidentes` (API) | CRÍTICO | Leak de incidentes completos |
| Path traversal | StorageController.Download() | CRÍTICO | Lectura de archivos arbitrarios |
| GUID hardcoded | AccountController, API controllers | ALTO | Encriptación débil |
| CORS abierto | SURP.API Startup | ALTO | CSRF/Cross-site attacks |
| Upload sin validación MIME | UploadController | MEDIO | Arbitrary file upload |

---

## 1. SURP.WEB — Controllers (Razor MVC)

### Categoría: Controllers SIN [Authorize] (16 total)

Estos controllers son accesibles públicamente sin autenticación (excepto AccountController.Login que es legítimo).

---

#### 1.1 AccountController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/AccountController.cs:1-150`  
**[Authorize]:** NO  
**Líneas:** 150 | **Métodos:** 4

| # | Verbo | Ruta | Método | Autorización | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|--------------|---------|---------|-----------|----------|
| 1 | GET | `/Account` | Login() | NINGUNA | - | View | Parcial | Página de login. Muestra `ViewBag.Desarrollo = true` en DEBUG. No requiere autorización (correcto). |
| 2 | POST | `/Account` | Login(LoginViewModel model, string returnUrl) | NINGUNA | Usuario | View/Redirect | **Sí (AuditoriaUsuario)** | **Línea 36:** GUID hardcoded `a392ef91-db60-4a3c-918d-7bb30187e21a`. Busca usuario por email, desencripta password. **Línea 84:** Filtra `Perfil != UsuarioApi`. Audita con IP, Perfil, EstadoLogin (Correcto, Incorrecto, CuentaDesactivada). |
| 3 | GET/POST | `/Account/Logout` | Logout() | N/A | - | Redirect | NO | SignOut de sesión cookie. |
| 4 | GET | `/Account/AccessDenied` | AccessDenied() | N/A | - | View | NO | Página 403 de acceso denegado. |

**Observaciones de Seguridad:**
- ✓ Sin [Authorize] es CORRECTO para Login
- ✗ GUID de encriptación hardcoded (reutilizado en API)
- ✓ Auditoría completa de intentos de login
- ✗ No valida si usuario existe antes de desencriptar (línea 48, podría NullReferenceException)

---

#### 1.2 ArchivosPersonaController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/ArchivosPersonaController.cs:1-110`  
**[Authorize]:** NO  
**Líneas:** 110 | **Métodos:** 3

| # | Verbo | Ruta | Método | Autorización | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|--------------|---------|---------|-----------|----------|
| 1 | POST | `/ArchivosPersona/InsertArchivoPersona` | InsertArchivoPersona([FromForm] ArchivoPersona) | NINGUNA | ArchivoPersona | IActionResult | NO | **CRÍTICO:** Sin validación de usuario. Cualquiera puede subir archivos para cualquier persona. |
| 2 | GET | `/ArchivosPersona/GetArchivosPersona/{userId}` | GetArchivosPersona(int userId) | NINGUNA | ArchivoPersona | IActionResult | NO | **CRÍTICO:** Retorna archivos de CUALQUIER usuario sin validación. |
| 3 | GET | `/ArchivosPersona/DeleteConfirmed/{id}` | DeleteConfirmed(int archivoPersonaId) | NINGUNA | ArchivoPersona | IActionResult | NO | **CRÍTICO:** Elimina archivo sin validar propiedad. |

**Riesgo:** CRÍTICO — Acceso sin autorización a archivos personales.

---

#### 1.3 ConsultasController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/ConsultasController.cs:1-707`  
**[Authorize]:** NO  
**Líneas:** 707 | **Métodos:** 16

| # | Verbo | Ruta | Método | Autorización | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|--------------|---------|---------|-----------|----------|
| 1 | GET | `/Consultas/Bloqueos` | Bloqueos() | NINGUNA | - | View | NO | Interfaz de consulta de bloqueos (RUT/Patente). |
| 2 | GET | `/Consultas/RutMasivos` | RutMasivos() | NINGUNA | - | View | NO | Interfaz de consulta masiva de RUTs. |
| 3 | GET | `/Consultas/PatenteMasivos` | PatenteMasivos() | NINGUNA | - | View | NO | Interfaz de consulta masiva de patentes. |
| 4 | GET | `/Consultas/GetRut/{rut}` | GetRut(string rut) | NINGUNA | Persona | JSON | **Sí (AuditoriaConsulta)** | **Línea 51:** Query sin filtro: `_context.Personas.FirstOrDefault(x => x.Rut == rut)`. Audita con UsuarioId obtenido de `User.FindFirst(ClaimTypes.Actor).Value` pero SIN validar si existe. |
| 5 | GET | `/Consultas/GetPatente/{patente}` | GetPatente(string patente) | NINGUNA | Vehiculo | JSON | **Sí (AuditoriaConsulta)** | **Línea 113:** Query sin filtro: `_context.Vehiculos.FirstOrDefault(...)`. Mismo patrón de auditoría. |
| 6 | GET | `/Consultas/Auditoria` | Auditoria(DateTime desde, DateTime hasta, int usuarioId) | NINGUNA | - | View | NO | Interfaz de auditoría de consultas. |
| 7 | POST | `/Consultas/GetTable` | GetTable() | NINGUNA | AuditoriaConsulta | JSON (DataTable) | NO | Paginación de auditoría de consultas sin filtro de usuario. |
| 8 | POST | `/Consultas/ExportExcelRuts` | ExportExcelRuts([FromBody] string resultados) | NINGUNA | Persona | File (Excel) | **Sí (AuditoriaConsulta)** | **Línea 290:** BulkInsert de auditorías. Genera Excel con RUTs y estado. |
| 9 | GET | `/Consultas/ImportRuts` | ImportRuts([FromServices] IWebHostEnvironment) | NINGUNA | - | View | NO | Interfaz de import de RUTs. |
| 10 | POST | `/Consultas/ExportExcelPatentes` | ExportExcelPatentes([FromBody] string resultados) | NINGUNA | Vehiculo | File (Excel) | **Sí (AuditoriaConsulta)** | Análogo a ExportExcelRuts. |
| 11 | GET | `/Consultas/ImportPatentes` | ImportPatentes([FromServices] IWebHostEnvironment) | NINGUNA | - | View | NO | Interfaz de import de patentes. |
| 12 | GET | `/Consultas` | Index (default) | NINGUNA | - | View | NO | Dashboard de consultas. |
| 13-16 | VARIOS | `/Consultas/*` | Métodos auxiliares (SetearColumna, ValidaRut, Digito, ExportExcel) | NINGUNA | - | Utilidad | Depende | Helpers de validación y exportación. |

**Riesgo:** CRÍTICO — Todas las consultas de bloqueos (RUT/Patente) son públicas. Se audita la consulta pero NO se filtra acceso.

**Notas:**
- GetRut/GetPatente: Audita pero no valida existencia de usuario
- ExportExcel: Bulk inserts sin transaction logging
- ImportRuts/Patentes: Carga archivos sin validación de MIME

---

#### 1.4 CruceController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/CruceController.cs:1-503`  
**[Authorize]:** NO  
**Líneas:** 503 | **Métodos:** 7

| # | Verbo | Ruta | Método | Autorización | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|--------------|---------|---------|-----------|----------|
| 1 | GET | `/Cruce` | Index() | NINGUNA | - | View | NO | Interfaz de cruces (MAAT). |
| 2 | GET | `/Cruce/Historial` | Historial(DateTime desde) | NINGUNA | MAAT | IActionResult | NO | Historial de cruces sin filtros de seguridad. |
| 3 | GET | `/Cruce/Detalle/{maatId}` | Detalle(int maatId) | NINGUNA | MAAT | IActionResult | NO | Detalle de cruce sin validación de acceso. |
| 4 | POST | `/Cruce/EditarResultado` | EditarResultado([FromBody] string) | NINGUNA | MAAT | bool (JSON) | NO | Modifica resultado de cruce. |
| 5 | POST | `/Cruce/ComenzarProceso` | ComenzarProceso([FromBody]) | NINGUNA | MAAT | int (JSON) | NO | Inicia proceso de cruce. |
| 6 | POST | `/Cruce/ProcesarNodo` | ProcesarNodo([FromBody] string) | NINGUNA | MAAT | bool (JSON) | NO | Procesa nodo del árbol de cruce. |
| 7 | POST | `/Cruce/GenerarExcel` | GenerarExcel([FromBody] int maatId) | NINGUNA | MAAT | File (Excel) | NO | Exporta cruce a Excel sin filtro. |

**Riesgo:** ALTO — Acceso sin autorización a datos de cruces (MAAT).

---

#### 1.5 DestinosController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/DestinosController.cs:1-193`  
**[Authorize]:** NO  
**Líneas:** 193 | **Métodos:** 5

CRUD completo sin [Authorize]:
- GET `/Destinos/Create/{iddenuncia}` — Create form
- GET `/Destinos/GetDestino/{destino}` — Query destino
- POST `/Destinos/Create` — Insert
- GET/POST `/Destinos/Edit/{id}` — Update
(No Delete, pero Edit/Create sin validación)

**Riesgo:** ALTO.

---

#### 1.6 DocumentoCausasController
**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/DocumentoCausasController.cs:1-261`  
**[Authorize]:** NO  
**Líneas:** 261 | **Métodos:** 8

CRUD completo sin [Authorize]: Index, Details, Create (GET/POST), Edit (GET/POST), Delete (GET/POST).

**Riesgo:** ALTO — Acceso a documentos de causas sin autorización.

---

#### 1.7 EvidenciasController
**Ubicación:** `SURP.WEB/Controllers/EvidenciasController.cs:1-217`  
**[Authorize]:** NO  
**Líneas:** 217 | **Métodos:** 5

CRUD: Index, Details, Create (GET/POST), DeleteConfirmed.

**Riesgo:** ALTO — Acceso a evidencias sin autorización.

---

#### 1.8 FotosController
**Ubicación:** `SURP.WEB/Controllers/FotosController.cs:1-403`  
**[Authorize]:** NO  
**Líneas:** 403 | **Métodos:** 9

| # | Ruta | Método | Detalles |
|---|------|--------|----------|
| 1 | GET `/Fotos/Index/{incidenteId}` | Index(int incidenteId) | Lista fotos de incidente. |
| 2 | POST `/Fotos/GetFotos` | GetFotos(int incidenteId) | Retorna JSON de fotos. |
| 3-5 | POST/GET | Create, Edit (CRUD) | Subir/editar fotos sin validación. |
| 6-7 | GET/DELETE | Delete | Elimina foto. |
| 8 | POST `/Fotos/Download/{id}` | Download(int id) | Descarga foto. |
| 9 | GET `/Fotos/Preview/{id}` | Preview(int id) | Vista previa sin filtro. |

**Riesgo:** ALTO — Acceso a fotos de incidentes sin autorización.

---

#### 1.9 FotosIncidenteExternosController
**Ubicación:** `SURP.WEB/Controllers/FotosIncidenteExternosController.cs:1-228`  
**[Authorize]:** NO  
**Líneas:** 228 | **Métodos:** 8

Análogo a FotosController pero para incidentes externos.

**Riesgo:** ALTO.

---

#### 1.10 GuiaDespachosController
**Ubicación:** `SURP.WEB/Controllers/GuiaDespachosController.cs:1-266`  
**[Authorize]:** NO  
**Líneas:** 266 | **Métodos:** 9

CRUD de Guías de Despacho sin [Authorize].

**Riesgo:** ALTO — Guías sin autorización.

---

#### 1.11 IncendiosController
**Ubicación:** `SURP.WEB/Controllers/IncendiosController.cs:1-1077`  
**[Authorize]:** NO  
**Líneas:** 1077 | **Métodos:** 16

| # | Ruta | Método | Detalles |
|---|------|--------|----------|
| 1 | GET `/Incendios` | Index(int periodo) | Filtra por período pero SIN validación de usuario. |
| 2-14 | VARIOS | CRUD + Reportes | Detalles, Create, Edit, Delete, Reportes (print, Excel), Formulario (PDF), ComenzarProceso, ExportarDatos. |
| 15-16 | POST | GetFormulaios, Procesamiento | Métodos de procesamiento. |

**Riesgo:** CRÍTICO — Sección completa de Incendios pública. 16 métodos sin [Authorize]. Acceso a reportes, formularios, datos.

---

#### 1.12 IncidenteExternoBienAfectadosController
**Ubicación:** `SURP.WEB/Controllers/IncidenteExternoBienAfectadosController.cs:1-203`  
**[Authorize]:** NO  
**Líneas:** 203 | **Métodos:** 8

CRUD de bienes afectados de incidentes externos sin [Authorize].

**Riesgo:** ALTO.

---

#### 1.13 IncidenteSeguimientosController
**Ubicación:** `SURP.WEB/Controllers/IncidenteSeguimientosController.cs:1-178`  
**[Authorize]:** NO  
**Líneas:** 178 | **Métodos:** 8

CRUD de seguimientos de incidentes.

**Riesgo:** ALTO.

---

#### 1.14 MaatController
**Ubicación:** `SURP.WEB/Controllers/MaatController.cs:1-1277`  
**[Authorize]:** NO  
**Líneas:** 1277 | **Métodos:** 3

| # | Ruta | Método | Detalles |
|---|------|--------|----------|
| 1 | GET `/Maat` | Index() | Interfaz MAAT. |
| 2 | POST `/Maat/Export` | Export([FromBody] string resultados) | Exporta datos MAAT a Excel. |
| 3 | POST `/Maat/ProcessData` | ProcessData() | Procesa datos sin auditoría. |

**Riesgo:** CRÍTICO — Acceso sin autorización a procesamiento y exportación de datos MAAT.

---

#### 1.15 QuerellasController
**Ubicación:** `SURP.WEB/Controllers/QuerellasController.cs:1-218`  
**[Authorize]:** NO  
**Líneas:** 218 | **Métodos:** 7

CRUD de Querelas sin [Authorize].

**Riesgo:** ALTO.

---

#### 1.16 SeguimientosController
**Ubicación:** `SURP.WEB/Controllers/SeguimientosController.cs:1-434`  
**[Authorize]:** NO  
**Líneas:** 434 | **Métodos:** 14+

| # | Ruta | Método | Detalles |
|---|------|--------|----------|
| 1-7 | `/Seguimientos` | CRUD (Index, Details, Create, Edit, Delete) | Gestión de seguimientos. |
| 8-10 | `/Seguimientos/Reportes*` | Reportes, ReportePrint, ReporteExcel | Reportes sin filtro. |
| 11-14 | `/Seguimientos/*` | GetSeguimientos, GetDetalle, GetGrafico, ExportarDatos | Métodos de dato sin autorización. |

**Riesgo:** CRÍTICO — 14 métodos públicos incluyendo reportes y exportación.

---

#### 1.17 SeguimientoVehiculosController
**Ubicación:** `SURP.WEB/Controllers/SeguimientoVehiculosController.cs:1-728`  
**[Authorize]:** NO  
**Líneas:** 728 | **Métodos:** 12

Análogo a SeguimientosController pero para vehículos.

**Riesgo:** ALTO — Seguimientos vehiculares públicos.

---

#### 1.18 StorageController
**Ubicación:** `SURP.WEB/Controllers/StorageController.cs:1-60`  
**[Authorize]:** NO  
**Líneas:** 60 | **Métodos:** 1

| # | Ruta | Método | Detalles |
|---|------|--------|----------|
| 1 | GET `/Storage/Download/{fileName}` | Download(string fileName) | **CRÍTICO:** Descarga archivo directo sin validación de ruta. **VULNERABILIDAD:** Path traversal (ej. `fileName = ../../../etc/passwd`). |

**Riesgo:** CRÍTICO — Path traversal vulnerability.

---

### Resumen Controllers SIN [Authorize]

| # | Controller | Líneas | Métodos | Riesgo | Acción |
|---|-----------|--------|---------|--------|--------|
| 1 | AccountController | 150 | 4 | BAJO | Mantener (Login es legítimo) |
| 2 | ArchivosPersonaController | 110 | 3 | CRÍTICO | Remover o securizar |
| 3 | ConsultasController | 707 | 16 | CRÍTICO | Agregar [Authorize] + auditoría |
| 4 | CruceController | 503 | 7 | ALTO | Agregar [Authorize] |
| 5 | DestinosController | 193 | 5 | ALTO | Agregar [Authorize] |
| 6 | DocumentoCausasController | 261 | 8 | ALTO | Agregar [Authorize] |
| 7 | EvidenciasController | 217 | 5 | ALTO | Agregar [Authorize] |
| 8 | FotosController | 403 | 9 | ALTO | Agregar [Authorize] |
| 9 | FotosIncidenteExternosController | 228 | 8 | ALTO | Agregar [Authorize] |
| 10 | GuiaDespachosController | 266 | 9 | ALTO | Agregar [Authorize] |
| 11 | IncendiosController | 1077 | 16 | CRÍTICO | Agregar [Authorize] |
| 12 | IncidenteExternoBienAfectadosController | 203 | 8 | ALTO | Agregar [Authorize] |
| 13 | IncidenteSeguimientosController | 178 | 8 | ALTO | Agregar [Authorize] |
| 14 | MaatController | 1277 | 3 | CRÍTICO | Agregar [Authorize] |
| 15 | QuerellasController | 218 | 7 | ALTO | Agregar [Authorize] |
| 16 | SeguimientosController | 434 | 14 | CRÍTICO | Agregar [Authorize] |
| 17 | SeguimientoVehiculosController | 728 | 12 | ALTO | Agregar [Authorize] |
| 18 | StorageController | 60 | 1 | CRÍTICO | Remover (path traversal) |

---

### Categoría: Controllers CON [Authorize] (41 total)

Los siguientes 41 controllers tienen `[Authorize]` a nivel clase:

#### Catálogos (Sin Auditoría, Bajo Riesgo)

1. **AbogadoCausasController** — 212 líneas, 8 métodos
   - CRUD de relación Abogado-Causa
   - Sin auditoría
   - Sin filtro de empresa verificado

2. **AreasController** — 176 líneas, 8 métodos
   - CRUD de Área (catálogo geográfico)
   - Sin auditoría
   - Catálogo compartido (no filtra por empresa)

3. **BienAfectadosController** — 242 líneas, 8 métodos
   - CRUD de Bien Afectado
   - Sin auditoría
   - Catálogo

4. **CausaQuerellasController** — 80 líneas, 3 métodos
   - Relación Causa-Querella
   - Sin auditoría

5. **ComunasController** — 186 líneas, 9 métodos
   - CRUD de Comuna (catálogo)
   - Método Region() para dropdown
   - Sin auditoría

6. **DenunciaImputadosController** — 201 líneas, 8 métodos
   - Relación Denuncia-Imputado
   - Sin auditoría

7. **DenunciaTestigosController** — 222 líneas, 8 métodos
   - Relación Denuncia-Testigo
   - Sin auditoría

8. **DenunciaVehiculosController** — 301 líneas, 8 métodos
   - Relación Denuncia-Vehículo
   - Sin auditoría

9. **DenunciaVehiculosNIController** — 266 líneas, 8 métodos
   - Relación Denuncia-Vehículo (No Identificado)
   - Sin auditoría

10. **EmpresaExternasController** — 166 líneas, 8 métodos
    - CRUD de Empresa Externa
    - Sin auditoría
    - Catálogo

11. **FiscalesController** — 170 líneas, 8 métodos
    - CRUD de Fiscal (catálogo)
    - Sin auditoría

12. **FiscaliasController** — 170 líneas, 8 métodos
    - CRUD de Fiscalía (catálogo)
    - Sin auditoría

13. **HitosController** — 283 líneas, 8 métodos
    - CRUD de Hito (catálogo)
    - Sin auditoría

14. **MedioIncautadosController** — 186 líneas, 8 métodos
    - CRUD de Medio Incautado
    - Sin auditoría

15. **NoIncautadosController** — 141 líneas, 7 métodos
    - CRUD de artículo No Incautado
    - Sin auditoría

16. **PermisosController** — 170 líneas, 8 métodos
    - CRUD de Permiso
    - Sin auditoría

17. **ProvinciasController** — 181 líneas, 8 métodos
    - CRUD de Provincia (catálogo)
    - Sin auditoría

18. **RegionesController** — 174 líneas, 8 métodos
    - CRUD de Región (catálogo)
    - Sin auditoría

19. **ResolucionesController** — 214 líneas, 8 métodos
    - CRUD de Resolución
    - Sin auditoría

20. **TribunalesController** — 174 líneas, 8 métodos
    - CRUD de Tribunal (catálogo)
    - Sin auditoría

21. **UnidadPolicialesController** — 184 líneas, 9 métodos
    - CRUD de Unidad Policial (catálogo)
    - Método Institucion() para dropdown
    - Sin auditoría

22. **ZonasController** — ~174 líneas, 8 métodos
    - CRUD de Zona (catálogo)
    - Sin auditoría

#### Datos Críticos con Filtros Parciales o Sin Filtros (Riesgo MEDIO-CRÍTICO)

23. **AuditoriaApisController** — 198 líneas, 3 métodos
    - Index: Interfaz de auditoría API (fecha/usuario)
    - GetTable: DataTable paginada de `AuditoriaApi`
    - ExportExcel: Exporta auditorías
    - Sin filtro de empresa verificado

24. **AuditoriaPersonaApisController** — 201 líneas, 3 métodos
    - Index, GetTable, ExportExcel análogos
    - Sin filtro de empresa

25. **CausasController** — 1248 líneas, 20 métodos
    - **CRÍTICO:** Métodos principales:
      - Index: Filtra causas por tipo delito, estado, zona, área, predio, fiscal, fiscalía, tribunal, abogado
      - **Línea 72-78:** Obtiene Usuario y su Empresa pero SIN verificar si se filtra en Query
      - ReportPrint: Reporte sin filtro verificado
      - Details, Create (GET/POST), Edit (GET/POST), Delete
      - DeleteAbogado, DeleteHito, DeleteResolucion, DeleteResolucionPersona, DeleteDocumento, DeleteQuerella, DeleteEvidencia
    - Sin auditoría de cambios
    - **Observación:** Acceso a Causas requiere análisis profundo de GetTable para verificar si filtra por empresa

26. **DenunciasController** — 1338 líneas, 24 métodos
    - **CRÍTICO:**
      - Index: Filtra denuncias por delito, institución, fecha, zona, área, predio, unidad policial, avalúo, fiscalía
      - **Línea 56-61:** Obtiene Usuario por email
      - **LÍNEA 86: FILTRO POR EMPRESA COMENTADO:**
        ```csharp
        // denuncias = denuncias.Where(e => e.AddUser.EmpresaId == Usuario.EmpresaId);
        ```
      - **IMPACTO:** TODAS las denuncias visibles para TODOS los usuarios autenticados (data leak cross-tenant)
      - GetTable: DataTable paginada (hereda el problema del Index)
      - Details, Create (GET/POST), Edit (GET/POST), Delete
      - DeleteTestigo, DeleteImputado, DeleteGuia, DeleteDestino, DeleteVehiculo, DeleteVehiculoNI, DeleteCausa, DeleteMedio
    - Sin auditoría de cambios
    - **ACCIÓN INMEDIATA:** Descomenter filtro de empresa en línea 86

27. **EstadisticasController** — 1906 líneas, 37 métodos (MAYOR COMPLEJIDAD)
    - Reportes estadísticos por zona, abogado, avalúo, hallazgos, causas terminadas, imputados, etc.
    - Métodos en triplicado (normal, printable, print):
      - CausasPorZona / CausasPorZonaPrintable / CausasPorZonaPrint
      - CausasPorAbogado / CausasPorAbogadoPrintable / CausasPorAbogadoPrint
      - CausaAbogadoZona / CausaAbogadoZonaPrintable / CausaAbogadoZonaPrint
      - AvaluoPorZona / AvaluoPorZonaPrintable / AvaluoPorZonaPrint
      - HallazgosPorZona / HallazgosPorZonaPrintable / HallazgosPorZonaPrint
      - CausasTerminadas / CausasTerminadasPrintable / CausasTerminadasPrint
      - CausasTerminadasPorEstado / ... (3 variantes)
      - NumeroImputados / ... (3 variantes)
      - + más
    - **Riesgo:** Sin filtro de empresa verificado — reportes podrían exponer datos cruzados
    - Sin auditoría

28. **HomeController** — 449 líneas, 14 métodos
    - Dashboard con múltiples reportes:
      - Index: Dashboard principal
      - ReporteBienAfectado, ReportesEstadistica, ReportesCausa, ReportesDenuncia, ReportesIncidente, ReportesIncendio, ReportesVehiculo, ReportesPersona, ReportesGuia, ReportesResolucion, ReportesHito
      - About: Información de la aplicación
    - Sin auditoría
    - Sin filtro de empresa verificado

29. **IncidenteBienAfectadosController** — 213 líneas, 8 métodos
    - Relación Incidente-BienAfectado (CRUD)
    - Sin auditoría

30. **IncidenteExternosController** — 670 líneas, 14 métodos
    - Index: Filtra incidentes externos
    - GetTable: DataTable paginada
    - Details, Create (GET/POST), Edit (GET/POST), Delete
    - DeleteDenuncia: Elimina denuncia relacionada
    - Zona, Area: Dropdowns
    - **Sin filtro de empresa verificado**
    - Sin auditoría

31. **IncidentePrediosController** — 281 líneas, 10 métodos
    - Relación Incidente-Predio (CRUD)
    - Helpers: Zona, Area (dropdown)
    - Sin auditoría

32. **IncidentesController** — 2983 líneas, 36 métodos (SEGUNDO MAYOR)
    - **CRÍTICO:**
      - Index: Filtra incidentes por tipo, zona, área, predio, persona, vehículo, fecha
      - **Línea 98-99:** Obtiene Usuario de claim
      - **PROBLEMA:** Usuario se obtiene pero NO se filtra en Query
      - **Línea 138-140 (GetTable):** `var result = _context.Incidentes.Where(x => x.Activo && x.FechaTomaConocimiento >= desde && x.FechaTomaConocimiento <= hasta...)`
      - **NO HAY FILTRO POR EMPRESA EN QUERY**
      - **Línea 193 (GetTable):** Usuario se obtiene solo para mapear `PerfilUsuario` a DTO
      - **Línea 156-158:** Filtros de zona/área aplican pero SIN filtro previo de empresa
      - GetIncidentesIndices: POST para índices
      - Previsualizacion, ReportPrint (x2): Reportes sin filtro
      - Details, Create (GET/POST), Edit (GET/POST), Delete
      - CreaKml, KmlMultiple: Generan KML para mapas
      - DeletePredio, DeleteDenuncia, DeleteBienAfectado, DeleteFoto
      - ExportExcel, ExportRelatos: Exportan datos
    - **RIESGO CRÍTICO:** Todos los incidentes visibles para todos los usuarios autenticados
    - Sin auditoría de cambios
    - **ACCIÓN INMEDIATA:** Agregar WHERE con filtro de empresa

33. **PersonasController** — 663 líneas, 15 métodos
    - Index: Filtra personas
    - GetTable: DataTable paginada
    - Details, Create (GET/POST), Edit (GET/POST), Delete
    - BloqueDesbloquea: POST para bloquear/desbloquear persona
    - Auditoria: Interfaz + GetAuditoria para DataTable
    - ExportExcel: Exporta personas
    - **Sin filtro de empresa**
    - Auditoría: Registra en `AuditoriaPersona` bloqueos/desbloqueos

34. **PrediosController** — 326 líneas, 13 métodos
    - Index, Details, Create (GET/POST), Edit (GET/POST), Delete
    - Zona, Area, Comuna: Helpers para dropdowns
    - ImpropiasAcciones: Datos de acciones
    - **Catálogo compartido (no filtra por empresa por diseño)**
    - Sin auditoría

35. **ResolucionPersonasController** — 437 líneas, 6 métodos
    - Relación Resolución-Persona (CRUD limitado)
    - Sin auditoría

36. **UploadController** — 142 líneas, 4 métodos
    - UploadFile: POST sin validación de MIME
    - DeleteFile: Elimina archivo por nombre
    - FilesCount: Cuenta archivos
    - GetMetadata: Metadatos
    - **Riesgo:** Upload sin validación de extensión/MIME

37. **UsuariosController** — 701 líneas, 16 métodos
    - **BIEN DISEÑADO:**
      - Index: **Línea ~70:** Filtra usuarios por `EmpresaId = User.FindFirst(ClaimTypes.PrimarySid).Value` ✓
      - GetTable: DataTable (probablemente con filtro)
    - Details, Create (GET/POST), Edit (GET/POST), Delete
    - ResetPassword: POST para resetear contraseña
    - Auditoria: Interfaz + GetAuditoria
    - ExportExcel: Exporta usuarios
    - **Auditoría:** Registra intentos de login en `AuditoriaUsuario`
    - **NOTA:** Cambios de datos de usuario NO auditados

38. **VehiculosController** — 1231 líneas, 15 métodos
    - Index: Filtra vehículos
    - GetTable: DataTable paginada
    - Details, Create (GET/POST), Edit (GET/POST), Delete
    - BloqueDesbloquea: POST para bloquear/desbloquear vehículo
    - Auditoria: Interfaz + GetAuditoria
    - ExportExcel: Exporta vehículos
    - **Sin filtro de empresa**
    - Auditoría: Registra en `AuditoriaVehiculo` bloqueos/desbloqueos

39. **VehiculosNIController** — ~266 líneas, 8+ métodos
    - Análogo a VehiculosController para vehículos No Identificados
    - Sin filtro de empresa
    - Sin auditoría completa

40. **IncidenteExternosController** (duplicado, ya listado)

41. **BaseController** — 30 líneas
    - Base class (OnActionExecutionAsync comentado)
    - Código comentado/muerto

---

### Controllers v1 (API Internos)

**Ubicación:** `/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Controllers/v1/`

#### v1/DenunciaController
Requiere lectura para detalles.

#### v1/VehiculoController
Requiere lectura para detalles.

---

## 2. SURP.API — Controllers (API Externa)

### Arquitectura General

- **Endpoint base:** Definido en `[Route(...)]` de cada controller
- **Autenticación:** Headers `usr` (email) y `pwd` (password), no Bearer tokens
- **Encriptación:** Desencriptación de password con GUID hardcoded `a392ef91-db60-4a3c-918d-7bb30187e21a`
- **CORS:** Abierto en `Startup.cs` (AllowAnyOrigin, AllowAnyMethod, AllowAnyHeader)
- **Auditoría:** Fire-and-forget via `IFireForgetRepositoryHandler` (async sin esperar)

---

#### 2.1 AraucariaController
**Route:** `/araucaria/incidentes`  
**Archivo:** `SURP.API/Controllers/AraucariaController.cs:1-62`

| # | Verbo | Ruta | Método | Autenticación | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|---------------|---------|---------|-----------|----------|
| 1 | GET | `/araucaria/incidentes` | Get() | Header usr/pwd | AraucariaIncidente | JSON (List<AraucariaIncidente>) | **NO** | **CRÍTICO:** Expone TODOS los incidentes de la tabla `AraucariaIncidentes` sin filtro. **Línea 55-57:** Query simple: `_context.AraucariaIncidentes.ToListAsync()`. **Línea 59:** Ordena descendente por `FechaTomaConocimiento`. |

**Seguridad de Autenticación (líneas 25-52):**
- Extrae header `usr` (email), `pwd` (password)
- Busca usuario en `_context.Usuarios` por email
- Desencripta password con GUID hardcoded
- Compara con password enviado
- Sin logging de intentos fallidos
- Sin rate limiting

**Riesgo:**
- GUID hardcoded (encriptación débil)
- **EXPONE LISTA COMPLETA sin filtro de empresa**
- Sin auditoría de consulta
- Sin rate limiting
- CORS abierto permite peticiones desde cualquier origen

---

#### 2.2 PersonaController
**Route:** `/entidad/{rut}`  
**Archivo:** `SURP.API/Controllers/PersonaController.cs:1-82`

| # | Verbo | Ruta | Método | Autenticación | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|---------------|---------|---------|-----------|----------|
| 1 | GET | `/entidad/{rut}` | GetEstadoPersona(string rut) | Header usr/pwd | Persona | JSON (`{ success: bool, bloqueado: bool }`) | **Sí (AuditoriaPersonaApi)** | Consulta si RUT está bloqueado. **Línea 61:** Query: `_context.Personas.Where(x => x.Rut == rut && x.Bloqueado).CountAsync()` → retorna count > 0. |

**Auditoría Completa (líneas 63-76):**
- UsuarioId (del usuario que hace la consulta)
- Rut (consultado)
- AddDate (DateTime.Now)
- Resultado (bool: si está bloqueado)
- TiempoRespuesta (decimal milliseconds)
- Ip (RemoteIpAddress)

**Fire-and-forget (líneas 73-76):**
```csharp
_fireForgetRepositoryHandler.Execute(async repositorio =>
{
    await repositorio.AuditarPersona(auditoriaPersonaApi);
});
```

**Riesgo:**
- Bajo para el endpoint en sí (audita bien)
- GUID hardcoded (autenticación débil)
- CORS abierto

---

#### 2.3 VehiculoController
**Route:** `/vehiculo/{patente}`  
**Archivo:** `SURP.API/Controllers/VehiculoController.cs:1-97`

| # | Verbo | Ruta | Método | Autenticación | Entidad | Retorno | Auditoría | Detalles |
|---|-------|------|--------|---------------|---------|---------|-----------|----------|
| 1 | GET | `/vehiculo/{patente}` | GetEstadoVehiculo(string patente) | Header usr/pwd | Vehiculo | JSON (`{ success: bool, bloqueado: bool }`) | **Sí (AuditoriaApi)** | Consulta si patente está bloqueada. **Línea 64:** Query: `_context.Vehiculos.Where(x => x.Patente == patente && x.Bloqueado).CountAsync()`. |

**Auditoría Completa (líneas 77-85):**
- UsuarioId
- Patente
- AddDate
- Resultado (bool)
- TiempoRespuesta (decimal)
- Ip (con manejo de IPv6 → IPv4 conversión, líneas 66-75)

**Líneas Interesantes (comentarios de debug):**
```csharp
// En mi casa hay arbustos y yo quiero a la iris bustos ..... POEI!! ANDA LA OSA!! SEGURITA !!
// JUANCHOCHE !!!
// AHORA CON APP SERVICE EN WINDOWS!!!
```

**Riesgo:** Similar a PersonaController — audita bien pero autenticación débil.

---

### Resumen SURP.API

| Endpoint | Autenticación | Filtra por Empresa | Auditoría | Riesgo | Notas |
|----------|---------------|-------------------|-----------|--------|-------|
| `/araucaria/incidentes` | usr/pwd (hardcoded) | NO | NO | **CRÍTICO** | Expone TODO |
| `/entidad/{rut}` | usr/pwd (hardcoded) | N/A | Sí (bien) | MEDIO | Consulta bien auditada |
| `/vehiculo/{patente}` | usr/pwd (hardcoded) | N/A | Sí (bien) | MEDIO | Consulta bien auditada |

---

## 3. Mapa de Seguridad - Matriz Resumen

| Controller | [Authorize] | Filtra Empresa | Filtra Asignación | Auditoría | Riesgo | Justificación |
|:-----------|:----------:|:-------------:|:----------------:|:---------:|:------:|:------|
| AbogadoCausasController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| AccountController | NO | N/A | N/A | Sí | **BAJO** | Login legítimamente público |
| ArchivosPersonaController | NO | NO | NO | NO | **CRÍTICO** | Acceso a archivos sin validación |
| AreasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo compartido |
| AuditoriaApisController | Sí | NO | NO | N/A | MEDIO | Acceso a auditoría sin filtro |
| AuditoriaPersonaApisController | Sí | NO | NO | N/A | MEDIO | Acceso a auditoría sin filtro |
| BienAfectadosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| CausaQuerellasController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| CausasController | Sí | PARCIAL | NO | NO | MEDIO | Filtra por zona/área pero no empresa |
| ComunasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| ConsultasController | NO | NO | NO | Parcial | **CRÍTICO** | Bloqueos públicos, audita pero expone |
| CruceController | NO | NO | NO | NO | **ALTO** | MAAT sin autorización |
| DenunciaImputadosController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| DenunciasController | Sí | **COMENTADO** | NO | NO | **CRÍTICO** | **FILTRO POR EMPRESA COMENTADO** |
| DenunciaTestigosController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| DenunciaVehiculosController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| DenunciaVehiculosNIController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| DestinosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| DocumentoCausasController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| EmpresaExternasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| EstadisticasController | Sí | NO | NO | NO | MEDIO | 37 reportes sin filtro empresa |
| EvidenciasController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| FiscalesController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| FiscaliasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| FotosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| FotosIncidenteExternosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| GuiaDespachosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| HitosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| HomeController | Sí | NO | NO | NO | MEDIO | Dashboard sin filtros |
| IncendiosController | NO | NO | NO | NO | **CRÍTICO** | 16 métodos, incendios sin filtro |
| IncidenteBienAfectadosController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| IncidenteExternoBienAfectadosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| IncidenteExternosController | Sí | NO | NO | NO | MEDIO | Sin filtro empresa verificado |
| IncidentePrediosController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| IncidentesController | Sí | **NO** | NO | NO | **CRÍTICO** | **Mayor riesgo: Todos los incidentes visibles** |
| IncidenteSeguimientosController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| MaatController | NO | NO | NO | NO | **CRÍTICO** | MAAT exportación/procesamiento sin auth |
| MedioIncautadosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| NoIncautadosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| PermisosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| PersonasController | Sí | NO | NO | Parcial | MEDIO | Sin filtro, audita bloqueos |
| PrediosController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| ProvinciasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| QuerellasController | NO | NO | NO | NO | **ALTO** | Sin autorización |
| RegionesController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| ResolucionesController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| ResolucionPersonasController | Sí | NO | NO | NO | MEDIO | Relación sin auditoría |
| SeguimientosController | NO | NO | NO | NO | **CRÍTICO** | 14 métodos sin autorización |
| SeguimientoVehiculosController | NO | NO | NO | NO | **ALTO** | 12 métodos sin autorización |
| StorageController | NO | NO | NO | NO | **CRÍTICO** | **Path traversal vulnerability** |
| TribunalesController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| UnidadPolicialesController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| UploadController | Sí | NO | NO | NO | MEDIO | Upload sin validación MIME |
| UsuariosController | Sí | **Sí** | NO | Parcial | **BAJO** | **Filtra correctamente por empresa** ✓ |
| VehiculosController | Sí | NO | NO | Parcial | MEDIO | Sin filtro, audita bloqueos |
| VehiculosNIController | Sí | NO | NO | NO | MEDIO | Sin filtro |
| ZonasController | Sí | N/A | N/A | NO | **BAJO** | Catálogo |
| AraucariaController (API) | NO (usr/pwd) | NO | NO | NO | **CRÍTICO** | **Expone TODOS los incidentes vía API** |
| PersonaController (API) | NO (usr/pwd) | N/A | N/A | Sí | MEDIO | Consulta bien auditada |
| VehiculoController (API) | NO (usr/pwd) | N/A | N/A | Sí | MEDIO | Consulta bien auditada |

---

## 4. Endpoints Inseguros a Deprecar en SURP 2.0

### CRÍTICO — Cerrar Inmediatamente

1. **`GET /araucaria/incidentes` (AraucariaController)**
   - Expone lista COMPLETA de incidentes sin filtro
   - No hay auditoría de acceso
   - Autenticación débil (GUID hardcoded)

2. **`GET/POST /Incidentes/*` (IncidentesController)**
   - No filtra por empresa
   - **Línea ~138-140:** Query sin filtro de empresa
   - **Línea ~193:** Usuario se obtiene pero no se filtra

3. **`GET/POST /Denuncias/*` (DenunciasController)**
   - **Línea 86: FILTRO POR EMPRESA COMENTADO**
   - Todos los usuarios ven todas las denuncias

4. **`GET /Consultas/GetRut` (ConsultasController)**
   - Consulta RUT sin restricción
   - Expone estado de bloqueo de cualquier RUT

5. **`GET /Consultas/GetPatente` (ConsultasController)**
   - Consulta patente sin restricción
   - Expone estado de bloqueo de cualquier patente

6. **`GET /Incendios/*` (IncendiosController)**
   - Sección completa sin [Authorize]
   - 16 métodos de acceso público

7. **`POST /Maat/Export` (MaatController)**
   - Exporta datos MAAT sin autorización

8. **`GET /Storage/Download/{fileName}` (StorageController)**
   - **Path traversal risk**
   - Descarga archivos sin validación de ruta

9. **`GET /Fotos/*` (FotosController)**
   - 9 métodos sin [Authorize]
   - Acceso público a fotos

10. **`GET /Seguimientos/*` (SeguimientosController)**
    - 14 métodos sin [Authorize]
    - Reportes y exportación públicos

---

### ALTO — Revisar y Remediar

11. **`GET /IncidenteExternos/*` (IncidenteExternosController)**
    - Sin filtro de empresa verificado

12. **`GET /Personas/*` (PersonasController)**
    - Sin filtro de empresa

13. **`GET /Vehiculos/*` (VehiculosController)**
    - Sin filtro de empresa

14. **`GET /Estadisticas/*` (EstadisticasController)**
    - 37 métodos sin filtro empresa verificado
    - Reportes que podrían exponer datos cruzados

15. **`POST /Upload/UploadFile` (UploadController)**
    - Sin validación MIME

---

## 5. Problemas Detectados

### P1. GUID Hardcoded en Múltiples Ubicaciones
- **GUID:** `a392ef91-db60-4a3c-918d-7bb30187e21a` (convertido a "N" = sin guiones)
- **Ubicaciones:**
  - `AccountController.cs` línea 36
  - `PersonaController.cs` (API) línea 39
  - `VehiculoController.cs` (API) línea 42
- **Uso:** Desencriptación de passwords almacenados
- **Riesgo:** Clave conocida/estática = encriptación reversible sin secreto

---

### P2. Filtro por Empresa Comentado
- **Archivo:** `DenunciasController.cs` línea 86
- **Código:**
  ```csharp
  // denuncias = denuncias.Where(e => e.AddUser.EmpresaId == Usuario.EmpresaId);
  ```
- **Impacto:** Denuncias no filtradas por empresa = cross-tenant data leak
- **Severidad:** CRÍTICO

---

### P3. IncidentesController Sin Filtro de Empresa
- **Archivo:** `IncidentesController.cs`
- **Línea 98-99:** Usuario se obtiene
- **Línea 138-140 (GetTable):** Query sin filtro
- **Línea 193:** Usuario se usa solo para mapeo de DTO, no para filtrado
- **Impacto:** Todos los incidentes visibles para todos los usuarios
- **Severidad:** CRÍTICO

---

### P4. CORS Abierto en SURP.API
- **Archivo:** `Startup.cs` línea 49-52
- **Código:**
  ```csharp
  options.AllowAnyOrigin();
  options.AllowAnyMethod();
  options.AllowAnyHeader();
  ```
- **Riesgo:** API accesible desde cualquier origen (CSRF, cross-site requests)
- **Severidad:** ALTO

---

### P5. 16 Controllers sin [Authorize]
- Enumerados arriba
- Impacto variable (AccountController es legítimo, pero otros críticos)

---

### P6. Middleware de Autorización Comentado
- **Archivo:** `SURP.API/Startup.cs` línea 47
- **Código:** `//app.UseMiddleware<AuthorizationMiddleware>();`
- **Indica:** Se planeó middleware global pero fue deshabilitado
- **Riesgo:** Intención de centralizar autorización pero no completada

---

### P7. Auditoría Incompleta
- **Tablas existentes:** AuditoriaApi, AuditoriaPersonaApi, AuditoriaConsulta, AuditoriaVehiculo, AuditoriaUsuario
- **FALTA:** Auditoría de CRUD en incidentes, denuncias, causas (cambios a datos críticos)
- **Impacto:** Sin trazabilidad de cambios en datos sensibles

---

### P8. Métodos de Eliminación sin [HttpPost]
- Varios controllers pueden permitir DELETE vía GET
- Falta validación de método HTTP

---

### P9. Fire-and-Forget Auditoría en API
- **Archivo:** `PersonaController.cs` línea 73-76, `VehiculoController.cs` línea 87-90
- **Patrón:**
  ```csharp
  _fireForgetRepositoryHandler.Execute(async repositorio =>
  {
      await repositorio.AuditarPersona(auditoriaPersonaApi);
  });
  ```
- **Riesgo:** Auditoría NO garantizada si proceso falla
- **Mitigation:** Fire-and-forget es aceptable para auditoría si hay retry logic

---

### P10. Código Comentado/Muerto
- **IncendiosController:** OutputCache comentado (línea 31)
- **VehiculoController.cs (API):** Comentarios de debug personales (líneas 37-39)
- **IncidentesController:** Múltiples bloques comentados (Kendo.Mvc, ViewBag, etc.)

---

## 6. Recomendaciones para SURP 2.0

### Inmediato (Cerrar Vulnerabilidades)

1. **Agregar [Authorize] a 15 controllers** (excepto AccountController.Login/Logout)
   - ArchivosPersonaController → Remover o securizar
   - ConsultasController
   - CruceController
   - DestinosController
   - DocumentoCausasController
   - EvidenciasController
   - FotosController
   - FotosIncidenteExternosController
   - GuiaDespachosController
   - IncendiosController
   - IncidenteExternoBienAfectadosController
   - IncidenteSeguimientosController
   - MaatController
   - QuerellasController
   - SeguimientosController
   - SeguimientoVehiculosController
   - StorageController → Remover (path traversal)

2. **Descomenter filtro por empresa en DenunciasController** (línea 86)

3. **Agregar filtro por empresa a IncidentesController**
   - En GetTable y métodos principales
   - Línea 138-140: Agregar `.Where(x => x.AddUser.EmpresaId == usuarioEmpresa)`

4. **Cerrar CORS en SURP.API/Startup.cs**
   - Restringir a dominios específicos (no AllowAnyOrigin)

5. **Remover `/araucaria/incidentes`** o agregar filtro por empresa

6. **Remover `StorageController.Download`** (path traversal)

---

### Corto Plazo (Remediar Déficits)

7. **Extraer GUID a configuration**
   - Mover `a392ef91-db60-4a3c-918d-7bb30187e21a` a appsettings.json
   - NO hardcodear claves de encriptación

8. **Implementar auditoría de CRUD**
   - Todos los cambios a incidentes, denuncias, causas
   - Log en tabla centralizada con timestamp, usuario, acción (CREATE/UPDATE/DELETE), delta

9. **Validar y filtrar por empresa en controllers críticos:**
   - EstadisticasController (37 reportes)
   - PersonasController
   - VehiculosController
   - CausasController

10. **Agregar validación de MIME en UploadController**
    - Whitelist de extensiones permitidas
    - Validar Content-Type

11. **Revisar y documentar v1 controllers**
    - Intención de uso (API deprecated? internal only?)
    - Aplicar mismos filtros que controllers principales

12. **Habilitar rate limiting en SURP.API**
    - Limitar por usuario/IP
    - Implementar en middleware global

---

### Medio Plazo (Refactor Arquitectural)

13. **Implementar role-based filtering middleware**
    - Filtro automático por empresa/rol para todas las queries
    - Inyectable en DbContext

14. **Centralizar auditoría**
    - Log de cambios transaccional por entidad
    - Audit trail imputable a usuario + timestamp

15. **Migrar de usr/pwd headers a Bearer tokens (JWT)**
    - Implementar en SURP.API
    - Remover GUID hardcoded

16. **Retirar código comentado**
    - Líneas Kendo.Mvc, ViewBag, OutputCache, etc.
    - Limpiar IncidentesController

17. **Normalizar patrón de paginación**
    - Centralizar DataTable binding
    - Aplicar filtros automáticamente

---

## 7. Resumen de Dominios Funcionales

| Dominio | Controllers | Total Líneas | Métodos | Críticos | Estado |
|---------|-------------|-------------|---------|----------|--------|
| **Incidentes** | IncidentesController, IncidenteExternosController, IncidenteBienAfectadosController, IncidenteExternoBienAfectadosController, IncidentePrediosController, IncidenteSeguimientosController | ~5000 | ~70 | 2 | CRÍTICO |
| **Denuncias** | DenunciasController, DenunciaImputadosController, DenunciaTestigosController, DenunciaVehiculosController, DenunciaVehiculosNIController | ~2900 | ~57 | 1 | CRÍTICO |
| **Causas** | CausasController, CausaQuerellasController, AbogadoCausasController | ~1540 | ~31 | 0 | MEDIO |
| **Personas** | PersonasController, ArchivosPersonaController | ~773 | ~18 | 1 | MEDIO |
| **Vehículos** | VehiculosController, VehiculosNIController, SeguimientoVehiculosController | ~2225 | ~35 | 2 | MEDIO |
| **Reportes/Estadísticas** | EstadisticasController, HomeController, SeguimientosController | ~2789 | ~65 | 2 | CRÍTICO |
| **Datos Externos** | ConsultasController, CruceController, MaatController, IncendiosController | ~3994 | ~42 | 4 | CRÍTICO |
| **Catálogos** | AreasController, ZonasController, ComunasController, ProvinciasController, RegionesController, FiscalesController, FiscaliasController, TribunalesController, UnidadPolicialesController, PermisosController, HitosController, ResolucionesController, MedioIncautadosController, NoIncautadosController, BienAfectadosController, EmpresaExternasController, DestinosController, PrediosController | ~3150 | ~153 | 2 | BAJO |
| **Auditoría** | AuditoriaApisController, AuditoriaPersonaApisController | ~399 | ~6 | 0 | BAJO |
| **Gestión Usuarios** | AccountController, UsuariosController | ~851 | ~18 | 0 | BAJO |
| **API Externa** | AraucariaController, PersonaController, VehiculoController | ~241 | ~3 | 1 | ALTO |
| **Utilidades** | UploadController, StorageController, FotosController, FotosIncidenteExternosController, GuiaDespachosController, DocumentoCausasController, EvidenciasController, QuerellasController, ResolucionPersonasController | ~1700 | ~57 | 3 | MEDIO |

---

## Conclusiones

**Controllers Críticos a Proteger Inmediatamente:**
1. IncidentesController — Sin filtro de empresa
2. DenunciasController — Filtro comentado
3. AraucariaController (API) — Expone todo sin filtro
4. StorageController — Path traversal
5. IncendiosController — 16 métodos públicos sin autorización
6. MaatController — Exportación sin autorización

**Controllers bien Diseñados:**
- UsuariosController — Filtra correctamente por empresa
- PersonaController (API) — Audita bien
- VehiculoController (API) — Audita bien

**Acción Inmediata:**
1. Descomenter filtro de empresa en DenunciasController (línea 86)
2. Agregar [Authorize] a 15 controllers
3. Agregar filtro a IncidentesController
4. Remover StorageController
5. Extraer GUID a configuration

