# Architecture Decision Records — Backend SURP 2.0

> Decisiones técnicas tomadas y **por qué**. Leer antes de proponer
> cambios. Para cambiar una decisión, añadir un ADR nuevo — no editar.

---

## ADR-B-001 — NestJS 11 como framework backend

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** Elegir framework Node para el backend de SURP 2.0.

**Decisión:** NestJS 11 sobre Express (default; Fastify evaluable si hay cuellos de botella).

**Razón:**
- Estructura modular + DI encaja con los bounded contexts del SURP (incidents, cases, persons, etc.).
- Guards, interceptors y pipes son el lugar natural para auth/auditoría.
- class-validator + @nestjs/swagger = OpenAPI tipado gratis.
- Stack ya validado en BML-ERP (proyecto de referencia).

---

## ADR-B-002 — Drizzle ORM sobre Kysely / pg crudo / Prisma

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** El schema SQL usa features nativas PostgreSQL + PostGIS: tipos geométricos, índices GIST, dominios, triggers.

**Decisión:** Drizzle ORM.

**Razón:**
- Schema declarado en TS mirroreando el SQL (no genera DDL — usamos `/database/schema/*.sql`).
- Queries SQL-like tipadas. Soporta tipos personalizados (`customType`) para columnas PostGIS.
- Migraciones opcionales — seguimos con archivos `.sql` numerados como fuente de verdad.
- Prisma pelea con tipos geométricos personalizados; Kysely es demasiado bajo nivel para el volumen del SURP.

**Consecuencias:**
- `apps/api/src/database/schema/` mirrorea `/database/schema/*.sql`.
- Columnas PostGIS (`geometry`, `geography`) se declaran con `customType` en Drizzle.
- Transacciones vía `db.transaction(tx => ...)`.

---

## ADR-B-003 — Modelo multi-organización (3 tipos)

**Fecha:** 2026-04-23 (revisado tras análisis exhaustivo del legacy)
**Estado:** Aceptado (no negociable)

**Contexto:** El legacy **sí tiene** una entidad `Empresa` (FK obligatoria en `Usuario.EmpresaId`), pero mal implementada:
- Las entidades operativas (`Incidente`, `Denuncia`, `Causa`) NO tienen FK directa a `Empresa`. La relación es indirecta vía `AddUserId → Usuario.EmpresaId`.
- El filtrado por empresa en los controllers es inconsistente: `DenunciasController` filtra para `UnidadPatrimonial*`, `IncidentesController` tiene el filtro **comentado**, y perfiles como `Visor`/`Incendios`/`Seguimiento`/`Consultas` no filtran en absoluto (ven todo).
- La autorización vive solo en el menú — si un usuario conoce la URL directa, accede a datos que no le corresponden.

El sistema real tiene **3 tipos de actores organizacionales distintos**:
1. **Arauco** (la URP) — opera el sistema end-to-end.
2. **Empresas de seguridad contratistas** — patrullan predios, reportan incidentes, levantan denuncias. No acceden a causas judiciales.
3. **Empresas forestales externas** — consumen una API (y web) para verificar si una patente o RUT está bloqueado. Jamás ingresan datos.

**Decisión:** Tabla `organizations` con columna `type ENUM('principal', 'security_provider', 'api_consumer')`.

- **`principal`** — única fila, representa a Arauco (seed: RUT `96573310-8`). Sus usuarios ven todos los datos operativos según el rol que tengan.
- **`security_provider`** — N filas, empresas contratistas. Sus usuarios solo ven y modifican incidentes/denuncias de zonas **actualmente asignadas** a su organización (via `organization_zone_assignments`). Nunca ven causas.
- **`api_consumer`** — N filas, consultoras forestales. No tienen usuarios humanos obligatoriamente; se autentican con API key. Opcionalmente pueden tener usuarios web con el rol único `queries.blocks.check` (endpoint `/blocks/check?rut=X` o `?plate=X`).

