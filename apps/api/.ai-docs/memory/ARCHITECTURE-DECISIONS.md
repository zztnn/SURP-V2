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

## ADR-B-002 — Kysely + kysely-codegen (revisado 2026-04-23)

**Fecha:** 2026-04-23 (revisado tras auditoría de stack; ver ADR-B-019)
**Estado:** Aceptado (no negociable)

**Contexto:** El schema SQL usa features nativas PostgreSQL + PostGIS: tipos geométricos, índices GIST, dominios, triggers, GUCs de auditoría, RLS. El proyecto `/Users/jean/Projects/ERP` resolvió el mismo problema con Kysely + `kysely-codegen` y lo validó en producción para un dominio de finanzas (tan o más complejo que SURP). La primera iteración de este ADR eligió Drizzle; la revisión decide migrar a Kysely antes de escribir código.

**Decisión:** **Kysely 0.27+** como query builder tipado. **No hay ORM** (ni Drizzle, ni Prisma, ni TypeORM). Tipos generados por **`kysely-codegen`** leyendo el schema real de Postgres — los archivos `/database/schema/*.sql` numerados son la única fuente de verdad.

**Razón:**

- **Schema-first real.** `kysely-codegen` introspecciona la BD y emite tipos TS. No hay que mantener un schema TS en paralelo al SQL (como haría Drizzle), ni sincronizar. El desarrollador edita `.sql`, corre `pnpm db:codegen`, y el resto del código se ajusta por el typechecker.
- **PostGIS sin ceremonia.** Queries geoespaciales usan la plantilla `sql` nativa — `ST_Contains`, `ST_DWithin`, `ST_SetSRID(ST_MakePoint(...))` quedan legibles, sin `customType` que parsee WKB ni hacks.
- **Control total del SQL.** Dominio con RLS histórico, triggers de auditoría, GUCs, políticas por zona temporal — queremos ver el SQL que ejecutamos. Kysely no oculta nada: es un query builder, no un ORM que inventa.
- **Validación en proyecto hermano.** ERP corre Kysely en finanzas hace meses sin problemas. Copiamos patrones probados en vez de debuggear Drizzle con PostGIS desde cero.
- **Auditabilidad.** Los auditores leerán el SQL — Kysely produce SQL que se entiende; Drizzle meta una capa de traducción.
- **Ceremonia baja.** Prisma + migraciones + schema DSL son overhead que no necesitamos; queremos trabajar con SQL + tipos.

**Consecuencias:**

- `apps/api/src/database/kysely.config.ts` construye el cliente con `PostgresDialect` + `pg.Pool` (max 50, idle 30s, conn timeout 5s).
- `apps/api/src/database/generated/kysely-types.ts` lo genera `kysely-codegen` vía `pnpm db:codegen`. **Archivo generado — no editar a mano.** Entra al repo para que CI tenga types sin correr codegen.
- **Sin plugin de `camelCase`.** snake_case end-to-end entre SQL, tipos generados y código TS. Alinear ambos idiomas cuesta más cognitivamente que aceptar el snake_case en TS.
- Repositorios viven en `modules/{bc}/{entity}/infrastructure/{entity}.repository.ts` e inyectan `KyselyDb` (alias de `Kysely<DB>`).
- Transacciones: `await db.transaction().execute(async (tx) => { ... })`.
- Geometrías: se escriben con `sql\`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)\``; se leen vía `ST_AsGeoJSON(...)`casteado a`string` en el tipo generado, parseado a GeoJSON en el mapper del repositorio.
- Migraciones: **no existen como artifact Kysely**. `/database/schema/*.sql` numerado es ambas cosas (schema + migración). Orden = alfabético por número de archivo.
- Tests: integration tests apuntan a una BD real en Testcontainers (no mock de Kysely). Unit tests de domain services no tocan DB.

**Ver:** `STACK.md` §6, `apps/api/.ai-docs/standards/POSTGIS-PATTERNS.md`, `apps/api/.ai-docs/standards/MODULE-ANATOMY.md`.

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

- **`principal`** — única fila, representa a Arauco (seed: RUT `85805200-9`, razón social "Forestal Arauco S.A."). Sus usuarios ven todos los datos operativos según el rol que tengan.
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
- Columnas geométricas se declaran directamente en los `.sql` con `GEOMETRY(POINT, 4326)` / `GEOMETRY(MULTIPOLYGON, 4326)` — Kysely las expone como tipos generados por `kysely-codegen`. Lectura y escritura vía plantilla `sql` (no hay `customType`).
- Los queries espaciales usan helpers de `src/database/geo.ts` que retornan fragmentos `sql` compuestos.
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

