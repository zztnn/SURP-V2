---
title: Módulo de causas judiciales — visión y modelo
status: vision (cerrado para SQL)
revision_date: 2026-04-24
related:
  - LEGAL-INVARIANTS-INCIDENTS.md
  - AUTHORIZATION.md
  - NOTIFICATIONS.md
  - BACKGROUND-JOBS.md
  - SECURITY.md
---

# Módulo de causas judiciales — visión y modelo

> Documento canónico del módulo `cases/` del SURP 2.0. Define la visión funcional, modelo de dominio, catálogos, máquinas de estado, plazos legales y notificaciones. **Este documento manda sobre el SQL** — el schema posterior debe respetar las invariantes aquí declaradas. Cualquier cambio se actualiza aquí _primero_.

---

## 0. Contexto y propósito

El módulo `cases/` reemplaza al módulo `Causas` del legacy SURP. Su propósito es ser **el escritorio de trabajo del abogado de Arauco** — no un registro pasivo, sino una herramienta que el abogado abre todos los días porque le ayuda activamente a llevar sus causas, no le obliga a duplicar lo que hace en Word/Outlook/PJUD.

### Usuarios primarios

- **Abogado titular** (interno o externo, con email arauco.com o gmail.com).
- **Abogado Administrador** (jefe del equipo legal de la URP).
- **Abogado Patrimonial / Abogado de Terreno** (perfiles legacy).

### Alcance

- Causas con incidente vinculado (núcleo histórico) — N causas pueden agrupar M incidentes (causa-bloque).
- Causas SIN incidente vinculado (recursos de protección, contencioso CONAF, cobranzas civiles, otras de Arauco URP).
- Cuatro materias: **penal · civil · contencioso administrativo · constitucional**.

### Lo que NO entra

- Honorarios, facturación o time tracking (gerencia financiera, fuera del SURP).
- Materia laboral (ajena a la URP).
- Materia tributaria, comercial pura, marcas, propiedad intelectual.

### Visibilidad transversal

Las causas son **exclusivas de Arauco** (organization principal). Las `security_provider` (Green America, Maxcon, Tralkan) **nunca** ven causas, imputados de causas ni abogados asignados. Llegan hasta la denuncia. Los `api_consumer` solo ven `blocks.check`. Esta regla es invariante de seguridad.

---

## 1. Visión: el escritorio del abogado

Tres capas de UX que el frontend debe materializar:

### 1.1 Bandeja personal del abogado (landing al login del rol abogado)

| Bloque                           | Contenido                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Mis causas activas**           | Kanban por instancia procesal: investigación / formalizada / acusación / juicio oral / sentencia / recurso / ejecución |
| **Vencimientos próximos 7 días** | Lista con semáforo: 🔴 vence ≤2d · 🟠 vence ≤5d · 🟡 vence ≤7d                                                         |
| **Audiencias de la semana**      | Mini-calendario con tipo, fecha, tribunal, link a la causa                                                             |
| **Tareas pendientes**            | TODO list propias o asignadas, con vencimiento                                                                         |
| **Notificaciones nuevas**        | Inbox: pull PJUD detectó movimiento, asignación de causa, observación del jefe, audiencia confirmada                   |

### 1.2 Vista de causa única (single pane of glass)

**Header fijo** con identificación procesal: `internal_code` · `RIT` · `RUC` · tribunal · fiscal · abogado titular · instancia procesal · próxima audiencia.

**Tabs**:

| Tab                | Contenido                                                                           |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Resumen**        | Materia, querellante/imputados, monto demandado, monto cobrado, KPIs                |
| **Personas**       | Imputados, víctimas, testigos, peritos, intervinientes — con rol procesal por causa |
| **Incidentes**     | Incidentes vinculados (N), con link al módulo incidents                             |
| **Audiencias**     | Calendario + lista; agendar nueva, registrar resultado, adjuntar acta               |
| **Hitos & plazos** | Timeline procesal con plazos vivos, alertas de vencimiento                          |
| **Escritos**       | Documentos versionados, plantillas, pruebas; agrupados por tipo                     |
| **Equipo**         | Abogados asignados (titular + secundarios), historial de cambios                    |
| **Notas privadas** | Notas confidenciales del equipo asignado, no visibles al jefe                       |
| **Auditoría**      | Log de quién hizo qué, cuándo                                                       |

**Sidebar** (siempre visible): timeline procesal compacto con plazos vivos en semáforo + acciones rápidas (registrar audiencia, subir escrito, agregar hito, generar querella desde plantilla, vincular incidente).

### 1.3 Inteligencia de portafolio (Abogado Administrador)

- Métricas por abogado: causas activas, tasa de éxito, tiempo promedio, vencimientos perdidos.
- Mapa de calor: causas por zona/predio.
- Alertas estructurales: causas estancadas, plazos en rojo, imputados reincidentes en múltiples causas.
- Reasignación de cartera: drag-and-drop entre abogados.

---

## 2. Modelo de dominio — entidades core

### 2.1 Identidad de causa

**Tabla `cases`**:

| Campo                                                                      | Tipo                       | Notas                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                       | BIGSERIAL PK               |                                                                                                                                                                                                                                                                                                                                         |
| `external_id`                                                              | UUID                       | Para URLs                                                                                                                                                                                                                                                                                                                               |
| `internal_code`                                                            | VARCHAR(20) UNIQUE         | Correlativo Arauco: `CAU-{YYYY}-{NNNNN}` **global por año** (no por zona — las estadísticas zonales se calculan via `case_incidents → incidents → properties → zones`). Asignado server-side vía tabla `case_sequences(year, last_number)` con `INSERT … ON CONFLICT DO UPDATE … RETURNING` atómico. Immutable post-creación (trigger). |
| `rit`                                                                      | VARCHAR(50)                | Rol Interno Tribunal — formato libre (`1234-2025`, `O-456-2026`)                                                                                                                                                                                                                                                                        |
| `ruc`                                                                      | VARCHAR(50)                | Rol Único de Causa Fiscalía (`2500001234-K`)                                                                                                                                                                                                                                                                                            |
| `nui`                                                                      | VARCHAR(50) NULL           | Número Único de Investigación                                                                                                                                                                                                                                                                                                           |
| `matter_id`                                                                | FK case_matters            | penal / civil / admin / constitucional                                                                                                                                                                                                                                                                                                  |
| `submatter_code`                                                           | VARCHAR(50) NULL           | Submateria (THEFT_TIMBER, INDEMNIZATION, CONAF_LEY_20283, PROTECTION)                                                                                                                                                                                                                                                                   |
| `court_id`                                                                 | FK courts NULL             | Tribunal actual de tramitación                                                                                                                                                                                                                                                                                                          |
| `prosecutor_office_id`                                                     | FK prosecutor_offices NULL | Solo causas penales                                                                                                                                                                                                                                                                                                                     |
| `prosecutor_id`                                                            | FK prosecutors NULL        | Fiscal a cargo                                                                                                                                                                                                                                                                                                                          |
| `arauco_procedural_role`                                                   | VARCHAR(30)                | `querellante / denunciante / parte_civil / demandante / demandado / recurrente / recurrido / tercero`                                                                                                                                                                                                                                   |
| `procedural_stage`                                                         | VARCHAR(30)                | Ver §4.1                                                                                                                                                                                                                                                                                                                                |
| `state`                                                                    | VARCHAR(20)                | `active / suspended / closed`                                                                                                                                                                                                                                                                                                           |
| `closure_form`                                                             | VARCHAR(40) NULL           | Ver §4.1                                                                                                                                                                                                                                                                                                                                |
| `started_at`                                                               | TIMESTAMPTZ NOT NULL       | Fecha de inicio (denuncia/querella/demanda)                                                                                                                                                                                                                                                                                             |
| `closed_at`                                                                | TIMESTAMPTZ NULL           |                                                                                                                                                                                                                                                                                                                                         |
| `summary`                                                                  | TEXT                       | Resumen narrativo editable                                                                                                                                                                                                                                                                                                              |
| `monto_demandado_clp`                                                      | NUMERIC(15,0) NULL         | Monto demandado en pesos                                                                                                                                                                                                                                                                                                                |
| `monto_otorgado_clp`                                                       | NUMERIC(15,0) NULL         | Monto otorgado en sentencia                                                                                                                                                                                                                                                                                                             |
| `monto_cobrado_clp`                                                        | NUMERIC(15,0) NULL         | Monto efectivamente cobrado                                                                                                                                                                                                                                                                                                             |
| `created_at`, `updated_at`, `created_by_id`, `updated_by_id`, `deleted_at` |                            | Estándar SURP                                                                                                                                                                                                                                                                                                                           |

**Invariantes**:

- `internal_code` immutable post-creación (trigger).
- `closure_form` requerido si `state = closed`.
- `prosecutor_office_id` requerido si `matter = penal`, prohibido si no.
- Una causa NO se puede pasar a `closed` sin tener al menos un hito de cierre registrado.
- Hard delete prohibido — solo soft delete (consistente con `incidents`).

### 2.2 Vinculación causa ↔ incidente

**Tabla puente `case_incidents`** (N:N):

| Campo          | Tipo        | Notas                                                   |
| -------------- | ----------- | ------------------------------------------------------- |
| `case_id`      | FK          |                                                         |
| `incident_id`  | FK          |                                                         |
| `linked_at`    | TIMESTAMPTZ |                                                         |
| `linked_by_id` | FK users    |                                                         |
| `link_reason`  | TEXT NULL   | Por qué este incidente forma parte de esta causa-bloque |

PK compuesta `(case_id, incident_id)`. La vinculación es **opcional** — una causa puede existir sin incidente.

### 2.3 Personas y roles procesales

**Tabla `case_parties`** (N:N causa ↔ party con rol):

