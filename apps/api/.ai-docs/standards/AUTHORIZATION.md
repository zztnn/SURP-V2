# Authorization — SURP 2.0 API

> Modelo completo de autorización: organizaciones, roles, permisos, reglas de visibilidad y enforcement. Lectura **obligatoria** antes de tocar cualquier módulo que lea o modifique datos.

Relacionado:
- ADR-B-003 — Modelo multi-organización (3 tipos)
- ADR-B-007 — RBAC dinámico (roles editables, permisos como catálogo)
- ADR-B-009 — Auditoría CRUD + lecturas sensibles
- `SECURITY.md` — Password hashing, API keys, rate limiting, prohibiciones heredadas del legacy

---

## 1. Resumen visual

```
┌─────────────────────────────────────────────────────────────┐
│  Organization (type)                                        │
│  ├── principal         — Arauco (única)                     │
│  ├── security_provider — Empresas de seguridad contratistas │
│  └── api_consumer      — Empresas forestales consumidoras    │
└─────────────────────────────────────────────────────────────┘
          │                                  │
          │  user.organization_id            │
          ▼                                  ▼
┌───────────────────┐               ┌───────────────────────┐
│      User         │  user_roles   │         Role          │
│                   ├──────────────>│  (scope-restricted    │
│ organization_id ─┼─   (N:M)      │   to org.type)        │
└───────────────────┘               └───────────────────────┘
                                              │
                                              │  role_permissions (N:M)
                                              ▼
                                    ┌───────────────────────┐
                                    │    Permission         │
                                    │  code: module.res.act │
                                    │  is_sensitive: bool   │
                                    └───────────────────────┘
```

**Regla dorada:** un usuario solo puede ejercer un permiso si:
1. Al menos **uno** de sus roles lo tiene asignado en `role_permissions`.
2. El `scope` de **todos** sus roles es compatible con `organization.type` (validado al asignar cada rol).
3. Para recursos filtrados por zona, la zona del recurso está asignada **actualmente** a su organización (solo aplica a `security_provider`).

Un usuario puede tener **múltiples roles**: los permisos efectivos son la UNIÓN de los permisos de todos sus roles. Esto evita la proliferación de roles combinatorios para casos como "patrimonial + acceso a MAAT" — se usa el rol base (`patrimonial`) + rol accesorio (`queries_maat`).

---

## 2. Tipos de organización

| type | Descripción | Cantidad | Usuarios | Visibilidad |
|------|-------------|----------|----------|-------------|
| `principal` | Arauco — operador del sistema | Exactamente 1 | Varios roles (admin, patrimonial, lawyer, etc.) | Según rol, ven datos de todas las `security_provider`. Nunca ven `api_consumer` salvo en logs. |
| `security_provider` | Empresa de seguridad contratista | N | Company admin + guardias | Solo ven/modifican incidentes/denuncias de zonas **actualmente** asignadas a su organización. |
| `api_consumer` | Empresa forestal externa | N | Opcional: usuarios web con rol único `queries.blocks.check`. Siempre: API keys. | Solo pueden invocar `/api/v1/blocks/check?rut=X` o `?plate=X`. Ningún otro endpoint. |

### Seed inicial

```sql
INSERT INTO organizations (external_id, type, name, rut, is_system) VALUES
  (gen_random_uuid(), 'principal', 'Celulosa Arauco y Constitución S.A.', '96573310-8', true);
```

El resto se crea al migrar desde legacy (una por cada `Empresa.EmpresaId` distinto de Arauco y Softe) o desde la UI del admin del sistema.

---

## 3. Catálogo de permisos

Los permisos tienen formato `modulo.recurso.accion` y viven como **catálogo en código**. Agregar un permiso requiere despliegue. El dev los declara en `src/auth/permissions.catalog.ts`:

