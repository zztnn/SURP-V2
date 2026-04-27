# Data Migration — Legacy SURP → SURP 2.0

> Mapeo tabla-a-tabla y campo-a-campo de la migración one-shot desde el legacy. Lectura obligatoria al diseñar schemas nuevos: **todo schema debe tener path de migración pensado**.

Relacionado:

- ADR-B-015 — Migración one-shot desde legacy
- ADR-B-003 — Modelo multi-organización
- ADR-B-007 — RBAC dinámico
- ADR-B-009 — Auditoría

---

## 1. Principios

1. **Se migran absolutamente todos los datos del legacy.** No se deja nada fuera por conveniencia. Toda fila de toda tabla del legacy debe tener destino en SURP 2.0 (aunque sea una tabla `*_legacy_only` de conservación para datos que ya no se usan operativamente). La única excepción tolerada por decisión del usuario: la auditoría granular de la API externa (`AuditoriaApi`, `AuditoriaPersonaApi`) puede diferirse si aprieta el cut-over — se migra en una pasada posterior.
2. **One-shot, no sync continuo.** Cut-over en ventana planificada (fin de semana, aprobada por Jefe URP).
3. **`external_id` estable.** UUIDs generados con `uuid-v5` determinístico a partir del PK legacy + namespace fijo. Reimportes son idempotentes.
4. **`migrated_from_legacy_id`** en cada tabla que recibe datos — referencia al PK legacy para reconciliación.
5. **Passwords se rehashean con argon2 + `must_reset_password=true`.** Nunca se migra el hash legacy (es encriptación reversible con clave fija — ver PITFALL-B-018). No se pierde la identidad del usuario; se pierde solo la capacidad de entrar sin antes resetear.
6. **Dry-run obligatorio** antes del cut-over real. El script produce reporte de inconsistencias esperadas.
7. **Idempotencia** — correr el ETL dos veces sobre la misma BD destino debe ser no-op. Logrado vía `external_id` + `ON CONFLICT DO UPDATE`.
8. **Si una fila legacy no calza en el modelo nuevo, no se descarta — se marca y se reporta.** Opciones: (a) tabla `*_legacy_inconsistencies` para revisión manual, (b) campo `migration_notes TEXT` en la tabla destino con el motivo, (c) acción manual previa al go-live documentada en el reporte de dry-run. **Nunca silenciar un dato perdido.**

Namespace UUID v5 para entidades migradas:

```
NAMESPACE_SURP_LEGACY = '6d7f3a2e-1b9c-4e8d-a1f7-legacy2026-04' (uuid v4 fijo)
external_id(entidad, legacy_pk) = uuid_v5(NAMESPACE_SURP_LEGACY, `${entidad}:${legacy_pk}`)
```

---

## 2. Orden de ejecución

Por dependencias de FK. Cada paso debe completar y validarse antes del siguiente.

1. Catálogos territoriales (`regions`, `provinces`, `communes`)
2. Catálogos Arauco (`zones`, `areas`, `properties`)
3. Catálogos de dominio (`incident_types`, `institutions`, `courts`, `prosecutors`, `fiscalias`)
4. `organizations` (desde `Empresa` legacy)
5. `roles` y `permissions` (seed inicial, no desde legacy)
6. `users` (desde `Usuario` legacy)
7. `user_roles` (un rol por usuario inicial, deducido de `Usuario.Perfil`; admin agrega adicionales post-migración)
8. `organization_zone_assignments` (inicialización: snapshot actual asumiendo asignaciones implícitas del legacy — ver §9)
9. `persons`, `vehicles`
10. `incidents`, `incident_properties`, `incident_evidences`
11. `complaints`, `complaint_parties`
12. `cases`, `case_lawyers`, `case_milestones`
13. `maat_records`, `maat_details`
14. `api_keys` (nuevas — no se migran credenciales legacy)
15. `audit_logs` (tablas de auditoría legacy como `source='legacy_import'`)

---

## 3. Mapeo: Organizations

**Legacy:** tabla `Empresa` — `EmpresaId VARCHAR(20) PK, RazonSocial, Logo, Activo, AddUser*, ChgUser*`.

**SURP 2.0:** `organizations` (ver `AUTHORIZATION.md` §6).