| Pieza                    | Definido por      | Editable en runtime | Razón                                                                                                                                                                  |
| ------------------------ | ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions` (catálogo) | Código (seed)     | **No**              | El código hace `@RequirePermission('incidents.incidents.create')` — si el string no existe en el catálogo, no se puede chequear. Agregar permisos requiere despliegue. |
| `roles`                  | Admin del sistema | **Sí**              | El admin crea roles nuevos (ej. "Fiscalizador Zona Sur") desde la UI.                                                                                                  |
| `role_permissions`       | Admin del sistema | **Sí**              | El admin decide qué permisos tiene cada rol.                                                                                                                           |
| `user_roles`             | Admin del sistema | **Sí**              | El admin asigna roles a usuarios.                                                                                                                                      |

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

---

## ADR-B-016 — Storage dual: disco local en dev, Azure Blob en staging/prod

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable)

**Contexto:** El legacy guarda evidencia y documentos en Azure Blob con 7 anti-patrones (account key plano, containers públicos, sin SAS, sin validación MIME, sin virus scan, nombres GUID predecibles, sin auditoría de descargas). El usuario pidió replicar el patrón del proyecto IGM: una abstracción que conmute entre disco local (dev/tests) y Azure Blob (staging/prod), sin que el código de dominio conozca la diferencia.

**Decisión:** Interfaz `StorageService` con dos providers:

- `LocalStorageProvider` — archivos bajo `./storage-data/`, URLs firmadas con HMAC (TTL 15 min) servidas por una ruta autenticada del backend.
- `AzureBlobStorageProvider` — `@azure/storage-blob` con **Managed Identity** (sin account keys en env), containers privados, SAS de lectura con TTL 15 min.

Selección por env `STORAGE_DRIVER=local|azure`. Catálogo de containers SURP con nomenclatura `surp-{scope}` y path estructurado `{entityType}/{entityExternalId}/{yyyy}/{mm}/{uuid}.{ext}` (nunca GUID plano).

**Razón:**

- Paridad de API entre local y cloud: el dev no necesita Azurite para trabajar, pero el código es el mismo.
- Managed Identity elimina las account keys — imposibles de rotar cuando se filtran, inauditables.
- Containers privados + SAS corto limitan el blast radius de una URL filtrada a 15 min.
- Path estructurado corta la enumeración por fuerza bruta que permitía el legacy (`surpfotos/{guid}.jpg` adivinable).

**Consecuencias:**

- `STORAGE_DRIVER=local` por default; cambiar a `azure` en staging/prod.
- Todo upload pasa por pipeline de validación: tamaño → MIME real (`file-type`) → whitelist → sanitize filename → SHA-256 → `StorageService.upload` → cola `media-processing` (virus scan + EXIF strip condicional).
- Descargas de evidencia se auditan con `@AuditSensitiveRead()` (ADR-B-009) e integran con `OrganizationScopeGuard` (ADR-B-003).
- Migración legacy usa `StorageService.copy(legacyKey, newKey)` verificando hash — blobs huérfanos se reportan sin romper el ETL.
- Azurite disponible en `docker-compose.yml` para pruebas específicas de SAS/Managed Identity en local.

**Ver:** `standards/STORAGE.md`.

---

## ADR-B-017 — Notificaciones por email vía Google Workspaces (surp.cl)

**Fecha:** 2026-04-23
**Estado:** **Superseded por ADR-B-021 (2026-04-25)** — Se descartó Google Workspaces SMTP a favor de Azure Communication Services Email. Razones detalladas en ADR-B-021. Conservado por trazabilidad histórica.

**Contexto:** SURP requiere emails transaccionales (cuenta creada, reset, reportes listos, alertas críticas, digests). El cliente ya tiene dominio `surp.cl` con Google Workspaces — no hace falta un servicio externo tipo SendGrid/Mailgun.

**Decisión:** Nodemailer sobre SMTP de Gmail (`smtp.gmail.com:587`, STARTTLS) con **OAuth2 + Service Account con domain-wide delegation** en producción. App Password solo para staging cuando sea necesario destrabar. Cola `notification-dispatch` de BullMQ para todo envío — nada síncrono en código de dominio.

Tres cuentas emisoras: `noreply@surp.cl` (sistema), `alertas@surp.cl` (operacional crítico), `reportes@surp.cl` (exports y reportes). Templates MJML + Handlebars, editables desde `/admin/notifications/templates` con preview. `user_notification_prefs` controla opt-in/out salvo mandatorias (auth, alertas críticas, plazos procesales).

**Razón:**

- No introduce un nuevo proveedor (cliente ya paga Workspace).
- OAuth2 con SA permite rotación sin tocar usuarios humanos y deja auditoría por API call.
- MJML garantiza compatibilidad con Outlook (que ignora CSS moderno).
- Plantillas editables sin despliegue reducen dependencia del equipo técnico para textos operativos.
- Cola separa el envío del request — un Gmail caído no tumba el backend.

**Consecuencias:**

- SA de Google Cloud del tenant `surp.cl` con scope `gmail.send` + domain-wide delegation. Key JSON en Key Vault.
- SPF/DKIM/DMARC en `surp.cl` antes del go-live (responsabilidad TI de Arauco).
- Límite 2.000 envíos/día/cuenta (Workspace estándar): rate limit de la cola `notification-dispatch` a 100/min, alarma en App Insights al 80% de cuota diaria.
- Nunca adjuntar archivos: los emails con "resultado" enlazan a ruta autenticada del backend con SAS (ADR-B-016).
- Local/dev usa **MailHog** vía docker-compose (puerto SMTP 1025, UI 8025) — nunca golpear Gmail real sin autorización.

**Ver:** `standards/NOTIFICATIONS.md`.

---

## ADR-B-018 — Worker BullMQ con bootstrap condicional (misma imagen, flag de arranque)

**Fecha:** 2026-04-23
**Estado:** Aceptado

**Contexto:** SURP corre jobs pesados (reportes con miles de filas, generación de PDFs, ETL del legacy, procesamiento de imágenes de evidencia, geo-import de KMZ). Estos bloquean la API si corren en el mismo proceso. Patrón probado en iwarehouse-2.0: una imagen de contenedor, dos comandos de arranque.

**Decisión:** Un único `Dockerfile` / imagen para `apps/api`. La variable `WORKER_MODE=true` hace que `main.ts` use `NestFactory.createApplicationContext(WorkerModule)` en vez de `createApp(AppModule).listen()`. `WorkerModule` importa solo los módulos que registran processors (`ReportsWorkerModule`, `NotificationsWorkerModule`, `MediaProcessingWorkerModule`, `LegacyEtlWorkerModule`, `GeoImportWorkerModule`) — sin controllers, swagger, ni guards HTTP.

Dos Azure Container Apps comparten la misma imagen: `surp-api` (HTTP, sin flag) y `surp-worker` (`WORKER_MODE=true`, sin HTTP listener, sin ingress). Escalado independiente.

**Razón:**

- Una sola imagen simplifica CI/CD y garantiza que api y worker usan exactamente el mismo código.
- `WorkerModule` aligera el arranque del worker (no levanta el 70% de los módulos HTTP).
- Evita la complejidad de un repo/paquete aparte para el worker.
- Escalado horizontal de workers sin replicar la API.

**Consecuencias:**

- Toda cola BullMQ se registra con `BullModule.registerQueue({ name, ... })` en un módulo _compartido_ que se importa tanto en `AppModule` (para el productor) como en `WorkerModule` (para el consumidor).
- Los `@Processor` viven en módulos separados importados SOLO por `WorkerModule`. Asert en tests: si un processor se carga con `AppModule` en aislamiento, fallar.
- Todo job persiste su estado en Postgres (tabla por tipo: `report_jobs`, `export_jobs`, `notification_dispatches`, etc.); Redis es solo infra.
- Cancelación cooperativa: API setea `redis.set('jobs:cancel:{id}', '1', 'EX', 3600)`; processor chequea entre steps.
- Dashboard `bull-board` montado en `/admin/queues` con `PermissionGuard('system.queues.view')`.
- Shut-down: worker captura `SIGTERM` y espera jobs en vuelo (`worker.close()`).

**Ver:** `standards/BACKGROUND-JOBS.md`.

---

## ADR-B-019 — Stack tecnológico oficial (consolidación post-auditoría)

**Fecha:** 2026-04-23
**Estado:** Aceptado (no negociable — fundacional)

**Contexto:** Los ADRs B-001 a B-018 tomaron decisiones puntuales por capa durante el bootstrap conceptual de SURP 2.0. Antes de escribir código, el usuario pidió formalizar el stack completo tomando "lo mejor de ambos mundos" entre dos proyectos de referencia:

- `/Users/jean/Projects/ERP` — sistema de finanzas y contratos en NestJS + Kysely + PostgreSQL + Next.js 16, con RLS, multi-tenancy, estrictas reglas TS, coverage 80%.
- `/Users/jean/Projects/iwarehouse-2.0` — WMS con integración AS/400 sobre NestJS + Next.js 16, con patrón BullMQ worker separado, hooks discipline React 19, error handling de bootstrap avanzado, change detection en CI.

La auditoría reveló ~80% de coincidencia entre ambos; las 5 diferencias reales se resolvieron en conversación con el usuario.

**Decisión:** Adoptar el stack descrito en `STACK.md` (raíz del repo) como **inventario oficial** del proyecto. Este ADR es el pointer canónico; cualquier cambio futuro de stack se hace abriendo un ADR nuevo que referencie a éste.

### Resolución de las 5 diferencias

| #   | Punto                                            | Resolución                                                                                                                                                                            | Justificación                                              |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **ORM**: Drizzle (asumido) vs Kysely (ERP)       | **Kysely**                                                                                                                                                                            | Ver ADR-B-002 revisado.                                    |
| 2   | **Node**: 20 (ERP) vs 22 (iwarehouse)            | **Node 22 LTS**                                                                                                                                                                       | Arranque nuevo = LTS actual.                               |
| 3   | **TS flags**: `exactOptionalPropertyTypes` sí/no | **Todos los flags ERP activos** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`) | Barra más alta para un sistema que toca causas judiciales. |
| 4   | **ESLint rules**                                 | **Merge de iwarehouse + regla `max-lines: 1000` de ERP**                                                                                                                              | Detalle en `STACK.md` §4.                                  |
| 5   | **Coverage**                                     | **80% desde día uno**                                                                                                                                                                 | Idem #3: dominio sensible.                                 |