```typescript
export const PERMISSIONS = {
  // incidents
  INCIDENTS_READ: { code: 'incidents.incidents.read', module: 'incidents', resource: 'incidents', action: 'read', isSensitive: false },
  INCIDENTS_CREATE: { code: 'incidents.incidents.create', module: 'incidents', resource: 'incidents', action: 'create', isSensitive: false },
  INCIDENTS_UPDATE: { code: 'incidents.incidents.update', module: 'incidents', resource: 'incidents', action: 'update', isSensitive: false },
  INCIDENTS_CLOSE: { code: 'incidents.incidents.close', module: 'incidents', resource: 'incidents', action: 'close', isSensitive: false },
  INCIDENTS_EVIDENCE_DOWNLOAD: { code: 'incidents.evidence.download', module: 'incidents', resource: 'evidence', action: 'download', isSensitive: true },

  // cases
  CASES_READ: { code: 'cases.cases.read', module: 'cases', resource: 'cases', action: 'read', isSensitive: true },
  CASES_CREATE: { code: 'cases.cases.create', module: 'cases', resource: 'cases', action: 'create', isSensitive: false },
  CASES_ASSIGN_LAWYER: { code: 'cases.cases.assign_lawyer', module: 'cases', resource: 'cases', action: 'assign_lawyer', isSensitive: true },

  // persons
  PERSONS_READ: { code: 'persons.persons.read', module: 'persons', resource: 'persons', action: 'read', isSensitive: false },
  PERSONS_IMPUTADO_READ: { code: 'persons.imputados.read', module: 'persons', resource: 'imputados', action: 'read', isSensitive: true },

  // queries (API externa + web de consulta)
  QUERIES_BLOCKS_CHECK: { code: 'queries.blocks.check', module: 'queries', resource: 'blocks', action: 'check', isSensitive: true },

  // admin del sistema
  USERS_MANAGE: { code: 'users.users.manage', module: 'users', resource: 'users', action: 'manage', isSensitive: false },
  ROLES_MANAGE: { code: 'roles.roles.manage', module: 'roles', resource: 'roles', action: 'manage', isSensitive: true },
  ORGANIZATIONS_MANAGE: { code: 'organizations.organizations.manage', module: 'organizations', resource: 'organizations', action: 'manage', isSensitive: true },
  AUDIT_READ: { code: 'audit.logs.read', module: 'audit', resource: 'logs', action: 'read', isSensitive: true },

  // maat (solo personal autorizado de Arauco)
  MAAT_READ: { code: 'maat.records.read', module: 'maat', resource: 'records', action: 'read', isSensitive: true },
  MAAT_MANAGE: { code: 'maat.records.manage', module: 'maat', resource: 'records', action: 'manage', isSensitive: true },
} as const;
```

Al arrancar la API, un job verifica que cada entrada del catálogo exista en la tabla `permissions`. Si falta, la inserta (`is_sensitive` del catálogo es la fuente de verdad).

### Convenciones

- **`isSensitive: true`** marca permisos cuyo **ejercicio** se audita como lectura sensible (genera `audit_logs` con `source='sensitive_read'`). Regla: `read`/`download`/`export` sobre datos delicados (evidencia, causas, imputados, bloqueos) son siempre `isSensitive: true`.
- **`*.manage`** agrupa CRUD completo para entidades de configuración (users, roles, organizations). Las entidades operativas (incidents, cases, etc.) se permisan por acción (`create/update/close/read`) para trazabilidad granular.

---

## 4. Roles base del sistema (seed)

Son roles `is_system=true`: no se borran ni se renombran. Sus permisos sí son editables por el admin (con warning en la UI). Son el piso de migración desde el legacy.

| Rol | Scope | Origen legacy | Permisos (resumen) |
|-----|-------|---------------|---------------------|
| `administrator` | `principal_only` | `Administrador` | Todos los permisos |
| `patrimonial_admin` | `principal_only` | `UnidadPatrimonialAdministrador` | Todo en `incidents`, `complaints`, `persons`, `vehicles`, `maat.read`, lectura de `cases` |
| `patrimonial` | `principal_only` | `UnidadPatrimonial` (para usuarios de Arauco) | CRUD sobre `incidents`, `complaints`, `persons`, `vehicles`, lectura de `cases` |
| `lawyer_admin` | `principal_only` | `AbogadoAdministrador` | Todo en `cases`, `assign_lawyer`, lectura de `incidents`/`complaints` |
| `lawyer` | `principal_only` | `Abogado` | CRUD sobre causas asignadas, lectura de `incidents`/`complaints` |
| `field_lawyer` | `principal_only` | `AbogadoTerreno` | Similar a `lawyer` con permisos de terreno |
| `external_lawyer` | `principal_only` | (nuevo) | Similar a `lawyer` para abogados externos contratados. Auditoría extra. |
| `fires_specialist` | `principal_only` | `Incendios` | Módulo `fires` (cuando se implemente) |
| `surveillance` | `principal_only` | `Seguimiento` | Módulo `surveillance` (patrols, tracking) |
| `viewer` | `principal_only` | `Visor` | Lectura de todo menos `maat`, `cases` sensibles |
| `queries_maat` | `principal_only` | `Consultas` | `maat.read` + `queries.blocks.check` |
| `company_admin` | `security_provider_only` | (nuevo — antes implícito) | CRUD `incidents`/`complaints` de zonas asignadas + gestión de usuarios de su empresa |
| `guard` | `security_provider_only` | `UnidadPatrimonial` (para usuarios de contratistas) | CRUD `incidents` + `create complaint` de zonas asignadas |
| `api_blocks_check` | `api_consumer_only` | `UsuarioApi` | Solo `queries.blocks.check` |