**No hay RLS de PostgreSQL** — la segregación se aplica en la capa de aplicación (guards + filtros de query) porque las reglas son complejas (zona asignada + temporalidad + tipo de organización) y más legibles en TypeScript que en SQL. Los GUCs (`app.current_user_id`, `app.session_id`, `app.request_id`, `app.current_org_id`) se usan solo para auditoría.

**Razón:**
- El legacy ya tenía el concepto; el rediseño lo formaliza y lo hace cumplir.
- 3 tipos bien definidos eliminan casos borderline (no hay "¿Arauco es empresa?"; es `type='principal'`).
- Visibilidad por zona asignada refleja la realidad operativa: si se cambia la empresa de una zona, la nueva empresa debe poder continuar completando la documentación de incidentes abiertos. La saliente pierde acceso al retirarse.
- El modelo admite evolución: agregar un 4º `type` (auditor externo, fiscalía, etc.) es solo un nuevo valor del ENUM + reglas de visibilidad.

**Consecuencias:**
- Toda tabla operativa (`incidents`, `complaints`, `patrols`, etc.) lleva columna `organization_id BIGINT NOT NULL REFERENCES organizations(id)`: es la organización **asignada actualmente** a la zona del incidente. Al reasignar una zona, un job actualiza `organization_id` en los incidentes históricos de esa zona.
- Campo adicional `created_by_organization_id` (never updated) para trazabilidad: qué empresa creó el registro originalmente.
- `organization_zone_assignments (organization_id, zone_id, valid_from, valid_to)` guarda la historia de qué empresa cubrió qué zona y cuándo.
- `RequestContext` carga `userId`, `sessionId`, `requestId` y `organizationId` (+ `organizationType`).
- `OrganizationScopeGuard` (interceptor) agrega automáticamente el `WHERE organization_id = :userOrgId` a las queries del repository si el tipo del usuario es `security_provider`. Los de `principal` no tienen el filtro; los de `api_consumer` solo llegan al endpoint `/blocks/check`.
- Causas judiciales no tienen `organization_id` variable — siempre pertenecen al `principal` (Arauco). El rol define si el usuario las ve.
- La migración desde el legacy convierte `Usuario.EmpresaId` en `user.organization_id`. Arauco queda como `type='principal'`; el resto, como `security_provider`. Los `UsuarioApi` se mueven a `api_consumer` nuevos.

**Ver:** `standards/AUTHORIZATION.md` para el modelo completo (schemas, guards, reglas de visibilidad).

---

## ADR-B-004 — PKs: BIGSERIAL interno + `external_id UUID`

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** Cada tabla aggregate-root usa `id BIGSERIAL PRIMARY KEY` (interno, JOINs rápidos) + `external_id UUID UNIQUE DEFAULT gen_random_uuid()` (expuesto en APIs y URLs).

**Razón:**
- BIGSERIAL eficiente como FK e índice.
- UUID externo evita leak de cardinalidad y facilita sincronización con sistemas externos.

**Consecuencias:**
- DTOs exponen `externalId`. Nunca exponen `id` numérico.
- Endpoints REST usan `:externalId` en el path.

---

## ADR-B-005 — Soft delete selectivo

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** `deleted_at TIMESTAMPTZ` solo en entidades donde la reversión tiene valor de negocio (personas, vehículos, predios, mantenedores). Hitos, evidencias, registros de auditoría son append-only (sin borrado).

**Razón:**
- Soft delete universal infla índices y exige `WHERE deleted_at IS NULL` en toda query.
- Los eventos judiciales (hitos, denuncias, causas) son registros inmutables por ley.

---

## ADR-B-006 — PostGIS para datos geoespaciales

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Contexto:** Los incidentes ocurren en ubicaciones geográficas específicas. Los predios son polígonos. Las zonas y áreas son regiones geográficas. La búsqueda y visualización por territorio es funcionalidad de primera clase.

**Decisión:** PostgreSQL 16 + extensión PostGIS 3. Tipos: `GEOMETRY(POINT, 4326)` para incidentes, `GEOMETRY(MULTIPOLYGON, 4326)` para predios/zonas.

