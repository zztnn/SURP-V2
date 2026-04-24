# Known Pitfalls — Backend SURP 2.0

> Errores que pagamos o que vimos en proyectos similares. Leer antes de
> tocar el backend. Si encontrás un pitfall nuevo, registralo con fecha.

---

## PITFALL-B-001 — Almacenar coordenadas como lat/lon en columnas `NUMERIC` en lugar de PostGIS

**Qué pasa:** Se guardan `latitude NUMERIC(10,7)` y `longitude NUMERIC(10,7)` como columnas separadas. Para buscar incidentes dentro de un predio hay que traer todo a la app y filtrar en memoria, o escribir fórmulas de Haversine a mano.

**Regla:** Usar `GEOMETRY(POINT, 4326)` de PostGIS desde el inicio. `ST_DWithin`, `ST_Within`, `ST_Intersects` son órdenes de magnitud más rápidos con índice GIST que cualquier cálculo manual.

**Ver:** `standards/POSTGIS-PATTERNS.md`.

---

## PITFALL-B-002 — Índice BTREE en columna geométrica en lugar de GIST

**Qué pasa:** `CREATE INDEX idx_incidents_location ON incidents(location)`. PostgreSQL crea un índice BTREE que no sirve para operadores espaciales. Las queries `ST_DWithin(location, ...)` hacen full table scan.

**Regla:** Columnas `GEOMETRY` o `GEOGRAPHY` siempre con `CREATE INDEX ... USING GIST(column)`. Verificar con `EXPLAIN ANALYZE` que el índice se usa.

**Ver:** `standards/POSTGIS-PATTERNS.md` sección Índices.

---

## PITFALL-B-003 — Mezclar SRID en la base de datos

**Qué pasa:** Algunos registros guardados en EPSG:4326 (WGS84), otros en EPSG:32719 (UTM zona 19S). `ST_Distance` devuelve resultados incorrectos al mezclar SRID.

**Regla:** **Todo en EPSG:4326 (WGS84)** en la BD. Si el cliente envía coordenadas en otro sistema, transformar con `ST_Transform` antes de guardar. Declarar el SRID explícitamente en la definición de columna.

---

## PITFALL-B-004 — `console.log` en código productivo

**Qué pasa:** Debug con `console.log` va a stdout sin contexto (no `requestId`, no `userId`). En Application Insights queda como texto libre no filtrable.

**Regla:** `new Logger(MyService.name)` siempre. `this.logger.log(...)` / `warn` / `error`. `console.log` BANEADO.

---

## PITFALL-B-005 — Validar RUT solo en el frontend

**Qué pasa:** El frontend valida módulo 11. Un import batch o una llamada directa a la API pasa RUTs inválidos que quedan guardados.

**Regla:** Validar RUT en tres capas:
1. **Frontend** (Zod refinement + `@/lib/rut.ts`).
2. **Backend** (decorator `@IsRut()` en DTOs).
3. **Imports CSV/batch**: rechazar fila con RUT inválido.

---

## PITFALL-B-006 — Transacciones sin cerrar en caso de excepción

**Qué pasa:** `await db.execute(sql\`BEGIN\`)` manual + queries + `COMMIT`. Una excepción deja la connection en BEGIN abierto. El pool se satura.

**Regla:** Usar `db.transaction(async (tx) => {...})` de Drizzle. Hace rollback automático en excepción.

---

## PITFALL-B-007 — class-validator con mensajes en inglés

**Qué pasa:** `@IsString()` sin override devuelve `"field must be a string"`. El frontend muestra eso al usuario.

**Regla:** Todo decorator de class-validator lleva `{ message: 'Texto en español.' }`. O bien `buildValidationPipe()` traduce la constraint (confirmar que esté en el mapa `translateConstraint()`).

---

## PITFALL-B-008 — Query `SELECT *` en repositorios de listado

**Qué pasa:** `findAll()` retorna todas las columnas incluyendo geometrías grandes (polígonos de predio). El payload es 10x mayor y serializar WKB es caro.