Nota sobre `UnidadPatrimonial`: el perfil legacy existe tanto en Arauco como en contratistas. En SURP 2.0 se separa en dos roles (`patrimonial` y `guard`) porque los permisos reales divergen (guards solo ven su zona).

---

## 5. Reglas de visibilidad

### 5.1 Usuarios de `principal` (Arauco)

Sin filtro por `organization_id`. Ven datos de todas las `security_provider`. El rol decide qué pueden leer/modificar (permisos).

### 5.2 Usuarios de `security_provider`

Filtro automático en queries vía `OrganizationScopeInterceptor`. Regla:

> Un usuario de una `security_provider` ve y modifica incidentes/denuncias **cuya zona esté asignada actualmente a su organización**. Si la zona se reasigna a otra empresa, la saliente pierde acceso y la entrante lo gana — incluido el histórico.

Implementación en query:

```typescript
// Traducción automática del interceptor:
const orgId = req.user.organizationId;

await db.select()
  .from(incidents)
  .innerJoin(properties, eq(incidents.propertyId, properties.id))
  .innerJoin(zones, eq(properties.zoneId, zones.id))
  .innerJoin(orgZoneAssignments, and(
    eq(orgZoneAssignments.zoneId, zones.id),
    eq(orgZoneAssignments.organizationId, orgId),
    // la asignación debe estar activa ahora
    lte(orgZoneAssignments.validFrom, now),
    or(isNull(orgZoneAssignments.validTo), gte(orgZoneAssignments.validTo, now)),
  ));
```

En la práctica se materializa una vista o CTE para no duplicar el join.

### 5.3 Usuarios de `api_consumer`

No pasan por el stack web principal. Autentican con API key (ver `SECURITY.md`). El único endpoint disponible para ellos es `/api/v1/blocks/check`.

### 5.4 Causas judiciales

**Nunca son visibles** para `security_provider` ni `api_consumer`. En `cases` no aplican reglas por zona — es un recurso puramente de Arauco. El filtro es simplemente `organization.type='principal'` en `RequestContext`.

### 5.5 Abogados y asignación de causas

- `lawyer` y `field_lawyer` ven **solo** las causas donde tienen registro en `case_lawyers (case_id, lawyer_id)`.
- `lawyer_admin` ve todas las causas y puede asignar abogados.
- `external_lawyer` funciona como `lawyer` pero con auditoría extra (todo acceso se registra como lectura sensible, sin importar `is_sensitive` del permiso).

---

## 6. Schema SQL (resumen)

Detalle completo en `/database/schema/`. Este bloque muestra el corazón del modelo.