**Razón:**
- PostGIS es el estándar de la industria para datos vectoriales en PostgreSQL.
- Permite queries espaciales nativas: `ST_Within`, `ST_Intersects`, `ST_DWithin`, `ST_Distance`.
- Índices GIST son dramáticamente más rápidos que buscar por lat/lon con `BETWEEN`.
- Azure PostgreSQL Flexible Server soporta PostGIS como extensión habilitada.

**Consecuencias:**
- Schema requiere `CREATE EXTENSION IF NOT EXISTS postgis`.
- Columnas geométricas se declaran con Drizzle `customType`.
- Los queries espaciales usan helpers de `src/database/geo.ts`.
- Ver `standards/POSTGIS-PATTERNS.md` y `standards/GEO-PATTERNS.md`.

---

## ADR-B-007 — RBAC dinámico: roles editables en BD + permisos como catálogo de código

**Fecha:** 2026-04-23 (revisado)
**Estado:** Aceptado (no negociable)

**Contexto:** El legacy tenía dos mecanismos de autorización superpuestos:
1. Enum `Perfil` con 11 valores hardcodeados en código (`Administrador`, `Abogado`, `UnidadPatrimonial`, etc.).
2. Tabla `Permiso(Perfil, Controlador)` con booleanos `Acceso/Create/Edit/Delete/Details`.

La tabla `Permiso` es **código muerto** — no se consulta en los controllers. Los permisos reales están hardcodeados en la construcción del menú (`Views/Shared/Components/SideMenu/Default.cshtml`). Un usuario con URL directa evade todo. El usuario pidió explícitamente que el admin del sistema pueda **crear y modificar roles** y asignar permisos granulares **sin desplegar código**.

**Decisión:** RBAC con tres piezas, cada una con su propio ciclo de vida:

| Pieza | Definido por | Editable en runtime | Razón |
|-------|--------------|---------------------|-------|
| `permissions` (catálogo) | Código (seed) | **No** | El código hace `@RequirePermission('incidents.incidents.create')` — si el string no existe en el catálogo, no se puede chequear. Agregar permisos requiere despliegue. |
| `roles` | Admin del sistema | **Sí** | El admin crea roles nuevos (ej. "Fiscalizador Zona Sur") desde la UI. |
| `role_permissions` | Admin del sistema | **Sí** | El admin decide qué permisos tiene cada rol. |
| `user_roles` | Admin del sistema | **Sí** | El admin asigna roles a usuarios. |

**Modelo de datos:**
```sql
permissions (
  id BIGSERIAL PK,
  code VARCHAR(100) UNIQUE NOT NULL,  -- 'incidents.incidents.create'
  module VARCHAR(50), resource VARCHAR(50), action VARCHAR(50),
  description TEXT, is_sensitive BOOLEAN  -- true => auditar cuando se ejerce
);

roles (
  id BIGSERIAL PK, external_id UUID UNIQUE,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  scope VARCHAR(30) NOT NULL,  -- 'principal_only' | 'security_provider_only' | 'api_consumer_only'
  is_system BOOLEAN DEFAULT false,  -- roles base del seed, no editables/borrables
  created_at, created_by_id, updated_at, updated_by_id, deleted_at
);

role_permissions (
  role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT REFERENCES permissions(id),
  granted_at, granted_by_id,
  PRIMARY KEY (role_id, permission_id)
);

user_roles (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT REFERENCES roles(id),
  assigned_at, assigned_by_id,
  PRIMARY KEY (user_id, role_id)
);
```

**Relación usuario↔rol: muchos-a-muchos (N:M).**
Un usuario puede tener uno o más roles. Los permisos efectivos son la UNIÓN de los `role_permissions` de todos los roles asignados. Esto evita la proliferación de roles combinatorios (ej. `patrimonial_admin_with_maat_and_audit_access`) y resuelve casos como el acceso a MAAT (se crea rol `queries_maat` y se suma al rol base de los usuarios autorizados por Jefe URP). La tabla `user_roles` tiene PK compuesta `(user_id, role_id)` — se asignan/revocan roles independientemente.