| Campo                   | Tipo              | Notas                                                                                                                                                                                       |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case_id`               | FK                |                                                                                                                                                                                             |
| `party_id`              | FK parties        | Mismo party puede tener N roles en N causas                                                                                                                                                 |
| `role`                  | VARCHAR(30)       | Ver catálogo §3.7                                                                                                                                                                           |
| `joined_at`             | TIMESTAMPTZ       |                                                                                                                                                                                             |
| `left_at`               | TIMESTAMPTZ NULL  | Si dejó de ser parte                                                                                                                                                                        |
| `procedural_status`     | VARCHAR(30) NULL  | Solo aplica a imputados — formalized / accused / convicted / acquitted / dismissed                                                                                                          |
| `precautionary_measure` | VARCHAR(40) NULL  | Solo imputados — sin_cautelar / prision_preventiva / arresto_domiciliario_total / arresto_domiciliario_nocturno / firma_periodica / arraigo_nacional / prohibicion_acercarse_predio / otros |
| `armed_at_arrest`       | BOOLEAN NULL      | Solo imputados                                                                                                                                                                              |
| `alias`                 | VARCHAR(100) NULL | Solo imputados                                                                                                                                                                              |
| `gang_name`             | VARCHAR(100) NULL | Solo imputados                                                                                                                                                                              |
| `is_identified`         | BOOLEAN           | FALSE para imputados incertus (sin RUT conocido aún)                                                                                                                                        |
| `notes`                 | TEXT NULL         |                                                                                                                                                                                             |

**Invariantes**:

- Un mismo party puede ser **imputado** en una causa y **testigo** en otra (corrige el gap del legacy: `Persona.Vinculacion` mono-valor).
- `is_identified=FALSE` solo permitido para `role IN ('imputado', 'denunciado_incertus')`.
- `procedural_status` solo se modifica via hito procesal (no editable directo).

### 2.4 Equipo legal

**Tabla `case_attorneys`** (N:N causa ↔ user-abogado con rol y rango temporal):

| Campo              | Tipo             | Notas                                                   |
| ------------------ | ---------------- | ------------------------------------------------------- |
| `case_id`          | FK               |                                                         |
| `attorney_user_id` | FK users         | Cualquier user con rol abogado\*                        |
| `role`             | VARCHAR(30)      | `titular / secundario / pasante / supervisor / externo` |
| `assigned_from`    | TIMESTAMPTZ      |                                                         |
| `assigned_until`   | TIMESTAMPTZ NULL | NULL = vigente                                          |
| `assigned_by_id`   | FK users         |                                                         |
| `notes`            | TEXT NULL        |                                                         |

**Invariantes**:

- Una causa **debe** tener exactamente 1 abogado con `role=titular` vigente (`assigned_until IS NULL`).
- Cambio de titular = cerrar el actual + crear nuevo registro (append-only, historial completo).
- `case_attorneys.attorney_user_id` debe corresponder a un user de `organization principal` (Arauco). Los abogados externos siguen siendo users de Arauco aunque su `party_relationships.employer` sea otro.

### 2.5 Eventos procesales

#### 2.5.1 Hitos (`case_milestones`)

Append-only. Un hito **no se edita ni se borra** — solo se agrega un hito de corrección si hace falta.

| Campo                          | Tipo                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `case_id`                      | FK                                                     |
| `milestone_type_code`          | FK case_milestone_types                                |
| `occurred_at`                  | TIMESTAMPTZ NOT NULL                                   |
| `recorded_at`                  | TIMESTAMPTZ default now()                              |
| `description`                  | TEXT                                                   |
| `hearing_id`                   | FK case_hearings NULL (si se origina de una audiencia) |
| `triggered_by_milestone_id`    | FK self NULL (corrección/derivado)                     |
| `created_by_id`, `external_id` |                                                        |

#### 2.5.2 Audiencias (`case_hearings`) — entidad de primera clase

| Campo                                                 | Tipo                   | Notas                                                       |
| ----------------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `case_id`                                             | FK                     |                                                             |
| `hearing_type_code`                                   | FK case_hearing_types  | Ver §3.4                                                    |
| `scheduled_at`                                        | TIMESTAMPTZ            | Fecha y hora                                                |
| `actual_at`                                           | TIMESTAMPTZ NULL       | Cuándo realmente ocurrió                                    |
| `court_id`                                            | FK courts              |                                                             |
| `courtroom`                                           | VARCHAR(50) NULL       | Sala                                                        |
| `modality`                                            | VARCHAR(20)            | `presencial / videoconferencia / mixta`                     |
| `meeting_url`                                         | TEXT NULL              | Si es videoconferencia                                      |
| `state`                                               | VARCHAR(20)            | `scheduled / completed / suspended / postponed / cancelled` |
| `outcome_summary`                                     | TEXT NULL              | Resultado redactado por el abogado                          |
| `act_document_id`                                     | FK case_documents NULL | Acta cargada                                                |
| `attendees`                                           | JSONB                  | `[{party_id, role, present, notes}]`                        |
| `next_hearing_id`                                     | FK self NULL           | Si fija nueva audiencia                                     |
| `notification_sent_24h_at`, `notification_sent_1h_at` | TIMESTAMPTZ NULL       | Trazabilidad de recordatorios                               |

**Comportamiento**: cuando se registra `state = completed` con `outcome_summary`, se debe generar al menos un `case_milestone` derivado (formalización, decretó cautelar, fijó plazo, etc.). El sistema sugiere los hitos posibles según `hearing_type_code`.

#### 2.5.3 Resoluciones (`case_resolutions`)

Resoluciones del tribunal con potencial recurribilidad y plazos asociados.

| Campo                    | Tipo                                                     |
| ------------------------ | -------------------------------------------------------- |
| `case_id`                | FK                                                       |
| `resolution_type_code`   | FK case_resolution_types                                 |
| `issued_at`              | TIMESTAMPTZ                                              |
| `notified_at`            | TIMESTAMPTZ NULL (clave para gatillar plazos de recurso) |
| `summary`                | TEXT                                                     |
| `is_appealable`          | BOOLEAN                                                  |
| `is_subject_to_replevin` | BOOLEAN (reposición)                                     |
| `is_subject_to_nullity`  | BOOLEAN (nulidad)                                        |
| `document_id`            | FK case_documents NULL                                   |
| `hearing_id`             | FK case_hearings NULL                                    |

#### 2.5.4 Recursos (`case_appeals`)

| Campo                       | Tipo                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `case_id`                   | FK                                                                                                |
| `appeal_type_code`          | FK case_appeal_types (apelación / reposición / nulidad / casación_forma / casación_fondo / queja) |
| `against_resolution_id`     | FK case_resolutions                                                                               |
| `filed_at`                  | TIMESTAMPTZ                                                                                       |
| `filed_by_attorney_user_id` | FK users                                                                                          |
| `state`                     | VARCHAR(30) `filed / admitted / inadmissible / hearing_scheduled / decided`                       |
| `decision_summary`          | TEXT NULL                                                                                         |
| `decided_at`                | TIMESTAMPTZ NULL                                                                                  |
| `document_id`               | FK case_documents NULL                                                                            |

#### 2.5.5 Querellas (`case_querellas`)

| Campo                        | Tipo                                              |
| ---------------------------- | ------------------------------------------------- |
| `case_id`                    | FK                                                |
| `querella_type`              | VARCHAR(30) (`principal / ampliacion / adhesion`) |
| `filed_at`                   | TIMESTAMPTZ                                       |
| `filed_by_attorney_user_id`  | FK users                                          |
| `requested_diligences_count` | INT NULL                                          |
| `admitted_at`                | TIMESTAMPTZ NULL                                  |
| `admitted`                   | BOOLEAN NULL                                      |
| `document_id`                | FK case_documents NULL                            |
| `notes`                      | TEXT                                              |

### 2.6 Plazos vivos

Ver §5 detallado.

**Tabla `case_deadlines`** (instancias por causa):

| Campo                       | Tipo                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `case_id`                   | FK                                                                                    |
| `deadline_catalog_id`       | FK legal_deadline_catalog                                                             |
| `triggered_by_milestone_id` | FK case_milestones                                                                    |
| `triggered_at`              | TIMESTAMPTZ                                                                           |
| `due_at`                    | TIMESTAMPTZ (calculado por trigger usando `chilean_holidays` si `business_days=true`) |
| `state`                     | `pending / fulfilled / overdue / waived / suspended`                                  |
| `fulfilled_by_milestone_id` | FK case_milestones NULL                                                               |
| `fulfilled_at`              | TIMESTAMPTZ NULL                                                                      |
| `waived_reason`             | TEXT NULL                                                                             |
| `waived_by_id`              | FK users NULL                                                                         |
| `last_alert_sent_at`        | TIMESTAMPTZ NULL                                                                      |

### 2.7 Documentos

**Tabla `case_documents`**:

| Campo                   | Tipo                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `case_id`               | FK                                                                                                            |
| `document_type_code`    | FK case_document_types (querella, ampliacion, escrito, resolucion, acta, prueba, carpeta_investigacion, otro) |
| `title`                 | VARCHAR(200)                                                                                                  |
| `description`           | TEXT                                                                                                          |
| `current_version_id`    | FK case_document_versions (apunta a la última versión)                                                        |
| `template_id`           | FK case_templates NULL (si fue generado desde plantilla)                                                      |
| `presented_to_court_at` | TIMESTAMPTZ NULL (cuándo se presentó al tribunal)                                                             |

**Tabla `case_document_versions`** (versionado real):

| Campo                               | Tipo                                      |
| ----------------------------------- | ----------------------------------------- |
| `document_id`                       | FK                                        |
| `version_number`                    | INT                                       |
| `storage_object_key`                | TEXT (Azure Blob path via StorageService) |
| `mime_type`, `size_bytes`, `sha256` | metadata                                  |
| `uploaded_at`, `uploaded_by_id`     |                                           |
| `change_notes`                      | TEXT                                      |

**Tabla `case_templates`** (plantillas editables por Abogado Administrador):

| Campo                                          | Tipo                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `code`                                         | VARCHAR(50) UNIQUE (`QUERELLA_HURTO_MADERA`, `RECURSO_APELACION_BASE`) |
| `title`, `body_markdown`, `placeholders` JSONB |                                                                        |
| `applicable_to_matter`                         | VARCHAR(20) NULL                                                       |
| `is_system`                                    | BOOLEAN                                                                |

### 2.8 Tareas y notas

**Tabla `case_tasks`**:

| Campo                             | Tipo                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `case_id`                         | FK                                                     |
| `title`, `description`, `due_at`  |                                                        |
| `assigned_to_user_id`             | FK users                                               |
| `created_by_user_id`              | FK users                                               |
| `state`                           | `pending / in_progress / done / cancelled`             |
| `auto_generated_from_deadline_id` | FK case_deadlines NULL (si fue creada automáticamente) |
| `completed_at`                    | TIMESTAMPTZ NULL                                       |

Las tareas se crean **manualmente** por el abogado o **automáticamente** desde un plazo (al activarse, se genera tarea con `due_at = case_deadlines.due_at`).

**Tabla `case_notes`**:

| Campo            | Tipo                 |
| ---------------- | -------------------- |
| `case_id`        | FK                   |
| `author_user_id` | FK users             |
| `body_markdown`  | TEXT                 |
| `is_private`     | BOOLEAN default true |

**Visibilidad de notas privadas (decisión cerrada)**:

- Si `is_private = true` → visibles solo a los users actualmente listados en `case_attorneys` con `assigned_until IS NULL`.
- El Abogado Administrador (jefe) **no las ve** salvo que esté asignado a la causa.
- La UI debe mostrar un banner explícito al crear: _"Esta nota es privada. La verán solo los abogados asignados a esta causa: [X, Y, Z]. Tu Abogado Administrador no tiene acceso."_
- Las **lecturas** de notas privadas se registran en `audit_logs` con tipo `read_private_case_note` (auditoría de auditoría — para investigación interna ante mal uso).

---

## 3. Catálogos

### 3.1 `case_matters` (jerárquico)

| code  | description                                     |
| ----- | ----------------------------------------------- |
| PENAL | Penal (CP + leyes especiales)                   |
| CIVIL | Civil (CC arts. 2314 y ss.)                     |
| ADMIN | Contencioso administrativo (CONAF, SAG, SMA)    |
| CONST | Constitucional (recursos de protección, amparo) |

Submaterias en columna libre `submatter_code` (no tabla separada por simplicidad — el catálogo de submaterias se maneja como ENUM en aplicación).

### 3.2 `courts` — estrategia híbrida

**Estructura**:

| Campo                                                | Tipo                  | Notas                                         |
| ---------------------------------------------------- | --------------------- | --------------------------------------------- |
| `id`                                                 | BIGSERIAL PK          |                                               |
| `external_id`                                        | UUID                  |                                               |
| `code`                                               | VARCHAR(50) NULL      | Código PJUD si existe (ej. `JG_CONCEPCION_1`) |
| `name`                                               | VARCHAR(200) NOT NULL | Nombre oficial                                |
| `court_type`                                         | VARCHAR(40)           | Ver enum abajo                                |
| `commune_id`                                         | FK communes NULL      | Ubicación geográfica                          |
| `region_code`                                        | VARCHAR(10)           | Código INE de región (cacheado desde commune) |
| `jurisdiction_notes`                                 | TEXT                  |                                               |
| `pjud_estado_diario_url`                             | TEXT NULL             | URL específica para scraper (post-MVP)        |
| `is_normalized`                                      | BOOLEAN default false | True = validado por Abogado Administrador     |
| `is_system`                                          | BOOLEAN default false | True = parte del seed oficial                 |
| `created_by_id`, `normalized_by_id`, `normalized_at` |                       |                                               |

**`court_type`**: `juzgado_garantia / tribunal_oral_penal / corte_apelaciones / corte_suprema / juzgado_letras_civil / juzgado_letras_trabajo / juzgado_familia / contencioso_administrativo / tribunal_constitucional / otro`.

**Política de carga (decisión cerrada)**:

1. **Seed inicial mínimo (MVP)**: tribunales más usados por la URP en las 4 regiones donde opera Arauco históricamente: **Maule · Ñuble · Biobío · Araucanía**. La lista exacta se deriva del legacy (tabla `Tribunal` histórica) + aportes del equipo URP. Todos con `is_normalized=true`, `is_system=true`.
2. **Entrada on-the-fly**: cuando un abogado al crear/editar una causa escribe un tribunal que no está en el catálogo, el sistema **lo crea con `is_normalized=false`** y permite continuar. Una badge 🟡 en la UI avisa que no está normalizado.
3. **Normalización**: el Abogado Administrador tiene una vista de "tribunales pendientes de normalizar" donde puede editar/fusionar duplicados y marcar `is_normalized=true`.
4. **Scrape PJUD (post-MVP, TODO)**: worker job que importa el catálogo oficial de PJUD filtrado por las 4 regiones. Sobre-escribe `pjud_estado_diario_url` y marca `is_system=true`. Resolución de duplicados: match por `name` normalizado (minúsculas, sin tildes) + `commune_id`.

### 3.2-bis `prosecutor_offices` y `prosecutors` — estrategia híbrida análoga

**`prosecutor_offices`** (fiscalías):

| Campo                                                                              | Tipo             | Notas                                                                           |
| ---------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `id`, `external_id`                                                                |                  |                                                                                 |
| `name`                                                                             | VARCHAR(200)     | Ej. "Fiscalía Local de Los Ángeles"                                             |
| `office_type`                                                                      | VARCHAR(30)      | `fiscalia_local / fiscalia_regional / fiscalia_nacional / unidad_especializada` |
| `commune_id`                                                                       | FK communes NULL |                                                                                 |
| `region_code`                                                                      | VARCHAR(10)      |                                                                                 |
| `parent_office_id`                                                                 | FK self NULL     | Fiscalía regional padre (para locales)                                          |
| `is_normalized`, `is_system`, `created_by_id`, `normalized_by_id`, `normalized_at` |                  | Misma política que courts                                                       |

**`prosecutors`** (fiscales):

| Campo                        | Tipo                  | Notas                                             |
| ---------------------------- | --------------------- | ------------------------------------------------- |
| `id`, `external_id`          |                       |                                                   |
| `party_id`                   | FK parties NULL       | Si el fiscal es `natural_person` con RUT conocido |
| `full_name`                  | VARCHAR(200)          | Redundancia controlada — no siempre se tiene RUT  |
| `prosecutor_office_id`       | FK prosecutor_offices |                                                   |
| `email`                      | `d_email` NULL        | Correo profesional                                |
| `phone`                      | `d_phone_cl` NULL     |                                                   |
| `is_active`                  | BOOLEAN               | Fiscal vigente (los fiscales rotan)               |
| `is_normalized`, `is_system` |                       | Misma política                                    |

**Política**: idéntica a courts. Seed mínimo para las 4 regiones Arauco + entrada on-the-fly + normalización por Abogado Administrador + scrape post-MVP desde fuente oficial del Ministerio Público.

### 3.3 `case_milestone_types`

Base mínima = los 48 valores de `NombreHito` del legacy + nuevos. Estructura:

| Campo                    | Tipo                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `code`                   | VARCHAR(50) UNIQUE (FORMALIZATION, ACCUSATION, NULL_SENTENCE, etc.) |
| `name`                   | VARCHAR(100)                                                        |
| `category`               | judicial / fiscalia / administrativo / interno_arauco               |
| `applicable_to_matter`   | VARCHAR(20) NULL                                                    |
| `auto_advances_stage_to` | VARCHAR(30) NULL (si este hito hace avanzar la instancia procesal)  |
| `is_system`              | BOOLEAN                                                             |

### 3.4 `case_hearing_types`

| code                 | name                              |
| -------------------- | --------------------------------- |
| CONTROL_DETENCION    | Control de detención              |
| FORMALIZACION        | Formalización (CPP art. 229)      |
| CAUTELAR             | Cautelar                          |
| CIERRE_INVESTIGACION | Cierre de investigación           |
| PREP_JUICIO_ORAL     | Preparación de juicio oral (APJO) |
| JUICIO_ORAL          | Juicio oral                       |
| LECTURA_SENTENCIA    | Lectura de sentencia              |
| VISTA_APELACION_ICA  | Vista de la causa en ICA          |
| VISTA_NULIDAD        | Vista de recurso de nulidad       |
| AUDIENCIA_CIVIL      | Audiencia civil                   |
| ALEGATOS             | Alegatos                          |
| OTRA                 | Otra                              |

### 3.5 `case_resolution_types`

| code                      | name                            | is_appealable | is_subject_to_replevin | is_subject_to_nullity |
| ------------------------- | ------------------------------- | ------------- | ---------------------- | --------------------- |
| SENTENCIA_CONDENATORIA    | Sentencia condenatoria          | true          | false                  | true                  |
| SENTENCIA_ABSOLUTORIA     | Sentencia absolutoria           | true          | false                  | true                  |
| SOBRESEIMIENTO_DEFINITIVO | Sobreseimiento definitivo       | true          | false                  | false                 |
| SOBRESEIMIENTO_TEMPORAL   | Sobreseimiento temporal         | true          | false                  | false                 |
| RESOLUCION_CAUTELAR       | Resolución cautelar             | true          | true                   | false                 |
| AUTO_APERTURA_JUICIO_ORAL | Auto de apertura de juicio oral | true          | false                  | false                 |
| RESOLUCION_INTERLOCUTORIA | Resolución interlocutoria       | varía         | true                   | false                 |
| DECRETO                   | Decreto                         | false         | true                   | false                 |
| RESOLUCION_ICA            | Resolución ICA                  | false         | false                  | false                 |
| RESOLUCION_CS             | Resolución CS                   | false         | false                  | false                 |

### 3.6 `case_appeal_types`

| code           | name                 | applicable_against                      |
| -------------- | -------------------- | --------------------------------------- |
| APELACION      | Apelación            | resoluciones del JG (CPP art. 366)      |
| REPOSICION     | Reposición           | resoluciones interlocutorias y decretos |
| NULIDAD        | Nulidad              | sentencia definitiva del TOP            |
| CASACION_FORMA | Casación en la forma | sentencias civiles                      |
| CASACION_FONDO | Casación en el fondo | sentencias civiles                      |
| QUEJA          | Recurso de queja     | faltas o abusos graves                  |

### 3.7 `case_party_roles`

| code                | name                                              | matter                        |
| ------------------- | ------------------------------------------------- | ----------------------------- |
| QUERELLANTE         | Querellante                                       | penal                         |
| QUERELLADO          | Querellado                                        | penal                         |
| IMPUTADO            | Imputado                                          | penal                         |
| DEFENSOR            | Defensor                                          | penal                         |
| VICTIMA             | Víctima                                           | penal                         |
| TESTIGO             | Testigo                                           | penal/civil                   |
| PERITO              | Perito                                            | penal/civil                   |
| DENUNCIANTE         | Denunciante                                       | penal                         |
| DENUNCIADO_INCERTUS | Denunciado/Imputado incertus (sin identificación) | penal                         |
| DEMANDANTE          | Demandante                                        | civil                         |
| DEMANDADO           | Demandado                                         | civil                         |
| TERCERO_COADYUVANTE | Tercero coadyuvante                               | civil                         |
| RECURRENTE          | Recurrente                                        | constitucional/administrativo |
| RECURRIDO           | Recurrido                                         | constitucional/administrativo |
| FISCALIZADO         | Fiscalizado (ante CONAF/SAG/SMA)                  | administrativo                |

### 3.8 `case_attorney_roles`

| code       | name                                  |
| ---------- | ------------------------------------- |
| TITULAR    | Titular (responsable principal)       |
| SECUNDARIO | Secundario (apoyo)                    |
| PASANTE    | Pasante                               |
| SUPERVISOR | Supervisor (jefe del equipo)          |
| EXTERNO    | Externo (estudio jurídico contratado) |

### 3.9 `legal_deadline_catalog` (10 plazos MVP)

Ver §5.1.

### 3.10 `chilean_holidays`

| Campo           | Tipo                                |
| --------------- | ----------------------------------- |
| `date`          | DATE PK                             |
| `name`          | VARCHAR(200)                        |
| `irrenunciable` | BOOLEAN                             |
| `holiday_type`  | VARCHAR(20) (`national / regional`) |
| `source`        | VARCHAR(20) default 'feriados.io'   |
| `synced_at`     | TIMESTAMPTZ                         |

**Sincronización**: worker BullMQ job `sync-chilean-holidays` corre 1 vez al año (1 de noviembre) para precargar el año siguiente. Endpoint: `https://api.feriados.io/v1/CL/holidays/{year}` (requiere API key gratuita registrada en cuenta del SURP, secret en Azure Key Vault como `FERIADOS_IO_API_KEY`).