```sql
-- Organizaciones
CREATE TABLE organizations (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  type VARCHAR(30) NOT NULL CHECK (type IN ('principal', 'security_provider', 'api_consumer')),
  name VARCHAR(200) NOT NULL,
  rut VARCHAR(12),                                -- RUT cuando aplica
  is_system BOOLEAN NOT NULL DEFAULT false,       -- Arauco = true, resto = false
  active BOOLEAN NOT NULL DEFAULT true,
  migrated_from_legacy_id VARCHAR(20),            -- Empresa.EmpresaId legacy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id BIGINT,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX organizations_unique_principal ON organizations(type) WHERE type = 'principal' AND deleted_at IS NULL;
CREATE INDEX organizations_type ON organizations(type) WHERE deleted_at IS NULL;

-- Usuarios
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  email VARCHAR(200) UNIQUE NOT NULL,
  rut VARCHAR(12) UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),                     -- argon2
  must_reset_password BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  locked_until TIMESTAMPTZ,
  migrated_from_legacy_id INT,                    -- Usuario.UsuarioId legacy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- auditoría estándar
  created_by_id BIGINT, updated_at TIMESTAMPTZ, updated_by_id BIGINT, deleted_at TIMESTAMPTZ
);

CREATE INDEX users_organization ON users(organization_id) WHERE deleted_at IS NULL;

-- Roles
CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  scope VARCHAR(30) NOT NULL CHECK (scope IN ('principal_only', 'security_provider_only', 'api_consumer_only')),
  is_system BOOLEAN NOT NULL DEFAULT false,       -- seeds: true (no editables/borrables)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id BIGINT, updated_at TIMESTAMPTZ, updated_by_id BIGINT, deleted_at TIMESTAMPTZ
);

-- Permisos (catálogo)
CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,              -- 'incidents.incidents.create'
  module VARCHAR(50) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX permissions_module ON permissions(module);

-- Relaciones
CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_id BIGINT,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by_id BIGINT,
  PRIMARY KEY (user_id, role_id)
);

-- Un usuario puede tener múltiples roles; permisos efectivos = UNIÓN de role_permissions.
-- El service valida que todos los roles de un usuario tengan scope compatible con organization.type.
CREATE INDEX user_roles_by_user ON user_roles(user_id);

-- Asignaciones organización ↔ zona (con historia)
CREATE TABLE organization_zone_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  zone_id BIGINT NOT NULL REFERENCES zones(id),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,                           -- null = vigente
  reason TEXT,                                    -- motivo del cambio
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id BIGINT NOT NULL
);

CREATE INDEX org_zone_assignments_current ON organization_zone_assignments(zone_id) WHERE valid_to IS NULL;
CREATE INDEX org_zone_assignments_org ON organization_zone_assignments(organization_id, valid_to);

-- API keys (para api_consumer)
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  key_hash VARCHAR(255) NOT NULL,                 -- hash del secret (prefijo visible + argon2 del resto)
  prefix VARCHAR(12) NOT NULL,                    -- primeros 8 chars visibles (para mostrar "sk_abc...")
  name VARCHAR(100) NOT NULL,                     -- nombre humano
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id BIGINT NOT NULL
);

CREATE INDEX api_keys_org ON api_keys(organization_id) WHERE revoked_at IS NULL;
CREATE INDEX api_keys_prefix ON api_keys(prefix) WHERE revoked_at IS NULL;
```

---

## 7. Enforcement en NestJS

### 7.1 Capas

Toda request autenticada pasa por **cuatro filtros** en orden:

1. **`JwtAuthGuard`** — valida firma y expiración del token.
2. **`PermissionGuard`** — verifica `@RequirePermission('incidents.incidents.create')` contra permisos del rol.
3. **`OrganizationScopeInterceptor`** — setea el scope de org en el `RequestContext` y prepara filtros automáticos para repositories.
4. **`AuditInterceptor`** — setea GUCs (`app.current_user_id`, `app.current_org_id`, `app.session_id`, `app.request_id`, `app.current_ip`) y audita lecturas sensibles si `is_sensitive=true`.

### 7.2 Decorador `@RequirePermission`

```typescript
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentsController {

  @Post()
  @RequirePermission('incidents.incidents.create')
  async create(@Body() dto: CreateIncidentDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Get(':externalId/evidence/:evidenceExternalId')
  @RequirePermission('incidents.evidence.download')   // is_sensitive=true → auditado automáticamente
  async downloadEvidence(...) { ... }
}
```

### 7.3 Filtro automático por organización

Los services reciben `RequestContext` por DI y el `OrgScopedRepository` agrega el join + where de zona asignada si `organizationType === 'security_provider'`:

```typescript
@Injectable()
export class IncidentsRepository extends OrgScopedRepository<Incident> {
  protected readonly table = incidents;
  protected readonly scopeStrategy = 'zone';   // 'zone' | 'direct_org' | 'none'

  // scopeStrategy='zone' → el base query añade los joins a properties/zones/org_zone_assignments
  // scopeStrategy='direct_org' → WHERE table.organization_id = :currentOrgId
  // scopeStrategy='none' → solo principal puede leer (validado en guard)
}
```