**Regla:** En queries de lista, seleccionar columnas explícitas. Para geometrías, retornar `ST_AsGeoJSON(location)` o `ST_X(location)` / `ST_Y(location)` según necesite el cliente. Nunca serializar la geometría completa en listas.

---

## PITFALL-B-009 — No usar `SELECT ... FOR UPDATE` al actualizar estado de incidente

**Qué pasa:** Dos requests concurrentes leen el mismo incidente con estado `open`, ambas lo transicionan a `resolved`. Una sobrescribe a la otra silenciosamente.

**Regla:** Al cambiar estado de incidente, causa u otro aggregate con máquina de estados: usar `SELECT ... FOR UPDATE` dentro de la transacción para serializar el acceso.

---

## PITFALL-B-010 — Levantar excepciones sin `code`

**Qué pasa:** `throw new BadRequestException('Coordenada inválida')`. El frontend no puede distinguir el tipo de error ni mostrar mensaje contextualizado.

**Regla:** Siempre con objeto: `throw new BadRequestException({ code: 'INVALID_COORDINATES', message: 'Las coordenadas ingresadas no son válidas.', field: 'location' })`. Ver catálogo en `standards/ERROR-HANDLING.md`.

---

## PITFALL-B-011 — Almacenar fotos/evidencias en la BD

**Qué pasa:** Se guardan binarios de fotos en una columna `BYTEA`. La BD crece descontroladamente, backups lentos, queries lentas.

**Regla:** **Nunca** almacenar binarios en la BD. Las fotos y evidencias van en Azure Blob Storage. La BD guarda solo la URL/path del blob + metadatos (tipo, tamaño, fecha, hash SHA256).

---

## PITFALL-B-012 — Transacciones a través de services sin coordinar

**Qué pasa:** `IncidentService.create()` y `AuditService.log()` se llaman desde el controller en dos queries separadas. Si la segunda falla, el incidente queda creado sin auditoría.

**Regla:** El controller o el use case inicia `db.transaction(tx => ...)` y pasa `tx` a los services/repositories. Los services NO inician transacciones propias.

---

## PITFALL-B-013 — Timezone `TIMESTAMP` sin `tz` para fechas de incidente

**Qué pasa:** `occurred_at TIMESTAMP` sin timezone. Si el servidor se mueve de zona horaria, todos los timestamps de incidentes se ven desplazados.

**Regla:** **Siempre `TIMESTAMPTZ`**. La TZ de operación es `America/Santiago`; los valores viajan en UTC. El frontend formatea a Chile con `date-fns` + locale `es-CL`.

---

## PITFALL-B-014 — Índices faltantes en FKs

**Qué pasa:** `incident_properties` tiene FK `incident_id`. Sin índice, `DELETE FROM incidents WHERE id = X` hace full table scan por cada predio vinculado.

**Regla:** Toda FK lleva índice. PostgreSQL **no** crea índices en FKs automáticamente.

---

## PITFALL-B-015 — Olvidar `WHERE deleted_at IS NULL` en listados

**Qué pasa:** `findAll()` retorna registros soft-deleted. El usuario ve personas o vehículos "eliminados" en los dropdowns.

**Regla:** En queries de lista activa, siempre agregar `isNull(table.deletedAt)` en el WHERE. Crear índices parciales que excluyan `deleted_at IS NOT NULL`.

---

## PITFALL-B-016 — Llamar a la API de MAAT directamente desde un service de dominio

**Qué pasa:** `MaatService.sync()` hace `await axios.post('https://maat.arauco.cl/...')` inline. Tests imposibles, sin reintento, CORS issues en dev.

**Regla:** Integrar siempre vía la interfaz `MaatProvider` inyectada por DI. Ver `standards/MAAT-INTEGRATION.md`.

---

---

## Pitfalls heredados del legacy SURP (2026-04-23)

> Hallazgos concretos del análisis de `surp-legacy/`. Cada uno es evidencia de algo que **no se repite** en SURP 2.0.

---

## PITFALL-B-017 — Autorización declarada solo en la vista (menú)