### Piezas adoptadas de cada proyecto

**De ERP:**

- Estructura de `common/` (`RequestContextService` con AsyncLocalStorage, `AuditService`, `ValidationPipe` factory con `flattenValidationErrors`, `PostgresErrorFilter`).
- `DatabaseModule` global con pool `max: 50`.
- Organización por bounded contexts en `modules/` (15+ en ERP, ~11 en SURP).
- Coverage threshold 80% global.
- Flags TS estrictos completos.
- Regla ESLint `max-lines: 1000`.
- Scripts raíz con `pnpm --filter`.

**De iwarehouse-2.0:**

- Bootstrap dual-mode API/Worker con `WORKER_MODE=true`.
- Early fatal handlers + runtime handlers + watchdog timeout de 60s.
- `ConfigModule` con `registerAs` + fail-closed (valida env al arranque).
- Error masking OWASP A07 en Auth (siempre "Credenciales inválidas").
- Build info injection (`APP_VERSION`, `GIT_SHA`, `BUILD_TIME`).
- GitHub Actions con change detection (`dorny/paths-filter`).
- Hooks discipline React 19 (`useEffectEvent`, ESLint `no-restricted-syntax` contra `useEffect` directo en componentes, refs solo en `hooks/providers`).
- Form draft persistence en localStorage.
- BullMQ streaming patterns (progress por chunk, cancellation via Redis key).