| Legacy (`Empresa`)        | SURP 2.0 (`organizations`)        | Transformación                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmpresaId` (string, RUT) | `rut` + `migrated_from_legacy_id` | `rut` normalizado sin puntos con guion                                                                                                                                                                                                                                                                                                                         |
| `RazonSocial`             | `name`                            | Trim + casing consistente                                                                                                                                                                                                                                                                                                                                      |
| `Logo`                    | (no migra)                        | Subir a Blob Storage en paso aparte si aplica                                                                                                                                                                                                                                                                                                                  |
| `Activo`                  | `active`                          | Directo                                                                                                                                                                                                                                                                                                                                                        |
| `AddUserId/AddDate`       | `created_by_id/created_at`        | Resolver `AddUserId` legacy → `users.id` nuevo                                                                                                                                                                                                                                                                                                                 |
| `ChgUserId/ChgDate`       | `updated_by_id/updated_at`        | Idem                                                                                                                                                                                                                                                                                                                                                           |
| —                         | `type`                            | **`principal` si `EmpresaId='85805200-9'` (Forestal Arauco S.A.), `security_provider` si la empresa es Green America / Maxcon / Tralkan, `api_consumer` si agrupa usuarios tipo `UsuarioApi` (ver §7.bis — segmentación de API consumers). Softe SpA (`77033805-0`) se migra como `principal_admin_provider` si ya se usa, o se desactiva en post-migración.** |
| —                         | `external_id`                     | `uuid_v5(NAMESPACE, 'organization:' + EmpresaId)`                                                                                                                                                                                                                                                                                                              |
| —                         | `is_system`                       | `true` solo para Arauco                                                                                                                                                                                                                                                                                                                                        |

**Validaciones pre-migración:**

- `Empresa.EmpresaId` único → OK.
- Todo RUT de empresa pasa validación módulo 11 (rechazar los que no).
- Advertencia si hay una `Empresa` con cero usuarios (probablemente inactiva).

**Casos especiales:**

- Empresa `Softe SpA` (`77033805-0`) — es la empresa desarrolladora del legacy, no operativa. **Se migra igual** (requisito: migrar todo). Sus usuarios también. El admin del sistema puede desactivarlos post-migración si corresponde. Tipo sugerido: `security_provider` por default, corregible manualmente.
- Empresas con perfil mixto (tiene usuarios `UsuarioApi` + usuarios normales) — se separan en dos organizaciones durante la migración (una `api_consumer` con los `UsuarioApi`, otra con el `type` que corresponda al resto), reportadas en el dry-run para confirmación del Jefe URP.

---

## 4. Mapeo: Users

**Legacy:** `Usuario` — `UsuarioId, CorreoElectronico, Rut, Perfil, EmpresaId, Nombres, Apellidos, Password, Telefono, Estadisticas, Activo, Add*, Chg*`.

**SURP 2.0:** `users`.

| Legacy              | SURP 2.0                  | Transformación                                                                          |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `UsuarioId`         | `migrated_from_legacy_id` | Mantener                                                                                |
| `CorreoElectronico` | `email`                   | Lowercase + trim                                                                        |
| `Rut`               | `rut`                     | Normalizado (sin puntos, con guion, K mayúscula)                                        |
| `Nombres`           | `first_name`              |                                                                                         |
| `Apellidos`         | `last_name`               |                                                                                         |
| `EmpresaId`         | `organization_id`         | Lookup vía `organizations.migrated_from_legacy_id = Empresa.EmpresaId`                  |
| `Password`          | `password_hash`           | **Hash argon2 aleatorio + `must_reset_password=true`**. No se migra el password legacy. |
| `Telefono`          | `phone`                   |                                                                                         |
| `Activo`            | `active`                  | Directo                                                                                 |
| `Perfil`            | (via `user_roles`)        | Mapeo explícito — ver tabla siguiente                                                   |
| `Add*`, `Chg*`      | `created_*`, `updated_*`  | Resolver usuarios primero (dependencia circular — ver §10)                              |
| —                   | `external_id`             | `uuid_v5(NAMESPACE, 'user:' + UsuarioId)`                                               |

### Mapeo de perfiles legacy → roles SURP 2.0

SURP 2.0 admite **múltiples roles por usuario** (ver ADR-B-007). La migración asigna **exactamente un rol inicial** a cada usuario, derivado de su `Usuario.Perfil` legacy. Post-migración, el admin puede agregar roles adicionales desde la UI para casos como MAAT (añadir `queries_maat` a usuarios que el Jefe URP autorice).

El mapeo depende del **tipo de organización** del usuario:

| `Perfil` legacy                  | Si `organization.type = 'principal'` | Si `organization.type = 'security_provider'` | Si `organization.type = 'api_consumer'` |
| -------------------------------- | ------------------------------------ | -------------------------------------------- | --------------------------------------- |
| `Administrador`                  | `administrator`                      | — (error, reportar)                          | —                                       |
| `UnidadPatrimonialAdministrador` | `patrimonial_admin`                  | `company_admin`                              | —                                       |
| `UnidadPatrimonial`              | `patrimonial`                        | `guard`                                      | —                                       |
| `AbogadoAdministrador`           | `lawyer_admin`                       | — (error)                                    | —                                       |
| `Abogado`                        | `lawyer`                             | — (error)                                    | —                                       |
| `AbogadoTerreno`                 | `field_lawyer`                       | — (error)                                    | —                                       |
| `Incendios`                      | `fires_specialist`                   | — (error)                                    | —                                       |
| `Seguimiento`                    | `surveillance`                       | — (error)                                    | —                                       |
| `Visor`                          | `viewer`                             | — (error, reportar: ¿qué esperan ver?)       | —                                       |
| `Consultas`                      | `queries_maat`                       | — (error)                                    | —                                       |
| `UsuarioApi`                     | — (error, reportar)                  | — (error)                                    | `api_blocks_check`                      |

Combinaciones marcadas "error" se reportan en el dry-run para decisión manual (usualmente el mapeo legacy fue inconsistente).

**Validaciones pre-migración:**

- `Usuario.CorreoElectronico` único (case-insensitive) → OK.
- RUT válido módulo 11 → OK. Rechazar los inválidos con reporte.
- Cada usuario tiene `EmpresaId` válido → OK.

---

## 5. Mapeo: Incidents

**Legacy:** `Incidente` (`SACL.EF.Entidades.Incidente`) — campos relevantes:
`IncidenteId`, `TipoIncidente` (enum), `FechaTomaConocimiento`, `Latitud`,
`Longitud`, `Relato`, `Codigo`, `Numero`, `Activo` (bool), `Toma` (bool),
`Semaforo` (nullable enum), `AddUser*`, `ChgUser*`. Geo en columnas
`NUMERIC` separadas; sin TZ.

**SURP 2.0:** `incidents` con `location GEOMETRY(POINT, 4326)` y state
machine simplificada de 3 valores (`draft`, `active`, `voided`) tras
decisión URP — ver `database/schema/06_incidents_core.sql` header.

| Legacy                             | SURP 2.0                                       | Transformación                                                                                                              |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `IncidenteId`                      | `migrated_from_legacy_id`                      | Mantener                                                                                                                    |
| `FechaTomaConocimiento`            | `occurred_at`                                  | Convertir a `TIMESTAMPTZ` asumiendo `America/Santiago` (el legacy guarda en local sin TZ)                                   |
| `Latitud`, `Longitud`              | `location`                                     | `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Si una de las dos es NULL o fuera de rango Chile, `location = NULL` y reportar. |
| `TipoIncidente`                    | `incident_type_id`                             | Lookup por mapeo del enum legacy a códigos del catálogo `incident_types`                                                    |
| `Codigo`, `Numero`                 | `correlative_code`, `correlative_number`       | Mantener literal — el legacy ya emite `{NN}-{YYYY}-Z{XX}`. `correlative_year` se deriva de `FechaTomaConocimiento.Year`.    |
| `Activo` + `Denuncias`/`voided_*`  | `state` (ver siguiente sección)                | Proyección — el legacy no tiene state machine, solo flag `Activo`.                                                          |
| `Toma`                             | (ver siguiente sección)                        | Flag legacy = incidente vinculado a toma de terreno. Mapear a `aggravating_factors`/`incident_type` según workshop URP.     |
| `Semaforo`                         | `semaforo`                                     | Enum legacy (`verde/amarillo/rojo` o NULL) → SURP 2.0 (`no_determinado/verde/amarillo/rojo`). NULL → `no_determinado`.      |
| `Relato`                           | `description`                                  | Trim                                                                                                                        |
| `PredioId` (vía `IncidentePredio`) | `property_id`                                  | Lookup vía catálogo migrado. Tomar el primer predio activo del N:M legacy.                                                  |
| `AddUserId`                        | `created_by_id` + `created_by_organization_id` | `created_by_organization_id` = `organization_id` del creador al momento de creación (snapshot)                              |
| —                                  | `organization_id`                              | **Organización actualmente asignada a la zona del predio** (resuelto al migrar vía `property → zone → current assignment`)  |
| `Add*`, `Chg*`                     | estándar                                       |                                                                                                                             |