**Scope de rol vs tipo de organización (ADR-B-003):** Todos los roles asignados a un usuario deben tener `scope` compatible con `organization.type`. Un usuario de una `security_provider` no puede recibir ningún rol `principal_only`, ni viceversa. El `UsersService.assignRole()` valida la combinación en cada asignación individual.

**Razón:**
- El admin crea roles sin intervención del dev (requisito explícito).
- Los permisos son un catálogo controlado — evita inflación de strings arbitrarios en BD y mantiene correspondencia 1:1 con los `@RequirePermission(...)` del código.
- `is_sensitive=true` marca permisos cuyo ejercicio se audita como lectura sensible (ADR-B-009).
- Seed inicial carga como `is_system=true` los roles equivalentes a los 11 perfiles del legacy para facilitar la migración de `Usuario.Perfil`. Admin puede clonar uno de sistema y personalizarlo.

**Consecuencias:**
- Guards NestJS: `PermissionGuard` + decorador `@RequirePermission('incidents.incidents.create')`.
- Al autenticar, el backend resuelve los permisos del usuario a través de su rol y los cachea en Redis (TTL 5 min, invalidado en cambios a `role_permissions` o `user_roles`).
- El JWT lleva `roleId` y `permissions: string[]` (resuelto) para evitar round-trip a BD en cada request.
- UI del admin: páginas `/admin/roles` (listar, crear, editar, clonar, soft-delete) y `/admin/roles/:id/permissions` (toggle matrix).
- Un rol con `is_system=true` no se puede borrar ni renombrar, pero sus permisos sí son editables por admin (warning en UI).
- Migración legacy: cada `Usuario.Perfil` se mapea al rol `is_system` equivalente. Ver `standards/DATA-MIGRATION.md`.

**Ver:** `standards/AUTHORIZATION.md`.

---

## ADR-B-008 — Passport + JWT para autenticación

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** Passport strategies `local` (login) + `jwt` (bearer). Access token 15 min, refresh token 30 días en cookie httpOnly.

**Razón:**
- Estándar NestJS. JWT permite escala horizontal sin sesiones sticky.
- El legacy usaba Cookie Authentication (stateful) — migramos a JWT stateless.

---

## ADR-B-009 — Auditoría integral: CRUD + eventos de negocio + lecturas sensibles

**Fecha:** 2026-04-23 (revisado)
**Estado:** Aceptado (no negociable)

**Contexto:** El legacy **no tiene auditoría CRUD** de incidentes/denuncias/causas/personas. Solo guarda `AddUserId/AddDate/ChgUserId/ChgDate` en cada tabla (last-write wins, sin historia). Las únicas tablas de auditoría son `AuditoriaUsuario` (login), `AuditoriaApi`/`AuditoriaPersonaApi`/`AuditoriaConsulta` (consultas de la API externa). No hay manera de responder "quién modificó este incidente y qué cambió".

El usuario pidió explícitamente auditoría estricta de CRUD **y** de lecturas sensibles (descarga de evidencia, acceso a RUT de imputado, visualización de causas).

**Decisión:** Tres fuentes complementarias, todas alimentan la misma tabla `audit_logs`:

1. **Trigger PostgreSQL `fn_audit_row_change`** (CRUD automático)
   - Se aplica a toda tabla aggregate-root (incidents, complaints, cases, persons, vehicles, users, roles, etc.).
   - Captura `INSERT`, `UPDATE`, `DELETE` con diff JSON `{ before, after, changed_fields[] }`.
   - Lee usuario e IP de GUCs (`app.current_user_id`, `app.current_org_id`, `app.current_ip`, `app.current_request_id`).
   - Ejecuta siempre, aunque el desarrollador olvide auditar manualmente.