---

## 4. Máquinas de estado

### 4.1 Estado procesal de la causa (`procedural_stage`)

Aplica solo a causas penales (las civiles/admin/constitucionales tienen su propia secuencia más simple).

```
investigation_unformalized
        │
        ▼
investigation_formalized    ◄──── (hito FORMALIZATION)
        │
        ├──► (cierre + acusación) ──► accusation
        │                                  │
        │                                  ▼
        │                          oral_trial_prep ──► oral_trial ──► sentence
        │                                                                  │
        ├──► (cierre + sobreseimiento) ──► closed                         │
        │                                                                  ▼
        ├──► (cierre + no perseverar) ──► closed                       appeal
        │                                                                  │
        └──► (suspensión condicional cumplida) ──► closed                  ▼
                                                                       cassation
                                                                           │
                                                                           ▼
                                                                       execution
                                                                           │
                                                                           ▼
                                                                        closed
```

**Reglas**:

- No se permite saltar etapas (ej. de `investigation_unformalized` directo a `sentence`).
- Cada transición requiere un hito específico que la justifique.
- `closed` requiere `closure_form` no nula.

Para **civil**: `presentation → contestation → prueba → sentencia → recurso → ejecución → closed`.
Para **admin**: `denuncia/cargo → descargos → resolucion → reposicion → jerarquico → reclamacion_judicial → closed`.
Para **constitucional**: `presentacion → traslado → vista → fallo → closed`.