**Estado del incidente** — proyección legacy → SURP 2.0:

El legacy NO tiene state machine, solo `Activo bool`. SURP 2.0 colapsó el
state machine a 3 valores (`draft/active/voided`) por decisión URP. La
proyección al ETL es:

| Legacy `Activo` | SURP 2.0 `state` | `void_reason`                                                       | `voided_at` | `voided_by_user_id`                |
| --------------- | ---------------- | ------------------------------------------------------------------- | ----------- | ---------------------------------- |
| `true`          | `'active'`       | NULL                                                                | NULL        | NULL                               |
| `false`         | `'voided'`       | `'Migrado del legacy: anulado sin razón registrada'` (literal fijo) | `ChgDate`   | usuario sistema `system-migration` |

> **`draft` no aplica al histórico** — es estado nuevo del flujo móvil offline.
> Ningún incidente legacy nace ahí.

> **No hay `under_review`/`closed`/`escalated`** — esos estados se eliminaron
> del SURP 2.0 (no existían en legacy y los usuarios URP no los usaban).
> "Cerrar operativamente" y "escalar a causa" se modelan como FK explícitas
> (`cases.incident_id`) en lugar de un state.

**Flag `Toma` (toma de terreno)** — mapeo pendiente de definición con la
URP. Tres opciones evaluadas:

1. Setear `incident_type` a una variante land-occupation
   (`incident_types.involves_land_occupation = true`) — preferido si la
   tipificación legacy no captura ya el caso.
2. Agregar `'land_occupation'` al array `aggravating_factors`.
3. Campo dedicado `relates_to_land_occupation BOOLEAN` si la URP lo pide
   para reportería.

Por ahora el ETL preserva el flag con opción 2 (no rompe schema) hasta
workshop URP.

**Validaciones del ETL:**

- Reportar incidentes sin coordenadas (posiblemente carga manual legacy incompleta) → `location = NULL`, marcar para review.
- Reportar incidentes cuyo predio no está en ninguna zona con asignación actual — quedan con `organization_id = principal` por default hasta intervención manual.
- Validar que el `Codigo` legacy parsee como `{NN}-{YYYY}-Z{XX}`. Códigos malformados o inexistentes (carga manual) → marcar para review; no abortar.

---

## 6. Mapeo: Complaints, Cases, Lawyers

### Complaints (Denuncias)

**Legacy:** `Denuncia`.

| Legacy                | SURP 2.0                  | Nota                         |
| --------------------- | ------------------------- | ---------------------------- |
| `DenunciaId`          | `migrated_from_legacy_id` |                              |
| `IncidenteId`         | `incident_id`             |                              |
| `InstitucionId`       | `institution_id`          | (Carabineros, PDI, Fiscalía) |
| `NumeroParteDenuncia` | `police_report_number`    |                              |
| `FechaDenuncia`       | `filed_at`                | TZ como incidente            |
| `EstadoDenuncia`      | `status`                  | Mapeo                        |
| `Add*`, `Chg*`        | estándar                  |                              |

### Cases (Causas)

**Legacy:** `Causa`.

| Legacy        | SURP 2.0                  | Nota                            |
| ------------- | ------------------------- | ------------------------------- |
| `CausaId`     | `migrated_from_legacy_id` |                                 |
| `DenunciaId`  | `complaint_id`            |                                 |
| `Ruc`         | `ruc`                     | Identificador Fiscalía          |
| `Rit`         | `rit`                     | Identificador Tribunal          |
| `FiscalId`    | `prosecutor_id`           |                                 |
| `FiscaliaId`  | `fiscalia_id`             |                                 |
| `TribunalId`  | `court_id`                |                                 |
| `EstadoCausa` | `status`                  | Mapeo                           |
| —             | `organization_id`         | Siempre el `principal` (Arauco) |