**Piezas propias de SURP (no presentes en ninguno de los dos):**

- Modelo multi-organización con 3 tipos (ADR-B-003).
- RBAC dinámico N:M con permisos como código (ADR-B-007).
- Auditoría triple (trigger + event + sensitive read) en tabla única (ADR-B-009).
- Migración one-shot desde legacy (ADR-B-015).
- PostGIS + Google Maps como funcionalidad core (ADR-B-006, ADR-F-007).
- Storage dual local/Azure con abstracción (ADR-B-016, patrón tomado de IGM).
- Scanner móvil con sesión+QR (ADR-F-014).

### Consecuencias

- `STACK.md` vive en la raíz del proyecto y es de lectura obligatoria para cualquier aporte.
- `CLAUDE.md` raíz referencia `STACK.md` como inventario único; las secciones de stack del `CLAUDE.md` son extractos, no la fuente de verdad.
- ADR-B-002 se reescribió (Drizzle → Kysely). Todo doc que mencionaba Drizzle se migra a Kysely.
- Dependencies y `package.json` de cada app reflejan las versiones fijadas en `STACK.md`.
- Nuevos módulos siguen la estructura descrita en `STACK.md` §5 y `standards/MODULE-ANATOMY.md`.
- Cualquier librería no listada en `STACK.md` requiere ADR antes de agregarse.

**Ver:** `STACK.md` (raíz), `ADR-B-002` (ORM), `ADR-F-007` (mapas), `ADR-F-015` (stack frontend).

---

## ADR-B-020 — Casos de uso como fuente de verdad del dominio

**Fecha:** 2026-04-24
**Estado:** Aceptado (no negociable — fundacional)

**Contexto:** El legacy SURP tiene la lógica de negocio esparcida entre 58 controllers, 281 vistas Razor y services anémicos. No existe un lugar donde un analista, un abogado o un desarrollador nuevo pueda leer "qué hace el sistema cuando se registra un incidente" o "qué invariantes gobiernan el cierre de una causa". La lógica vive en el framework (controllers con `[HttpPost]`) mezclada con código de presentación (views con `@Html.Action`), y en el gap entre ambos se pierden reglas.

El usuario pidió explícitamente que el backend SURP 2.0 exponga su lógica de negocio como **casos de uso (use cases) aislados** que sean la **fuente de verdad funcional** del sistema — no los services, no los controllers, no el schema. Este ADR formaliza esa decisión.

**Decisión:** Toda operación significativa del dominio se modela como un **caso de uso** (clase inyectable con un único método público `execute`) que:

1. **Vive en `src/modules/{bc}/{entity}/use-cases/{verb}-{entity}.use-case.ts`.**
2. **Depende solo de puertos** (interfaces definidas en `ports/`), no de Kysely directo, de HTTP, ni de BullMQ. La implementación concreta se inyecta por DI (repositories Kysely, colas BullMQ, clientes HTTP).
3. **Recibe input validado** (DTO de entrada tipado) + `AuthContext` (usuario, organización, permisos resueltos). Devuelve **DTO de salida tipado** — nunca row de BD.
4. **Orquesta en este orden fijo:**
   1. Validar permisos adicionales al DTO (los del JWT ya los chequeó `PermissionGuard`).
   2. Cargar aggregates necesarios vía repository ports.
   3. Validar invariantes de dominio (la lógica real — ej. "no se puede cerrar una causa con hitos abiertos", "un incidente `fire` requiere al menos un predio asociado", "un RUT bloqueado no se puede volver a bloquear").
   4. Ejecutar la mutación (o el cálculo) y persistir.
   5. Emitir eventos: `AuditService.logEvent(...)` + encolar notificaciones/jobs si aplica.
   6. Construir y retornar el DTO de salida.
5. **Test unitario obligatorio** (`{verb}-{entity}.use-case.spec.ts`) con los puertos mockeados. Los invariantes de dominio se cubren allí, no en un test de integración.
6. **Nombre = verbo del dominio**, no CRUD técnico. Ejemplos:
   - `RegisterIncidentUseCase`, `AssignPropertyToIncidentUseCase`, `CloseCaseWithRulingUseCase`, `BlockRutUseCase`, `DispatchPatrolUseCase`, `LinkPersonToComplaintUseCase`, `ReassignZoneUseCase`.
   - Evitar: `CreateIncidentUseCase` (muy CRUD — crear un incidente es un acto de negocio), `UpdateCaseUseCase` (demasiado genérico — separar por verbo: `AddMilestoneToCase`, `AssignAttorneyToCase`, etc.).
7. **Un controller puede invocar varios use cases** — está bien. Lo inverso (un use case que invoca otros use cases) se evita salvo en orquestadores explícitos (`*.orchestrator.ts`).
8. **Pattern B (Clean Architecture) por defecto** para todo módulo con lógica de negocio real (incidents, complaints, cases, persons, vehicles, fires, maat, surveillance). Pattern A (CRUD fino) solo para mantenedores puros sin flujos ni invariantes (catalog simple: regions, communes, incident-types sin reglas). Ver `skills/CHOOSE-MODULE-PATTERN.md`.

**Esqueleto canónico:**

```typescript
// src/modules/incidents/incidents/use-cases/register-incident.use-case.ts
@Injectable()
export class RegisterIncidentUseCase {
  constructor(
    private readonly incidents: IncidentRepositoryPort,
    private readonly properties: PropertyRepositoryPort,
    private readonly audit: AuditService,
    @InjectQueue('notification-dispatch') private readonly notifications: Queue,
  ) {}

  async execute(input: RegisterIncidentInput, ctx: AuthContext): Promise<IncidentDto> {
    // 1. Validaciones adicionales
    if (ctx.organizationType === 'security_provider') {
      await this.ensureZoneAssignedToOrg(input.zoneId, ctx.organizationId);
    }

    // 2. Cargar aggregates
    const property = await this.properties.resolveFromPoint(input.lat, input.lng);

    // 3. Invariantes de dominio
    if (input.incidentType === 'fire' && !property) {
      throw new DomainError('incident.fire.requires_property');
    }

    // 4. Mutación
    const incident = await this.incidents.create({
      ...input,
      propertyId: property?.id ?? null,
      createdById: ctx.userId,
      organizationId: property ? property.currentOrganizationId : ctx.organizationId,
    });

    // 5. Eventos
    await this.audit.logEvent({
      action: 'incident_registered',
      entityType: 'incidents',
      entityId: incident.id,
      metadata: { incidentType: incident.type, propertyId: property?.id },
    });
    if (incident.severity === 'critical') {
      await this.notifications.add('incident-critical', { incidentId: incident.externalId });
    }

    // 6. DTO de salida
    return IncidentMapper.toDto(incident);
  }
}
```

**Razón:**

- **Contrato funcional explícito.** Leer los nombres y las firmas de los use cases de un bounded context describe lo que el sistema hace. El schema describe qué guardamos; los use cases describen qué sucede.
- **Testeable sin infra.** Mockeando puertos, cada invariante de dominio se verifica en milisegundos. Los tests son documentación viva de las reglas.
- **Migración legacy verificable.** Para cada caso de uso se compara "qué hacía el legacy cuando alguien hacía X" vs "qué hace SURP 2.0". Sin use cases explícitos esta comparación es subjetiva.
- **Skills legales convergen aquí.** Las reglas que emiten `/legal-penal`, `/legal-procesal`, `/legal-tomas`, `/legal-incendios`, `/legal-datos`, `/legal-armas-vigilantes` se traducen en invariantes de use cases concretos. El use case es el lugar donde "el código hace cumplir la ley".
- **Auditoría clara.** El registro de `audit_logs.action` coincide con el nombre del use case — queda auto-documentado.
- **Refactor barato.** Si NestJS cambia API, si Kysely cambia API, si migramos de BullMQ a otra cola — los use cases no se tocan. Solo se reescriben los adaptadores.
- **No es "Clean Architecture académica".** No se pide separar cada capa en paquetes aparte ni usar ports/adapters dogmáticamente en módulos triviales. Se pide que donde hay lógica de negocio, esa lógica esté en un use case con un nombre de dominio.