2. **`AuditService.logEvent()` desde NestJS** (eventos de negocio)
   - Login exitoso/fallido, refresh de sesión, logout, password reset.
   - Acciones de dominio: `incident_closed`, `complaint_filed`, `case_assigned`, `zone_reassigned`, `user_locked`, `api_key_issued`.
   - Permite campos semánticos (`metadata` JSONB) que no se deducen del diff CRUD.

3. **`@AuditSensitiveRead()` decorador** (lecturas sensibles)
   - Se aplica a endpoints/métodos que acceden a datos delicados: descarga de evidencia de un incidente, vista de detalle de causa judicial, consulta de persona con `isImputado=true`, export de estadísticas, consulta a la API de bloqueos.
   - Cada invocación registra: usuario, IP, recurso (`entity_type + entity_external_id`), motivo opcional declarado por el usuario (si aplica).
   - Permisos marcados con `is_sensitive=true` (ADR-B-007) se auditan automáticamente sin necesidad del decorador.

**Modelo de datos:**
```sql
audit_logs (
  id BIGSERIAL PK,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT REFERENCES users(id),        -- puede ser null si es system
  organization_id BIGINT REFERENCES organizations(id),
  session_id BIGINT REFERENCES user_sessions(id),
  request_id UUID,                              -- correlación con logs de Application Insights
  ip INET,
  user_agent TEXT,
  source VARCHAR(20) NOT NULL,                 -- 'trigger' | 'event' | 'sensitive_read'
  action VARCHAR(50) NOT NULL,                 -- 'insert' | 'update' | 'delete' | 'login_success' | 'evidence_download' | ...
  entity_type VARCHAR(100),                    -- 'incidents', 'cases', 'persons', ...
  entity_id BIGINT,                            -- interno
  entity_external_id UUID,                     -- para búsqueda por UUID
  diff JSONB,                                  -- { before, after, changed_fields } (solo CRUD)
  metadata JSONB,                              -- payload semántico (evento)
  reason TEXT                                  -- razón declarada por el usuario si aplica
);

CREATE INDEX ON audit_logs (occurred_at DESC);
CREATE INDEX ON audit_logs (user_id, occurred_at DESC);
CREATE INDEX ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ON audit_logs (entity_external_id);
CREATE INDEX ON audit_logs USING GIN (metadata jsonb_path_ops);
```

**Retención:** `audit_logs` es append-only, nunca se borra ni se actualiza. Particionamiento por `occurred_at` (mensual) si el volumen lo requiere. Retención legal: **mínimo 7 años** por la naturaleza de causas judiciales y evidencia penal.

**GUCs seteados por `AuditInterceptor` al inicio de cada request autenticada:**
- `app.current_user_id`
- `app.current_org_id`
- `app.session_id`
- `app.request_id`
- `app.current_ip`

**Razón:**
- Trigger captura CRUD sin disciplina del desarrollador (fuente de verdad técnica).
- Eventos de negocio requieren código explícito (son hechos del dominio que un diff no expresa — ej. "zona reasignada de Empresa A a Empresa B").
- Lecturas sensibles son exigencia legal (trazabilidad de acceso a datos personales, evidencia y causas).
- Tabla única simplifica consultas ("qué hizo el usuario X el día Y") en lugar de dispersar en 5 tablas como el legacy.
- GUCs bajan el costo: el trigger no hace round-trip para saber el usuario actual.

**Consecuencias:**
- Toda tabla aggregate-root recibe el trigger en su archivo `.sql` al crearse.
- Los `UpdateManyFields` en batch también generan filas de audit (una por row afectada).
- UI de consulta de auditoría (`/admin/audit`) filtra por usuario, entidad, rango de fechas, tipo de acción, y texto libre en `metadata`. Reemplaza funcionalmente la pantalla "Auditoría" del legacy (que solo mostraba consultas de API).
- La migración desde el legacy carga las 4 tablas de auditoría del legacy (`AuditoriaUsuario`, `AuditoriaApi`, `AuditoriaPersonaApi`, `AuditoriaConsulta`) en `audit_logs` como filas con `source='legacy_import'`.