Las tablas y su estrategia:

| Tabla | Estrategia | Notas |
|-------|-----------|-------|
| `incidents` | `zone` | Visibilidad por zona asignada |
| `complaints` | `zone` | Hereda del incidente |
| `incident_evidences` | `zone` | Hereda del incidente |
| `cases` | `none` | Solo `principal` |
| `case_lawyers`, `case_milestones` | `none` | Solo `principal` |
| `persons`, `vehicles` | `direct_org` + `principal override` | `security_provider` ve solo los creados por su org; `principal` ve todos |
| `maat_records` | `none` | Solo `principal` con permiso explícito `maat.*` |
| `users`, `roles`, `permissions` | admin only (permiso `*.manage`) | |

### 7.4 Resolución de permisos al autenticar

```typescript
// AuthService.buildUserContext(user)
const roles = await this.rolesRepo.findByUserId(user.id);              // N roles
const permissions = await this.rolesRepo.getPermissionCodesForRoles(   // UNIÓN
  roles.map(r => r.id)
);

return {
  sub: user.externalId,
  userId: user.id,
  sessionId,
  organizationId: user.organizationId,
  organizationType: user.organization.type,
  roleIds: roles.map(r => r.id),
  roleNames: roles.map(r => r.name),
  permissions,   // string[] embebido en JWT (UNIÓN de todos los roles)
};
```

Cambios en `role_permissions` o `user_roles` invalidan la cache en Redis y fuerzan re-resolución en el siguiente request. Los JWTs viejos se respetan hasta su expiración (15 min) — trade-off aceptable.

**Asignación y revocación:**
- `UsersService.assignRole(userId, roleId, assignedById)` — inserta en `user_roles`. Valida que `role.scope` sea compatible con `organization.type` del usuario. Audita el evento.
- `UsersService.revokeRole(userId, roleId, revokedById)` — elimina la fila y audita. Valida que el usuario quede con al menos un rol (un usuario sin roles no puede autenticar).

---

## 8. Prohibiciones

- **Nunca** consultar permisos sobre `Controlador` (estilo legacy). El legacy lo hacía como `Permiso(Perfil, Controlador)` y era código muerto.
- **Nunca** ocultar autorización solo en el menú/UI. El backend es la fuente de verdad.
- **Nunca** exponer el `id` interno de `organizations`, `users`, `roles` en APIs — siempre `external_id`.
- **Nunca** dejar un endpoint sin `@RequirePermission` o `@Public` explícito. El `PermissionGuard` bloquea por defecto.
- **Nunca** filtrar en memoria ("traer todo y filtrar por org en la app") — siempre en SQL.
- **Nunca** permitir que un rol `principal_only` sea asignado a un usuario de `security_provider`, ni viceversa. Validar en `UsersService.assignRole()`. La validación se ejecuta por cada rol asignado, no solo al primero.
- **Nunca** dejar a un usuario sin roles asignados. Si se revoca el último rol, el service rechaza y exige asignar uno nuevo en la misma operación (o desactivar la cuenta).
- **Nunca** correlacionar un `security_provider` con causas judiciales, imputados, o MAAT — son recursos del `principal` únicamente.

---

## 9. Checklist al crear un módulo nuevo

- [ ] Agregar los permisos del módulo a `src/auth/permissions.catalog.ts` con `is_sensitive` correcto.
- [ ] Asignar esos permisos en los seeds de los roles `is_system` que aplican.
- [ ] Decidir `scopeStrategy` del repository (`zone` / `direct_org` / `none`).
- [ ] Aplicar `@RequirePermission(...)` en cada endpoint del controller.
- [ ] Agregar `migrated_from_legacy_id` si la tabla recibe datos legacy.
- [ ] Documentar en `DATA-MIGRATION.md` el origen legacy de la tabla.
- [ ] Verificar que el trigger de auditoría esté aplicado (ADR-B-009).
- [ ] Cubrir con tests: (a) usuario sin permiso → 403; (b) `security_provider` viendo zona ajena → 404 o filtrado; (c) `api_consumer` accediendo a cualquier endpoint distinto de `/blocks/check` → 403.