**Consecuencias:**

- **`MODULE-ANATOMY.md` Pattern B se adopta por defecto** para los módulos listados en `CHOOSE-MODULE-PATTERN.md`. Controllers de Pattern B son delgados: parsean DTO, invocan el use case, retornan el resultado.
- **Catálogo de use cases documentado.** Cada bounded context mantiene un índice `apps/api/src/modules/{bc}/USE-CASES.md` con la lista de casos de uso del contexto, su descripción de una línea y las invariantes que hace cumplir. Este archivo es referencia para negocio, no para el compilador.
- **Skills legales invocadas antes de cada use case sensible.** La skill se invoca al escribir el use case, no al escribir el schema. Output de la skill → invariantes del use case + test cases correspondientes.
- **Migración legacy mapea al use case, no a la tabla.** Cada script ETL referencia el use case SURP 2.0 que reemplaza funcionalmente al legacy. Si no hay use case equivalente, se bloquea la migración de ese módulo hasta tenerlo.
- **Endpoints del controller deben corresponder 1:N a use cases.** Un endpoint `POST /cases/:id/close` invoca `CloseCaseWithRulingUseCase`. `PATCH /cases/:id` genérico está prohibido — cada verbo de dominio es su propio endpoint.
- **Los handlers de BullMQ (`@Processor`) también invocan use cases.** Un processor es un adaptador (recibe payload, invoca use case, maneja retry/cancel); la lógica vive en el use case, nunca en el processor.
- **Stack cerrado por `STACK.md` + arquitectura cerrada por este ADR.** Un PR que introduce lógica de negocio directamente en un service, un controller o un repository — sin extraer el use case — no se merge.