**Ver:** `standards/SECURITY.md` (lista completa de permisos marcados `is_sensitive`), `standards/DATA-MIGRATION.md` (mapeo de auditoría legacy).

---

## ADR-B-010 — BullMQ + Redis para jobs asíncronos

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** BullMQ + ioredis. Colas: `report-generation`, `export-excel`, `export-pdf`, `notification-dispatch`, `media-processing`.

**Razón:**
- Generación de reportes estadísticos puede tardar varios segundos — no bloquear la request HTTP.
- Procesamiento de fotos/evidencias (resize, metadata) debe ser async.
- Redis ya está en el stack (cache de permisos, rate limiting).

---

## ADR-B-011 — Azure para infraestructura de producción

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:**
- Container Apps para API.
- PostgreSQL Flexible Server con PostGIS (región Brazil South, réplica East US).
- Blob Storage para evidencias (fotos, videos, documentos).
- Key Vault para secretos.
- Application Insights para observabilidad.

**Razón:**
- Arauco ya tiene presencia en Azure.
- PostgreSQL Flexible Server soporta PostGIS.
- Brazil South es la región más cercana a Chile.

---

## ADR-B-012 — Sin integración DTE / SII

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Decisión:** SURP no emite ni recibe documentos tributarios. No hay integración con el SII.

**Razón:**
- El SURP es un sistema operativo de seguridad forestal, no un ERP financiero.
- Los documentos son internos (partes policiales, informes, evidencias).

---

## ADR-B-013 — Errores al usuario en español desde el backend

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Decisión:** Respuestas de error siguen el contrato `{ statusCode, error, code, message, field?, errors? }` donde `message` viene en español latinoamericano listo para mostrar. `buildValidationPipe()` traduce constraints de class-validator al español.

**Razón:**
- Un solo lugar para cuidar el tono y la ortografía.
- Menos lógica de traducción en el frontend.

**Ver:** `standards/ERROR-HANDLING.md`.

---

## ADR-B-014 — Integración MAAT via interfaz inyectada

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** El legacy tenía integración con MAAT (Sistema de Control de Medios Incautados) vía API REST.

**Decisión:** Interfaz `MaatProvider` con driver `MaatHttpDriver`. El servicio MAAT nunca llama HTTP directamente — siempre vía la interfaz inyectada por DI.

**Razón:**
- Testeable (MockMaatProvider en tests).
- Desacoplado del endpoint concreto (puede cambiar sin tocar el servicio).

**Ver:** `standards/MAAT-INTEGRATION.md`.

---

## ADR-B-015 — Migración one-shot desde el legacy SURP

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable — requisito transversal)

**Contexto:** El usuario declaró un único requisito funcional transversal: **todos los datos del legacy SURP deben poder importarse al nuevo sistema**. Hay varios años de historia en la BD de producción legacy (`arauco_surp`) que no se puede perder (incidentes, denuncias, causas en curso, evidencia referenciada, usuarios activos).

Opciones evaluadas:
- **(A) Sincronización bidireccional continua** — requeriría mantener ambos sistemas vivos en paralelo con reconciliación. Alta complejidad, poco valor (el legacy se apaga).
- **(B) ETL one-shot en cut-over** — congelar escrituras en legacy, correr ETL, abrir SURP 2.0. Riesgo controlado en una ventana definida.
- **(C) Migración gradual por módulo** — mover incidentes primero, dejar causas en legacy temporalmente. No funciona: los módulos están acoplados por FK (causa ↔ denuncia ↔ incidente).

**Decisión:** **ETL one-shot** (opción B), con ventana de cut-over planificada. Cada módulo tiene su script de migración con validación de integridad pre y post.

**Principios de migración:**