### 4.2 Estado procesal del imputado por causa (`case_parties.procedural_status`)

Solo aplica a `role = imputado`:

```
identified ──► formalized ──► accused ──► convicted
                    │              │           │
                    │              └─► acquitted
                    │
                    ├─► dismissed (sobreseimiento)
                    └─► suspended_conditional ──► dismissed (cumplida)

(branch separada para imputados sin identificar)
incertus (is_identified=false) ──► identified (al conocerse RUT)
```

### 4.3 Estado de plazo (`case_deadlines.state`)

```
pending ──► fulfilled (al registrar hito que lo cumple)
   │
   ├──► overdue (al pasar due_at sin hito que lo cumpla — actualizado por worker)
   │       └──► fulfilled (puede cumplirse fuera de plazo, queda traza)
   │
   ├──► waived (descartado manualmente por abogado con razón)
   │
   └──► suspended (causa suspendida, plazo congelado)
```

---

## 5. Plazos vivos — detalle

### 5.1 Catálogo MVP de 10 plazos

| Code                               | Descripción                                | Duración | Tipo días                | Hito disparador                     | Hito cumple                                | Severidad UI             | Norma              |
| ---------------------------------- | ------------------------------------------ | -------- | ------------------------ | ----------------------------------- | ------------------------------------------ | ------------------------ | ------------------ |
| `DENUNCIA_OBLIGATORIA_24H`         | Denuncia obligatoria del jefe de predio    | 24       | hours                    | Conocimiento (= creación incidente) | DENUNCIA_PRESENTADA                        | 🔴 alerta a 12h          | CPP arts. 175-176  |
| `PRESCRIPCION_FALTA`               | Prescripción acción penal — falta          | 6        | months                   | Fecha del hecho                     | DIRECCION_PROCESO_CONTRA_IMPUTADO          | 🟠 alerta 30d            | CP art. 94         |
| `PRESCRIPCION_SIMPLE_DELITO`       | Prescripción acción penal — simple delito  | 5        | years                    | Fecha del hecho                     | DIRECCION_PROCESO_CONTRA_IMPUTADO          | 🟡 alerta 90d            | CP art. 94         |
| `PRESCRIPCION_CRIMEN`              | Prescripción acción penal — crimen         | 10       | years                    | Fecha del hecho                     | DIRECCION_PROCESO_CONTRA_IMPUTADO          | 🟡 alerta 180d           | CP art. 94         |
| `CIERRE_INVESTIGACION_FORMALIZADA` | Cierre máximo de investigación formalizada | 2        | years (corridos)         | FORMALIZATION                       | CIERRE_INVESTIGACION                       | 🟠 alerta 90d            | CPP art. 234       |
| `DECISION_FISCAL_POST_CIERRE`      | Decisión fiscal tras cierre                | 10       | days (corridos)          | CIERRE_INVESTIGACION                | ACUSACION / SOBRESEIMIENTO / NO_PERSEVERAR | 🟠 alerta 3d             | CPP art. 248       |
| `RECURSO_APELACION`                | Plazo de apelación                         | 5        | business_days            | NOTIFICACION_RESOLUCION_APELABLE    | APELACION_PRESENTADA                       | 🔴 alerta 2d             | CPP art. 366       |
| `RECURSO_NULIDAD`                  | Plazo de recurso de nulidad                | 10       | days (corridos)          | NOTIFICACION_SENTENCIA_DEFINITIVA   | NULIDAD_PRESENTADA                         | 🟠 alerta 5d             | CPP art. 372       |
| `ACCION_CIVIL_EN_PROCESO_PENAL`    | Acción civil dentro del proceso penal      | 15       | business_days antes APJO | CITACION_APJO                       | DEMANDA_CIVIL_PRESENTADA                   | 🟡 alerta 30d antes APJO | CPP art. 60        |
| `RECLAMACION_CONAF`                | Reclamación administrativa CONAF           | 30       | business_days            | NOTIFICACION_RESOLUCION_CONAF       | RECLAMACION_PRESENTADA                     | 🟡 alerta 10d            | Ley 20.283 art. 24 |