**Ver:** `STACK.md` §5.bis (Arquitectura de dominio), `skills/CHOOSE-MODULE-PATTERN.md`, `standards/MODULE-ANATOMY.md`, `CLAUDE.md` raíz (regla #19).

---

## ADR-B-021 — Azure Communication Services Email (en lugar de Google Workspaces SMTP)

**Fecha:** 2026-04-25
**Estado:** Aceptado
**Reemplaza:** ADR-B-017 (Google Workspaces SMTP).

**Contexto:** SURP requiere emails transaccionales (alertas de plazos procesales, reset de password, recordatorios de audiencia, digests, notificaciones de incidentes críticos). En ADR-B-017 se decidió usar Google Workspaces SMTP con OAuth2 + Service Account + domain-wide delegation porque Arauco ya paga el dominio `surp.cl` con Workspace.

Al revisar la implementación práctica antes de escribir el módulo, salieron desventajas operativas significativas: la cadena OAuth2 + JWT firmado + delegation requiere configurar tres consolas (Google Cloud Console del SA, Workspace Admin para autorizar, Key Vault para guardar el JSON del SA), no hay CLI directo para enviar email (no existe `gcloud send-email`), las cuotas son por usuario impersonado (2.000/día Workspace estándar), y el SDK necesita refresco manual del access token cada 50 min con cache en Redis. Todo eso son piezas que hay que mantener y que pueden romperse en silencio.

**Decisión:** Adoptar **Azure Communication Services Email** (`@azure/communication-email` v1.x) con **Managed Identity** del Container App. SDK oficial publicado por Microsoft, integración nativa con el resto del stack (Key Vault, App Insights, Event Grid). MJML + Handlebars se conserva para los templates editables; cola `notification-dispatch` de BullMQ se conserva.

**Razón:**

- **Mismo cloud, una sola identidad.** Container App ya usa Managed Identity para Blob Storage y Key Vault. Agregar el rol `Communication Services Owner` o `Email Sender` en el resource ACS y listo — no se introduce un segundo proveedor de identidad.
- **CLI nativo.** `az communication email send` para test desde la terminal; recursos `Microsoft.Communication/communicationServices/emailServices/domains` en Bicep/Terraform. Provisioning reproducible desde el día 1.
- **Sin manejo de tokens de aplicación.** Sin OAuth2 SA, sin JWT, sin refresh, sin cache en Redis para el token. La capa de auth es transparente al proceso (`DefaultAzureCredential`).
- **Tracking integrado.** Event Grid emite `EmailDeliveryReportReceived`, `EmailEngagementTrackingReportReceived` (opens/clicks). Estos eventos los consume directamente el worker BullMQ y actualiza `notifications.status` sin tener que parsear bounces SMTP a mano.
- **Costo aceptable.** $0.00025/email + $0.0008/destinatario aceptado. Para volumen URP (estimado: <500 emails/día en MVP), el costo mensual está en torno a USD $5–15. El plan Workspace de Arauco no se elimina (sigue siendo casillas humanas y SSO); ACS solo cubre el envío programático del SURP.
- **Sin cuota dura.** Los límites de ACS son razonables (10/min en sandbox; 200/min al verificar el dominio personalizado, escalable bajo soporte). En contraste, Workspace tiene 2.000/día y bloquea la cuenta si se supera.

**Decisiones operativas:**

- **Dominio**: en MVP usar `*.azurecomm.net` Azure-managed. Antes del go-live: verificar `surp.cl` en ACS (registros DNS SPF, DKIM, DMARC). Coordinación con TI Arauco.
- **Senders**: tres direcciones de envío con distintos `display_name` configurables por template — `DoNotReply@surp.cl`, `alertas@surp.cl`, `reportes@surp.cl`. Apuntan al mismo ACS resource.
- **Driver dual:** `MAIL_DRIVER=local|azure_acs`. `local` = MailHog (dev, ya en docker-compose). `azure_acs` = staging/prod. Mismo patrón que `STORAGE_DRIVER` (ADR-B-016).
- **Sin App Password ni SA key JSON en Key Vault.** Para tests E2E del dev opcionalmente se permite `ACS_CONNECTION_STRING` desde Key Vault, pero el patrón canónico de prod es Managed Identity.
- **Templates editables, cola, MJML, audit, plain-text fallback** — todo lo demás del modelo ADR-B-017 se conserva. Cambia solo el transport.

**Consecuencias:**

- Reemplazo del SDK: `nodemailer` + `googleapis` desaparecen como dependencia de prod (se conservan solo en el driver `local` para hablar con MailHog vía SMTP). En su lugar `@azure/communication-email` y `@azure/identity`.
- Verificación del dominio `surp.cl` en ACS antes del go-live (1 ticket TI Arauco para los 4 registros DNS).
- `apps/api/src/notifications/transports/`: dos implementaciones del puerto `EmailTransport` — `LocalSmtpTransport` (nodemailer + MailHog) y `AzureAcsTransport` (`@azure/communication-email`).
- `STACK.md` actualizado en §3 y §10. Tabla de dependencias y variables `.env` reemplazadas.
- `standards/NOTIFICATIONS.md` reescrito para reflejar Azure ACS.
- Worker BullMQ `notification-dispatch` no cambia su contrato: sigue recibiendo `{ jobId, code, recipients, context }` y delegando al transport seleccionado.
- Costo agregado mensual en Azure: ~USD 10–15 (estimado MVP). Negligible vs. el plan de Workspace que igual se mantiene para casillas humanas.

**Ver:** `STACK.md` §10, `standards/NOTIFICATIONS.md`, ADR-B-017 (superseded).

---

## ADR-B-022 — Detección de device + ubicación para sesiones activas

**Fecha:** 2026-04-26
**Estado:** Aceptado

**Contexto:** El módulo de seguridad del frontend (`/settings/seguridad`) lista las sesiones activas del usuario como hacen Google/Apple/GitHub: una línea por sesión con etiqueta legible (ej. _"Chrome en Mac · Concepción, Chile · hace 2 min"_). El usuario decidió explícitamente que la etiqueta sea **automática** — no quiere editar manualmente el nombre de cada sesión. Hoy `user_sessions` solo guarda `ip` (INET) y `user_agent` (TEXT crudo), insuficientes para presentar al usuario.

Se evaluaron tres caminos:

- **(A) `user_agent` crudo en UI** — desastroso (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...`).
- **(B) Servicio externo de geo-IP** (`ipapi.co`, `ip-api.com`) — fuga la IP del usuario al tercero, requiere base de licitud + cláusulas de transferencia internacional bajo Ley 21.719 (art. 36-39). Descartado.
- **(C) Parser de UA local + base de geo-IP local** — todo el procesamiento ocurre en el servidor SURP, sin terceros. Cumple Ley 21.719 sin paperwork adicional (la IP se trata bajo el mismo interés legítimo de "permitir al usuario auditar sus sesiones").

**Decisión:** **Camino C** con dos librerías:

1. **`ua-parser-js`** (`^2.0`, MIT, ~70 M descargas/semana) — parser de User-Agent estándar de la industria. Extrae `{ browser, os, device, cpu }` desde un string UA. Tamaño: ~50 KB.
2. **`geoip-lite`** (`^1.4`, license MIT) — lookup local de IP → `{ country, region, city, ll: [lat, lng], timezone }`. Trae la base de datos pre-empaquetada (~50 MB en `node_modules`) derivada de **GeoLite2** de MaxMind. **No requiere license key, no requiere descarga manual, no requiere job de actualización**. La BD se refresca al actualizar el package (cada 1-3 meses).

Se descartó **`@maxmind/geoip2-node`** + descarga directa del `.mmdb` para MVP por overhead operativo (cuenta MaxMind, license key, tarea cron mensual, watchdog si la descarga falla). Si la frescura de la BD geo se vuelve crítica post-MVP, este ADR se supersede con un ADR nuevo que migre a `@maxmind/geoip2-node` + job BullMQ `geoip-refresh`.

**Modelo de datos** (extensión de `user_sessions`):

```sql
ALTER TABLE user_sessions ADD COLUMN device_label   TEXT;
ALTER TABLE user_sessions ADD COLUMN device_type    VARCHAR(20);
ALTER TABLE user_sessions ADD COLUMN location_label TEXT;
```

- **`device_label`** — string final mostrable: _"Chrome en Mac · Concepción, Chile"_. Computado al `INSERT` desde UA + IP. NULL si la detección falló (UA vacío o IP local en dev).
- **`device_type`** — uno de `'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'`. Usado para escoger ícono en UI.
- **`location_label`** — solo la ubicación (_"Concepción, Bío-Bío, Chile"_) por si la UI quiere mostrarla aparte del device.

**Patrón de código:**

```typescript
// ports/device-detector.port.ts
export interface DeviceDetectorPort {
  detect(userAgent: string | null, ip: string): DeviceFingerprint;
}
export interface DeviceFingerprint {
  deviceLabel: string | null;     // "Chrome en Mac · Concepción, Chile"
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  locationLabel: string | null;   // "Concepción, Bío-Bío, Chile"
}

// infrastructure/ua-parser-device-detector.ts
@Injectable()
export class UaParserDeviceDetector implements DeviceDetectorPort {
  detect(ua: string | null, ip: string): DeviceFingerprint { ... }
}
```

`LoginUseCase` resuelve el fingerprint **una vez al crear la sesión** y lo persiste. `RefreshTokenUseCase` **preserva** los labels de la sesión vieja al rotar (el device es el mismo aunque la IP del request rotador difiera momentáneamente — ej. móvil saltando entre Wi-Fi y 4G). No se re-detecta para evitar etiquetas inestables.

**Razón:**

- **Sin terceros, sin transferencia internacional.** La IP del usuario nunca sale de los servidores SURP. Cumple Ley 21.719 con el mismo interés legítimo que ya cubre la auditoría de sesiones.
- **Etiqueta auto-generada.** El usuario no edita nombres — alineado con el mandato explícito ("quiero que se haga automático").
- **Costo operativo cero en MVP.** Cero secrets, cero jobs, cero scripts de actualización. La BD geo viene en `node_modules`.
- **Limitación honesta documentada.** No se puede distinguir "MacBook Pro 14" vs "MacBook Air" — Apple no expone modelo exacto. Lo máximo que se logra es "Mac". Mismo caso para iPhones (todos = "iPhone"). Aceptamos la limitación: el costo de fingerprinting agresivo (canvas/WebGL/audio) no compensa el riesgo legal bajo art. 16 de la Ley 21.719.
- **Reversible sin migración destructiva.** Las 3 columnas son nullable. Si se cambia de librería, se reescribe el adapter `DeviceDetectorPort` sin tocar el dominio ni el schema.

**Consecuencias:**

- Dependencias agregadas en `apps/api/package.json`: `ua-parser-js`, `@types/ua-parser-js` (dev), `geoip-lite`, `@types/geoip-lite` (dev).
- `STACK.md` §3 actualizado.
- `apps/api/src/database/schema/01_organizations_users_roles.sql` actualizado con las 3 columnas. `pnpm db:codegen` regenera tipos.
- Nuevo puerto en `modules/auth/ports/device-detector.port.ts` + impl en `modules/auth/infrastructure/ua-parser-device-detector.ts`.
- `Session` (dominio) gana 3 propiedades nuevas (todas nullable). `SessionRepositoryPort.create` recibe el fingerprint.
- `LoginUseCase` invoca el detector antes de `sessions.create()`.
- `RefreshTokenUseCase` no llama al detector; pasa los labels viejos al rotar.
- `geoip-lite` requiere paths absolutos a `.dat` files al cargarse — debe excluirse del bundle Webpack/SWC (configurar `node_modules/geoip-lite` como `external` si se empaqueta). En `nest build` por defecto no se empaqueta el `node_modules`, así que aplica solo si se introduce bundling más adelante.
- En tests unitarios de use cases se mockea `DeviceDetectorPort` con un fingerprint fijo. La integración real se prueba con un test de `UaParserDeviceDetector` aparte (UA conocidos + IPs públicas conocidas).
- Migración legacy: para sesiones del legacy importadas, los 3 campos quedan NULL — el frontend muestra fallback "Sesión sin información de dispositivo" en esos casos. No es crítico porque el legacy igual no tenía sesiones persistentes consultables.

**Ver:** `STACK.md` §3 (dependencias), schema `01_organizations_users_roles.sql`, ADR-B-008 (Auth) — este ADR extiende el modelo de sesiones sin cambiar la decisión core de Passport+JWT.