**Qué pasa en el legacy:** `Views/Shared/Components/SideMenu/Default.cshtml` oculta items de menú según el perfil, pero los controllers no validan el perfil. Un usuario que conoce la URL directa (`/causas/edit/123`) accede a datos que no debería.

**Regla SURP 2.0:** Todo endpoint tiene `@RequirePermission(...)` o `@Public()` explícito. El `PermissionGuard` bloquea por defecto. El menú del frontend es puramente UX — la autoridad es el backend. Ver `standards/AUTHORIZATION.md`.

---

## PITFALL-B-018 — Password con encriptación reversible (clave simétrica fija)

**Qué pasa en el legacy:** `CryptographyHelper.Decrypt(userInfo.Password, key)` donde `key = Guid.Parse("a392ef91-db60-4a3c-918d-7bb30187e21a")`. La clave está hardcodeada en múltiples archivos. Cualquiera con acceso al código lee todas las passwords en texto plano.

**Regla SURP 2.0:** `argon2id` (password hashing irreversible). **Nunca** existe una función que "desencripte" un password. Si alguien propone `crypto.decrypt(password)`, es un bug de diseño. Ver `standards/SECURITY.md` sección 2.1.

---

## PITFALL-B-019 — Connection strings hardcodeadas

**Qué pasa en el legacy:** `SACL.EF/SACLContext.cs:81-86` tiene los strings de DEV y PROD con credenciales en texto plano, dentro del código compilado que va a git.

**Regla SURP 2.0:** Todos los secretos en Azure Key Vault (prod) o `.env` local (dev, no comiteado). Hook de pre-commit `detect-secrets` bloquea strings que parezcan credenciales. Ver `standards/SECURITY.md` sección 6.

---

## PITFALL-B-020 — Filtros de visibilidad comentados "temporalmente"

**Qué pasa en el legacy:** `IncidentesController` tiene el filtro por empresa **comentado** — un contratista ve incidentes de otras empresas:
```csharp
//if (Usuario.Perfil == Perfil.UnidadPatrimonial || ...)
//{
//    incidentes = incidentes.Where(e => e.AddUser.EmpresaId == Usuario.EmpresaId);
//}
```

**Regla SURP 2.0:** El filtrado por organización es automático vía `OrganizationScopeInterceptor` (no queda en manos del dev recordarlo por controller). Además, no se permite código comentado en main — si hay un bug se arregla o se revierte. Ver `standards/AUTHORIZATION.md` sección 7.

---

## PITFALL-B-021 — Controller sin `[Authorize]`

**Qué pasa en el legacy:** `MaatController` está sin `[Authorize]`. Cualquiera sin autenticar accede a las URLs del módulo MAAT.

**Regla SURP 2.0:** Guards globales (`JwtAuthGuard` + `PermissionGuard`) aplicados a nivel de `AppModule`. Para permitir un endpoint público, se usa `@Public()` explícito. Por defecto, sin decorador = bloqueado.

---

## PITFALL-B-022 — API con credenciales de usuario real en headers

**Qué pasa en el legacy:** `SURP.API/*` autentica leyendo `usr` y `pwd` de headers HTTP. Si una cuenta se compromete, se compromete toda la API. Además viaja en cada request (incluso sobre HTTPS, está en logs de nginx).

**Regla SURP 2.0:** Autenticación por API key en header `Authorization: Bearer sk_<prefix>_<secret>`. La key pertenece a una `organizations.type='api_consumer'`, tiene scope fijo, rate limit, expiración, y auditoría. Ver `standards/SECURITY.md` sección 3.

---

## PITFALL-B-023 — Endpoint que devuelve lista completa sin filtrar

**Qué pasa en el legacy:** `AraucariaController.Get()` devuelve **todos** los incidentes (vista `AraucariaIncidentes`) a cualquier cliente de la API con credenciales válidas, sin paginación, sin filtrado.

**Regla SURP 2.0:** Prohibido exponer listas completas por API externa. Los endpoints para `api_consumer` solo permiten consultas puntuales (`/blocks/check?rut=X` o `?plate=X`). Si Arauco necesita proveer data agregada a un tercero, se discute caso por caso con contrato de datos.

---