### 5.2 Cálculo de días hábiles

Días hábiles = días que **no son** feriados (`chilean_holidays`) ni sábado ni domingo. Función PG `fn_add_business_days(start_at, days)` consulta `chilean_holidays` y suma saltando.

### 5.3 Worker de plazos

Job BullMQ `case-deadlines-monitor` corre **cada hora**:

1. Marca como `overdue` los plazos con `due_at < now()` aún `pending`.
2. Para cada plazo en `pending`, evalúa `alert_thresholds` (definidos en catálogo) y dispara notificación si toca, registrando `last_alert_sent_at`.
3. Recalcula `due_at` si el hito disparador fue corregido.

### 5.4 Suspensión y reanudación

Si `cases.state` cambia a `suspended`, todos los plazos `pending` pasan a `suspended`. Al reactivarse, se recalcula `due_at` extendiendo por el tiempo suspendido.

---

## 6. Eventos y notificaciones

### 6.1 Catálogo de eventos del módulo (MVP)

| Evento                              | Cuándo se dispara                               | Destinatarios                                    |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `case.created`                      | Creación de causa                               | Abogado titular asignado, Abogado Administrador  |
| `case.attorney.assigned`            | Asignación de abogado                           | Abogado nuevo asignado                           |
| `case.attorney.changed`             | Cambio de titular                               | Titular nuevo + saliente + Abogado Administrador |
| `case.stage.advanced`               | Cambio de instancia procesal                    | Abogados asignados                               |
| `case.closed`                       | Cierre de causa                                 | Abogados asignados + Abogado Administrador       |
| `hearing.scheduled`                 | Audiencia programada                            | Abogados asignados                               |
| `hearing.reminder.24h`              | 24h antes de audiencia                          | Abogados asignados                               |
| `hearing.reminder.1h`               | 1h antes de audiencia                           | Abogados asignados                               |
| `hearing.completed.pending_outcome` | Audiencia cuya hora pasó sin outcome registrado | Abogado titular                                  |
| `deadline.alert`                    | Plazo próximo a vencer (según severidad)        | Abogados asignados                               |
| `deadline.overdue`                  | Plazo vencido sin cumplimiento                  | Abogados asignados + Abogado Administrador       |
| `resolution.issued`                 | Resolución cargada                              | Abogados asignados                               |
| `task.assigned`                     | Tarea asignada                                  | User asignado                                    |
| `task.due`                          | Tarea por vencer                                | User asignado                                    |
| `querella.filed`                    | Querella presentada                             | Abogado Administrador                            |
| `appeal.filed`                      | Recurso presentado                              | Abogado Administrador                            |
| `pjud.update.detected`              | Pull PJUD detectó movimiento (post-MVP, ver §7) | Abogado titular                                  |