### Case Lawyers (AbogadoCausa)

**Legacy:** `AbogadoCausa` (PK compuesta `AbogadoId, CausaId`, campo `Responsable`).

| Legacy        | SURP 2.0 (`case_lawyers`)       |
| ------------- | ------------------------------- |
| `AbogadoId`   | `lawyer_user_id`                |
| `CausaId`     | `case_id`                       |
| `Responsable` | `is_responsible`                |
| `Add*`        | `assigned_at`, `assigned_by_id` |

---

## 7. Mapeo: Persons, Vehicles (incluyendo bloqueos para API)

### Persons

**Legacy:** `Persona` con columnas `Bloqueado`, `RazonBloqueo`, `ArchivoDesbloqueo`.

| Legacy                 | SURP 2.0                                              |
| ---------------------- | ----------------------------------------------------- |
| `PersonaId`            | `migrated_from_legacy_id`                             |
| `Rut`                  | `rut` (validar módulo 11, rechazar inválidos)         |
| `Nombres`, `Apellidos` | `first_name`, `last_name`                             |
| `Bloqueado`            | `is_blocked`                                          |
| `RazonBloqueo`         | `block_reason`                                        |
| `ArchivoDesbloqueo`    | `unblock_document_url` (re-subir a Blob, apuntar ahí) |

### Vehicles

**Legacy:** `Vehiculo` con `Bloqueado`, `RazonBloqueo`, `ArchivoDesbloqueo`.

Mapeo análogo a Persons, con `Patente` → `license_plate`.

---

## 8. Mapeo: MAAT

**Legacy:** `SurpMaat` + `SurpMaatDetalle*`.

Estas tablas son el módulo de medios incautados. Se migran tal cual a `maat_records` + `maat_details` (mismo esquema relacional). El rol migra mapea `Consultas` → `queries_maat`.

**Nota:** el legacy permite a **todos los usuarios de Arauco** acceder a MAAT. En SURP 2.0, MAAT requiere permiso explícito `maat.records.read` / `maat.records.manage` que NO está en el rol `patrimonial` por default — solo en `queries_maat`, `patrimonial_admin` (opcional) y `administrator`. Durante la migración se debe consultar al Jefe URP qué usuarios mantienen acceso a MAAT en el nuevo sistema.

---

## 9. Mapeo: Organization Zone Assignments (no existe en legacy)

Es una entidad **nueva** en SURP 2.0. El legacy no tiene `organization_zone_assignments` — el concepto de "qué empresa cubre qué zona" es tácito.

**Estrategia de inicialización:**

1. El dry-run extrae, por cada zona, cuál ha sido la `Empresa` predominante de los usuarios que crearon incidentes en esa zona **en los últimos 12 meses**.
2. Se genera un CSV con sugerencia `(zone, suggested_organization, confidence%)` que se entrega al Jefe URP.
3. El Jefe URP confirma o corrige cada fila.
4. Con el CSV revisado se arma el seed inicial de `organization_zone_assignments` con `valid_from = fecha_cutover`, `valid_to = NULL`.

**Consecuencia:** incidentes históricos heredan su `organization_id` de la asignación actual de la zona. Si la asignación cambia al corregir, el `organization_id` de los incidentes se recalcula antes del go-live.

---

## 10. Mapeo: Audit Logs

Las 4 tablas de auditoría del legacy se cargan en `audit_logs` con `source='legacy_import'`.

| Legacy                     | → `audit_logs.action`                                                                 | Campos relevantes                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `AuditoriaUsuario` (login) | `login_success` / `login_failed_password` / `login_failed_locked` según `EstadoLogin` | `user_id`, `occurred_at=AddDate`, `ip`, `metadata={perfil: Perfil}`                  |
| `AuditoriaApi`             | `api_plate_check`                                                                     | `user_id`, `occurred_at=AddDate`, `ip`, `metadata={plate, result, response_time_ms}` |
| `AuditoriaPersonaApi`      | `api_rut_check`                                                                       | Idem con `{rut, result, response_time_ms}`                                           |
| `AuditoriaConsulta`        | `query_block`                                                                         | `user_id`, `metadata={patente_rut, habilitado}`                                      |