1. **Preservar `external_id`.** Cada entidad legacy recibe un nuevo `id` (BIGSERIAL) en SURP 2.0, pero su `external_id` (UUID) se mantiene estable — facilita cruces externos (emails, reportes impresos, referencias cruzadas). Para entidades legacy sin UUID (la mayoría), se genera uno determinístico a partir del PK legacy con `uuid-v5` + namespace fijo para permitir reimportes idempotentes.
2. **Mapeo tabla→tabla documentado.** Un solo archivo (`DATA-MIGRATION.md`) con cada tabla legacy y su destino en SURP 2.0, incluyendo transformaciones por campo.
3. **Passwords se rehashean con argon2 + reset forzado.** Las contraseñas del legacy están "encriptadas" con una clave simétrica fija (inseguro). Al migrar, se genera un hash argon2 aleatorio (password unusable) y el flag `must_reset_password=true`. En el primer login, el usuario recibe email de reset. No se migra ninguna contraseña.
4. **Organizations se construyen desde `Usuario.EmpresaId`.** Arauco (`96573310-8`) → `type='principal'`. El resto → `type='security_provider'`. Los `UsuarioApi` se extraen a organizaciones `type='api_consumer'` nuevas (una por cada empresa consumidora de la API, deducida por inspección de `AuditoriaApi.UsuarioId` más información operativa).
5. **Roles se mapean vía seed de `is_system=true`.** `Usuario.Perfil = Administrador` → rol "Administrador" (seed); `Abogado` → "Abogado"; etc. (mapeo exacto de los 11 perfiles en `DATA-MIGRATION.md`).
6. **Coordenadas legacy → PostGIS.** Incidentes legacy con lat/lon en columnas `NUMERIC` se convierten a `GEOMETRY(POINT, 4326)` vía `ST_MakePoint(lng, lat)`. Filas con coordenadas inválidas o nulas quedan con `location = NULL` y se reportan en un CSV de reconciliación.
7. **Auditoría legacy se preserva.** Las 4 tablas de auditoría del legacy (`AuditoriaUsuario`, `AuditoriaApi`, `AuditoriaPersonaApi`, `AuditoriaConsulta`) se cargan en `audit_logs` con `source='legacy_import'` para no perder trazabilidad histórica.
8. **Evidencia en archivos del legacy se re-sube a Azure Blob Storage.** El script ETL descarga, valida hash, sube a Blob, y actualiza la referencia en la nueva entidad. Entradas con archivo inexistente quedan marcadas `file_missing=true` y se reportan.
9. **Dry-run obligatorio antes del cut-over real.** El script soporta `--dry-run` que hace toda la lectura y validación sin escribir, produciendo un reporte de inconsistencias esperadas.
10. **Idempotencia.** Volver a correr el ETL sobre una BD SURP 2.0 ya migrada debe ser seguro: actualizar cambios, no duplicar. Logrado vía `external_id` + `ON CONFLICT DO UPDATE`.

**Razón:**
- One-shot simplifica drásticamente: no hay reconciliación continua ni ambigüedad sobre "quién es la fuente de verdad hoy".
- La ventana de cut-over se planifica con Arauco (fin de semana, horario de menor actividad URP).
- Pre-requisito para implementar: **el schema nuevo no puede apartarse del legacy de manera que impida migrar**. Cualquier cambio de modelo debe revisarse contra `DATA-MIGRATION.md`.

**Consecuencias:**
- Todo archivo `.sql` en `/database/schema/` debe estar acompañado de una sección en `DATA-MIGRATION.md` con el origen legacy.
- La columna `migrated_from_legacy_id BIGINT` se agrega a cada tabla que recibe datos legacy (nullable, indexed). Queda como referencia histórica.
- Los scripts ETL viven en `/database/migrations/legacy/` (archivos SQL y TS). Se ejecutan con `pnpm db:migrate:legacy -- --from=<host> --to=<host> [--dry-run]`.
- El SURP 2.0 arranca en producción **solo después** de un dry-run exitoso + aprobación del Jefe URP de los reportes de reconciliación.

**Ver:** `standards/DATA-MIGRATION.md` (mapeo campo-a-campo).