### 6.2 Templates

Todos los emails pasan por la cola `notification-dispatch` (ver `NOTIFICATIONS.md`). Templates MJML editables por administrador del sistema. Los nombres de evento son los códigos de catálogo en `notification_templates`.

### 6.3 Configuración por usuario

Cada usuario puede silenciar canales (email/in-app) por evento desde su perfil. Excepción: las alertas críticas (`deadline.alert` 🔴, `hearing.reminder.1h`) NO son silenciables.

---

## 7. Integración PJUD (post-MVP)

> **Estado: TODO — diferido a fase 2.**

PJUD no expone API pública. La estrategia de scraping queda **a decidir cuando arranque la fase**. Notas para esa decisión futura:

- Estado Diario PJUD se publica diariamente por tribunal: `https://oficinajudicialvirtual.pjud.cl/...` (URL real pendiente de mapeo).
- Por causa con RIT activo, worker job toma URL del Estado Diario y parsea HTML.
- Movimientos nuevos se registran en `case_court_updates` con `detected_at`, `summary`, `raw_html_snapshot`.
- Si hay novedad, dispara `pjud.update.detected` al abogado titular.
- Riesgo: PJUD cambia su HTML sin previo aviso. Necesita monitoreo del parser y fallback a "modo manual" si falla.
- **Pendiente conseguir set de RIT reales** del equipo URP para probar el parser sin ir a producción a ciegas.

Tabla preparada (pero NO crear en MVP):

```
case_court_updates (case_id, detected_at, source, summary, raw_html_snapshot, parsed_movement_type)
pjud_pull_jobs (case_id, last_run_at, last_status, error_message)
```

---

## 8. Métricas y dashboards (post-MVP)

Diferido. KPIs candidatos:

- Causas activas por abogado.
- Tiempo promedio por instancia procesal.
- Tasa de éxito (sentencias condenatorias / acuerdos / cierres) por abogado, por zona, por tipo de delito.
- Plazos vencidos sin cumplimiento, por abogado.
- Imputados reincidentes (presentes en >1 causa Arauco).
- Causas estancadas (sin hitos en N meses).

---

## 9. Visibilidad y autorización

### 9.1 Permisos del módulo (catálogo del SURP)

Ya existen en seed `02_permissions.sql` (no crear duplicados):

- `cases.cases.read` (sensible)
- `cases.cases.create`
- `cases.cases.update`
- `cases.cases.assign_lawyer` (sensible)
- `cases.cases.reopen` (sensible)
- `cases.milestones.create`
- `cases.milestones.read` (sensible)

Faltan por agregar al catálogo (en migración futura cuando creemos el SQL):

- `cases.hearings.read`, `cases.hearings.manage`
- `cases.deadlines.read`, `cases.deadlines.waive` (sensible)
- `cases.documents.upload`, `cases.documents.download` (sensible)
- `cases.notes.read_private` (no se asigna a nadie por defecto — solo via `case_attorneys`)
- `cases.templates.manage`
- `cases.tasks.create`, `cases.tasks.assign`

### 9.2 Reglas de visibilidad