**Retención:** se carga toda la historia disponible. No se descarta. Volumen esperado: moderado (miles a decenas de miles de filas).

---

## 11. Dependencias circulares y resolución

- `users.created_by_id` referencia a `users.id` — es circular si el creador también es migrado.
  - **Solución:** fase 1 carga todos los users con `created_by_id = NULL`. Fase 2 resuelve las FKs vía `UPDATE users SET created_by_id = ...` usando el mapa `migrated_from_legacy_id → new id`.
- `organizations.created_by_id` referencia `users.id` — mismo patrón en dos fases.

---

## 12. Scripts

Los scripts ETL viven en `/database/migrations/legacy/`.

Estructura sugerida:

```
/database/migrations/legacy/
├── 000_verify_prereqs.sql              -- confirmar BD destino vacía salvo seeds
├── 010_organizations.ts
├── 020_users_phase1.ts                 -- sin FKs circulares
├── 021_user_roles.ts
├── 030_organization_zone_assignments.ts -- lee CSV revisado por Jefe URP
├── 040_persons.ts
├── 041_vehicles.ts
├── 050_incidents.ts
├── 051_incident_evidences.ts           -- re-sube a Blob Storage
├── 060_complaints.ts
├── 070_cases.ts
├── 080_maat.ts
├── 090_audit_logs.ts
├── 100_users_phase2.ts                 -- resuelve FKs circulares
├── 900_reconciliation_report.ts        -- genera CSV de inconsistencias
└── run.ts                              -- orquestador con --dry-run / --apply
```

Comandos:

```bash
# Dry-run contra snapshot de prod (solo lectura)
pnpm db:migrate:legacy -- --from=<legacy-conn-str> --to=<new-conn-str> --dry-run

# Aplicar (cut-over real)
pnpm db:migrate:legacy -- --from=<legacy-conn-str> --to=<new-conn-str> --apply --confirm-prod
```

El orquestador verifica:

- BD destino vacía (salvo seeds de `permissions`, `roles` is_system, catálogos geográficos INE).
- Conexión a Blob Storage OK.
- Conexión a ambas BDs OK.
- Reporte final: contadores por tabla (origen vs destino), filas rechazadas con motivo, inconsistencias a resolver.

---

## 13. Post-migración

- Go-live solo tras aprobación del reporte de reconciliación por el Jefe URP.
- Email masivo a todos los usuarios migrados con instrucciones de reset de password (flujo `must_reset_password`).
- **API keys para `api_consumer`:** las credenciales HTTP básicas del legacy (`UsuarioApi` con password en header `usr`/`pwd`) no se prestan al modelo nuevo — SURP 2.0 usa API keys opacas (`sk_...`). Migración:
  - Cada `UsuarioApi` del legacy se convierte en un usuario de una `organization` type `api_consumer`.
  - Al cut-over el admin **emite una API key nueva** para cada `api_consumer`, que se entrega al cliente por canal seguro.
  - El endpoint `/araucaria/incidentes` legacy **no es un leak** — Arauco lo usa internamente para alimentar su sistema de inteligencia. En SURP 2.0 el endpoint equivalente vive en `/api/v1/intelligence/incidents` con autenticación + API key dedicada + rate limit + auditoría por consulta. Nunca abierto sin auth.
  - Los endpoints legacy `/entidad/{rut}` y `/vehiculo/{patente}` se reemplazan por `/api/v1/blocks/check?rut=X` / `?plate=X` — los clientes deben adaptar (cambio documentado + ventana de migración asistida).
  - La auditoría de consultas histórica (`AuditoriaApi`, `AuditoriaPersonaApi`) **se migra a `audit_logs`** con `source='legacy_import'` para no perder la trazabilidad. (Excepción tolerada: si el volumen aprieta el cut-over, se difiere a una pasada posterior documentada.)
- Primera semana post go-live: monitoreo intensivo de `audit_logs` para detectar patrones anómalos.
- Legacy entra en modo lectura durante 90 días (solo consulta histórica) antes de archivarse definitivamente.