## PITFALL-B-024 — Tabla de permisos existe pero es código muerto

**Qué pasa en el legacy:** Tabla `Permiso(Perfil, Controlador)` con columnas CRUD booleanas. **No se consulta** en ningún controller. Los permisos reales están hardcodeados en la construcción del menú.

**Regla SURP 2.0:** RBAC dinámico real (`roles` + `permissions` + `role_permissions`), consultado en cada autenticación y cacheado en Redis. Cambios en permisos de un rol se reflejan en la próxima resolución. Ver ADR-B-007.

---

## PITFALL-B-025 — Sin auditoría CRUD — solo `AddUser`/`ChgUser`

**Qué pasa en el legacy:** Cada tabla tiene `AddUserId, AddDate, ChgUserId, ChgDate` — solo el último que modificó. No hay historia. No se puede responder "quién cambió el estado del incidente #123 el 2024-05-10 y de qué a qué".

**Regla SURP 2.0:** Trigger PostgreSQL `fn_audit_row_change` en cada tabla aggregate-root + `AuditService.logEvent()` para eventos de negocio + `@AuditSensitiveRead()` para lecturas delicadas. Todo va a `audit_logs` con diff JSON. Ver ADR-B-009.

---

## PITFALL-B-026 — Entidad operativa sin FK directa a la organización que "dueña" del dato

**Qué pasa en el legacy:** `Incidente` no tiene FK a `Empresa`. Para saber de qué empresa es un incidente se hace `Incidente → AddUser → EmpresaId`. Esto es lento (join extra en toda query de lista), frágil (si cambias `AddUser.EmpresaId` cambias la "pertenencia" de los incidentes históricos), y genera bugs cuando el creador se transfiere a otra empresa.

**Regla SURP 2.0:** Las entidades operativas tienen `organization_id` **directo** (materializado al crear o al reasignar zona) + `created_by_organization_id` (nunca se actualiza, para trazabilidad). Indexado. Filtrable sin join. Ver ADR-B-003.

---

## PITFALL-B-027 — Un enum hardcodeado para los perfiles del sistema

**Qué pasa en el legacy:** `SACL.EF/Enums/Perfil.cs` tiene 11 valores. Agregar un perfil nuevo requiere build + deploy. Arauco pidió explícitamente poder crear roles desde la UI sin esperar un release.

**Regla SURP 2.0:** Roles son filas editables en la tabla `roles` (con `is_system=true` para los 11 base legacy, que no se pueden borrar). Permisos sí son catálogo fijo en código (el código hace `@RequirePermission('string')`; el string debe existir), pero esto es un acuerdo claro entre dev y admin. Ver ADR-B-007.

---

## PITFALL-B-028 — Perfiles mezclados entre Arauco y contratistas

**Qué pasa en el legacy:** El perfil `UnidadPatrimonial` lo tienen tanto usuarios de Arauco como de empresas de seguridad contratistas. Como no hay concepto claro de "empresa principal vs contratista", los permisos divergen en código ad-hoc (ej. el filtrado por `EmpresaId` se aplica condicionalmente).

**Regla SURP 2.0:** Cada rol tiene `scope ∈ {principal_only, security_provider_only, api_consumer_only}`. Un rol no puede asignarse a un usuario cuyo `organization.type` no coincida. El `UnidadPatrimonial` legacy se bifurca en dos roles distintos en el rediseño: `patrimonial` (Arauco) y `guard` (contratista). Ver `standards/AUTHORIZATION.md` sección 4.

---

## PITFALL-B-029 — Claves de encriptación y firma en repositorio

**Qué pasa en el legacy:** Además de la clave de passwords, hay secretos en `appsettings.json` versionado. Si el repo se filtra, caen todos.

**Regla SURP 2.0:** Ningún `appsettings.*.json` con valores productivos. Key Vault en prod, `.env` local con `.env.example` como plantilla. Hook `detect-secrets` en pre-commit. Ver `standards/SECURITY.md` sección 6.

---

> **Añadir pitfall nuevo:** fecha, qué pasa, root cause, regla, a qué aplica.
> Preferir incidentes reales a hipotéticos.