- **`security_provider` y `api_consumer`**: NO acceden a NADA del módulo `cases`. Bloqueo en guard de organización antes de cualquier endpoint.
- **Roles internos de Arauco — política "mantener legacy" (decisión cerrada)**:
  - Todos los roles de abogado (`lawyer`, `lawyer_admin`, `field_lawyer`, `external_lawyer`) **ven todas las causas de Arauco sin filtro por zona ni por asignación**. Mantiene el comportamiento actual de `CausasController.Index()` del legacy donde la lógica de filtrar por abogado estaba deshabilitada.
  - Diferencias entre roles:
    - `lawyer` → lectura/escritura de causas; puede crear hitos, audiencias, escritos en **cualquier** causa aunque no esté asignado.
    - `field_lawyer` → mismo acceso de lectura; edición limitada a causas donde esté en `case_attorneys`.
    - `external_lawyer` → igual que `lawyer` (el legacy no distingue).
    - `lawyer_admin` → todo lo anterior + **reasignación** de abogados + **cancelación de plazos con razón** (`cases.deadlines.waive`) + métricas de portafolio.
  - `viewer` → NO ve causas (no tiene `cases.cases.read`).
- **Notas privadas**: visibilidad calculada por `case_attorneys` activos con `assigned_until IS NULL` (ver §2.8). No se amplía por rol: un `lawyer_admin` no asignado a la causa tampoco ve las notas privadas.

### 9.3 Auditoría

- Mutaciones: vía trigger `fn_audit_row_changes` (ya implementado).
- Lecturas sensibles que se registran en `audit_logs`:
  - Descarga de documento (`case_documents.download`).
  - Lectura de nota privada (`case_notes.read_private`).
  - Lectura de hito procesal (`cases.milestones.read`).
  - Lectura de causa con `is_sensitive=true` permission.

---

## 10. Decisiones cerradas (resumen ejecutivo)

| #   | Decisión                                                                                                                                                                                    | Estado      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | 4 materias: penal, civil, contencioso administrativo, constitucional. NO laboral.                                                                                                           | ✅          |
| 2   | Audiencia es **entidad de primera clase** (no variante de hito).                                                                                                                            | ✅          |
| 3   | 10 plazos críticos en MVP, catálogo extensible, días hábiles via `chilean_holidays`.                                                                                                        | ✅          |
| 4   | Notas privadas visibles solo a abogados asignados a la causa. UI advierte. Lecturas auditadas.                                                                                              | ✅          |
| 5   | Tareas: auto-generadas desde plazos + manuales.                                                                                                                                             | ✅          |
| 6   | PJUD scraping → diferido post-MVP. Tabla y flujo pre-diseñados.                                                                                                                             | 🟡 deferido |
| 7   | Detección de conflicto de interés → diferido post-MVP.                                                                                                                                      | 🟡 deferido |
| 8   | `case_attorneys` permite múltiples abogados con histórico (titular único vigente).                                                                                                          | ✅          |
| 9   | `case_parties` permite mismo party con N roles en N causas (corrige gap legacy).                                                                                                            | ✅          |
| 10  | `case_documents` con versionado real (`case_document_versions`).                                                                                                                            | ✅          |
| 11  | `case_resolutions` separadas de hitos para llevar recurribilidad y plazos.                                                                                                                  | ✅          |
| 12  | Causa puede existir sin incidente vinculado.                                                                                                                                                | ✅          |
| 13  | Honorarios FUERA de scope del SURP.                                                                                                                                                         | ✅          |
| 14  | Feriados: API `https://api.feriados.io/v1/CL/holidays/{year}` con job anual.                                                                                                                | ✅          |
| 15  | Causas son **exclusivas** de Arauco (org principal). `security_provider` no las ve.                                                                                                         | ✅          |
| 16  | Correlativo `CAU-{YYYY}-{NNNNN}` **global por año** (no por zona).                                                                                                                          | ✅          |
| 17  | `courts` y `prosecutor_offices`/`prosecutors` con **estrategia híbrida**: seed mínimo (4 regiones Arauco) + entrada on-the-fly + normalización por Abogado Administrador + scrape post-MVP. | ✅          |
| 18  | Visibilidad de causas: **"mantener legacy"** — todos los roles abogado ven todas las causas sin filtro por zona/asignación.                                                                 | ✅          |
| 19  | 4 regiones relevantes para seed de catálogos territoriales: **Maule, Ñuble, Biobío, Araucanía**.                                                                                            | ✅          |

---

## 11. Open questions (workshop URP)

A consultar con el Abogado Administrador / Iván / equipo URP. Las marcadas ✅ ya fueron cerradas en esta conversación; las 🟡 son refinamiento post-esqueleto SQL.

| #   | Pregunta                                                       | Estado                                                                             |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Correlativo interno                                            | ✅ **Cerrada** — `CAU-{YYYY}-{NNNNN}` global por año                               |
| 2   | Causa sin RIT/RUC al crear                                     | 🟡 Asumimos **sí** por defecto; confirmar con URP                                  |
| 3   | Plantillas de escritos iniciales                               | 🟡 Recopilar con Abogado Administrador el set día-1                                |
| 4   | Catálogo de tribunales                                         | ✅ **Cerrada** — híbrido seed + on-the-fly + scrape post-MVP                       |
| 5   | Catálogo de fiscalías                                          | ✅ **Cerrada** — misma estrategia que tribunales                                   |
| 6   | Submaterias civiles/administrativas                            | 🟡 Recopilar con URP casos reales (cobranzas, indemnizaciones, CONAF, protección)  |
| 7   | Visibilidad entre zonas                                        | ✅ **Cerrada** — mantener legacy, todos ven todo                                   |
| 8   | Reasignación masiva de carteras                                | 🟡 Diferir decisión hasta ver uso real; tabla `case_attorneys` ya soporta ambas    |
| 9   | Audiencias virtuales — porcentaje                              | 🟡 Campo `meeting_url` ya previsto; saber % solo ajusta prioridad UX               |
| 10  | Plazos custom URP                                              | 🟡 Catálogo `legal_deadline_catalog` es extensible; agregar cuando URP los precise |
| 11  | 4ª región relevante de Arauco además de Maule/Biobío/Araucanía | ✅ **Cerrada** — Ñuble (se separó de Biobío en 2017)                               |

---

## 12. Cambios futuros (changelog)

| Fecha      | Cambio                                                                                             | Razón                                            |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 2026-04-24 | Documento creado                                                                                   | Discovery completo módulo cases                  |
| 2026-04-24 | Decisiones 16-19 cerradas (correlativo global, catálogos híbridos, visibilidad legacy, 4 regiones) | Respuestas del usuario a open questions críticas |
