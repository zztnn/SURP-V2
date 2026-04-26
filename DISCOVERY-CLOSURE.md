# DISCOVERY-CLOSURE.md — SURP 2.0

> Acta del discovery previo a implementación. Consolida todas las decisiones tomadas con el usuario durante las rondas de preguntas y respuestas.
>
> **Fecha de cierre:** 2026-04-24.
> **Estado:** Discovery cerrado — listo para comenzar implementación.
>
> Este documento es una **instantánea** del acuerdo inicial. La fuente de verdad viva es `STACK.md`, `CLAUDE.md`, los ADRs en `apps/*/.ai-docs/memory/` y los standards en `apps/*/.ai-docs/standards/`.

---

## 1. Infraestructura y bootstrap

| Decisión               | Valor                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Repositorio            | `https://github.com/zztnn/SURP-V2.git` (personal, privado)                                                     |
| Branching              | trunk-based, PRs contra `main`, `release-please` con changelog en español                                      |
| Tenant Azure           | Compartido con SURP 1 (mismo tenant Arauco)                                                                    |
| Resource groups        | Separados por entorno; eventualmente se migrarán recursos del group de SURP 1 al nuevo                         |
| Entornos               | **dev** (local), **staging** (Azure, levantable cuando haya algo que mostrar), **prod** (Azure, post-cut-over) |
| Regla operativa        | **NO deploy a Azure hasta tener estrategia de infraestructura clara.** Todo local primero.                     |
| Dominio                | `surp.cl` ya configurado en Azure; Google Workspaces provisionado                                              |
| Cuentas email emisoras | `noreply@surp.cl`, `alertas@surp.cl`, `reportes@surp.cl`                                                       |
| SPF/DKIM/DMARC         | Pendientes de coordinar con TI Arauco pre-go-live                                                              |
| Google Maps            | Proyecto Cloud existente de IGM — API key reutilizada; Map IDs (light/dark) se crean al implementar frontend   |
| Presupuesto Maps       | Quotas + budget alerts cuando haya tráfico real en staging                                                     |

**Referencias:** `project_infra_and_repo.md`, `STACK.md` §14.

---

## 2. Datos iniciales y catálogos

### 2.1 Organizaciones

| Tipo                | Entidades iniciales                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `principal`         | **Forestal Arauco S.A.** RUT `85805200-9`                                                                                        |
| `security_provider` | **Green America**, **Maxcon**, **Tralkan** (RUTs pendientes de extraer del legacy)                                               |
| `api_consumer`      | Mezcla del legacy — **workshop con URP pendiente** para segmentar por empresa real (ver `project_api_consumers_segmentation.md`) |

### 2.2 Usuarios admin iniciales

- **Superadmin sistema:** **Juan Quiero** — `jquiero@softe.cl` (org: Softe SpA, RUT `77033805-0`).
- **Admin Arauco:** **Iván Vuskovic** — `ivan.Vuskovic@arauco.com` (dominio `arauco.com`).

### 2.3 Autenticación

- **MFA (TOTP) obligatorio** para 100% de usuarios humanos; `api_consumer` usan solo API key.
- **Passwords:** mínimo 12 chars + mayúscula/número/símbolo, rotación 180 días, bloqueo tras 5 intentos, hash **argon2id**.
- **SSO con Entra ID de Arauco:** diseñado para post-MVP, módulo `auth` arranca con Passport strategies conmutables.

### 2.4 Roles `is_system` (12)

Los 11 del legacy + **SecurityProviderAdmin** nuevo:

1. Administrador, 2. AbogadoAdministrador, 3. Abogado, 4. AbogadoTerreno, 5. UnidadPatrimonialAdministrador, 6. UnidadPatrimonial, 7. Incendios, 8. Seguimiento, 9. Visor (read-only puro), 10. Consultas (acceso MAAT sensible), 11. UsuarioApi, **12. SecurityProviderAdmin** (admin de empresa contratista).

### 2.5 Catálogos

| Catálogo                                                   | Fuente                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Tipos de incidente**                                     | Legacy tal cual + extensiones que aporten las skills `/legal-*`                             |
| **Instituciones** (Carabineros, PDI, Fiscalía, Tribunales) | Legacy inicial; oficiales se agregan después, incidentes históricos mantienen los genéricos |
| **Tipos de bienes afectados**                              | Legacy tal cual con valorización (`Avaluo`, `UnidadMedida`); se extiende post-MVP           |
| **Tipos de vehículo**                                      | Legacy (Sedán, Camioneta, Camión, Motocicleta, etc.)                                        |
| **Roles persona↔incidente**                                | Tabla mantenedora nueva: Testigo, Denunciado, Afectado Directo, Reportante                  |
| **Razones de no-incautación** (`NoIncautado` legacy)       | Mantener y extender a bienes/medios                                                         |

### 2.6 Geometrías territoriales

| Capa                               | Fuente                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Regiones + comunas**             | `juanbrujo/chilemapas` (canónica; IGM la tiene cargada). Legacy no aporta geometrías ni INE — se mapean por nombre en ETL. |
| **Provincias**                     | Pendiente descarga de BCN / IDE Chile                                                                                      |
| **Zonas / Áreas / Predios Arauco** | KMZ proporcionados por el cliente (pendiente entrega)                                                                      |

**Referencias:** `project_surp_admins.md`, `project_security_providers.md`, `project_auth_mfa_and_sso.md`, `GEO-PATTERNS.md` §9.

---

## 3. Migración legacy

| Decisión            | Valor                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Timeline            | **Sin fecha target** — MVP se diseña para valor temprano, cut-over se calibra cuando haya algo estable   |
| Volumen legacy      | Pendiente medir vía Azure CLI contra BD SQL Server de producción                                         |
| Estrategia cut-over | **(b) Paralelo lectura** — SURP 2.0 en prod, legacy read-only 30-60 días como fallback                   |
| Validación dry-run  | **Solo Juan (Quiero)** firma el OK de cut-over                                                           |
| Acceso legacy       | Credenciales admin con **compromiso operativo de solo lectura**; firewall por IP, conexión vía Azure CLI |
| Blob legacy         | Mismo tenant Azure — ETL lee con Managed Identity directo                                                |
| Data en MVP         | **(b) Migrada desde día 1** — el ETL es parte del MVP, no se pospone                                     |
| Cobertura del ETL   | **100% de datos del legacy** se migran; no se elimina nada ("mantener todo, solo mejorar")               |

**Referencias:** ADR-B-015, `DATA-MIGRATION.md`, `feedback_keep_all_legacy.md`, `reference_legacy_db.md`.

---

## 4. Integraciones externas

| Integración                                                          | Decisión                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAAT** (maat.cl)                                                   | Servicio comercial de inteligencia crediticia. Hoy: consulta + Excel. Módulo futuro con su propio espacio — mantener comportamiento legacy por ahora.                                                                                       |
| **Instituciones**                                                    | Relación lógica (nombre/tel/email) solamente. Sin APIs oficiales en MVP.                                                                                                                                                                    |
| **API externa de bloqueos**                                          | Mejora sobre legacy: **rate limit** + **consulta batch** (N RUTs/patentes por call). **`/araucaria/incidentes` NO es vulnerabilidad** — es feature que alimenta la inteligencia interna de Arauco; migra con auth + rate limit + auditoría. |
| **SSO Entra ID Arauco**                                              | Post-MVP, módulo auth preparado para integrar.                                                                                                                                                                                              |
| **Otras** (SAP, SIPOL, CONAF, Bomberos, LABOCAR, AFIS, ANPR, drones) | No en MVP. Relaciones con CONAF/Bomberos vía email/oficio (cubierto por `notification-dispatch`).                                                                                                                                           |

**Referencias:** `CLAUDE.md` §integraciones, ADR-B-014 (MAAT), `STORAGE.md`, `NOTIFICATIONS.md`.

---

## 5. Scanner móvil

| Aspecto                   | Decisión                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Devices                   | BYOD + iOS/Android mix, sin MDM                                                                                                    |
| Browser                   | Chrome Android ≥120, Safari iOS ≥16                                                                                                |
| Modalidades               | **3 modos:** `photo_evidence` (offline-first con IndexedDB), `physical_document` (jscanify), `qr_or_plate` (zxing + tesseract OCR) |
| Cédula chilena            | **ELIMINADO** — guardias OS-10 sin atribución; los RUTs se ingresan a mano con validación módulo 11                                |
| Offline-first             | Para foto de evidencia; código correlativo se asigna server-side al sincronizar                                                    |
| Referencia implementación | Scanner de IGM ya funciona en producción — copiar patrón, no reinventar                                                            |

**Referencias:** `MOBILE-SCANNER.md`, ADR-F-014 (revisado 2026-04-24).

---

## 6. Módulo de Incidentes (CORE)

Este es el módulo central — el discovery profundizó 5 rondas (I.1–I.5) + revisión de personas. Resumen:

### 6.1 Actores

- **Nomenclatura:** **"Denunciado"** reemplaza al incorrecto "Imputado" legacy. "Imputado" queda reservado para `cases` cuando el fiscal formaliza (Art. 7 CPP).
- **Roles persona↔incidente:** **tabla mantenedora** editable con code/name/description. Roles iniciales: Testigo, Denunciado, Afectado Directo, Reportante.
- **Personas sin RUT** no se crean como filas; se describen en el **relato textual**. Se promueven a fila solo cuando se identifican.
- **Persona jurídica SÍ puede ser actor directo** si quien arma el informe lo decide. Los vehículos son la otra vía (al verificar Certificado RVM se identifica dueño natural o jurídica; ambos al bloqueo).
- **Víctima:** siempre Arauco; a veces personal de empresas de guardia (agresión). No modelamos terceros.
- **Creación:** guardias, URP, abogados, Admin Arauco, **SecurityProviderAdmin de cualquier empresa** — todos pueden crear y editar `parties` sin restricción a "las de sus guardias".

### 6.2 Tabla única de identidad — `parties`

**Tabla raíz** para todo RUT del sistema (fuente de verdad del bloqueo):

```
parties (raíz)
├── rut (UNIQUE nullable para extranjeros) + foreign_document_*
├── party_type: natural_person | legal_entity
├── display_name
├── is_blocked, blocked_at, blocked_by, block_reason
├── merged_into_party_id (soft-merge de duplicados)
└── audit

natural_persons (1:1)                    legal_entities (1:1)
├── party_id                             ├── party_id
├── nombres, apellidos                   ├── razon_social, giro
├── current_alias, current_banda         └── — (rep. legal en party_relationships)
├── donacion_madera (legacy)
└── observacion

party_contacts (historial multi-contacto): phone / email / address / other
party_relationships (red societaria + familiar): rep_legal, director, socio, hermano, hijo, pareja, etc.
blocks (polimórfica): target_type (party | vehicle), target_id, reason, active
incident_party_links (snapshot por incidente): snapshot_alias, snapshot_banda, snapshot_armado
```

- **RUT inmutable**; si hay error, merge por Administrador.
- **Merge solo por Administrador**, nunca hard-delete.
- **Todo RUT viene de `parties`** — la API externa de bloqueos consulta `blocks` con `parties` y `vehicles` como targets.

**Referencias:** `project_unified_rut_registry.md`.

### 6.3 Estructura y ciclo de vida del informe

**8 secciones** del informe:

1. Cabecera (código, fechas, guardia, org, zona/área/predio, GPS, dirección textual)
2. Clasificación (tipo + subtipo + severidad + estado + semáforo)
3. Relato (texto libre)
4. Personas involucradas (links a `parties` + snapshots)
5. Vehículos involucrados (links a `vehicles`)
6. Bienes afectados (patrimonio Arauco con valorización — categorización de madera)
7. Evidencia adjunta (fotos, videos, audios, docs)
8. Seguimiento operativo (llamadas, pasos del guardia)

**Código correlativo:** `{NN}-{YYYY}-Z{XX}` (ej. `19-2026-ZVA`). Secuencial por zona+año, **sin brechas**, server-side al sincronizar. Ver `INCIDENT-CODE.md` para invariantes completas.

**Máquina de estados:**

```
draft → submitted → under_review → closed (sin escalar)
                                 → escalated → denuncia formal
                  └───────────────→ voided
```

- `draft` = offline en celular.
- `voided` no libera el número; default oculto de listado, admin con filtro lo ve tachado + motivo.
- **Reapertura de `closed`** por Administrador o Abogado.
- **Edición** por guardia/URP/abogado con **versionado + auditoría** + **timeline de cambios en UI** para admins/auditores.
- **Anulación:** solo Administrador, motivo obligatorio (texto libre).
- **Plantillas por tipo** de incidente: **JSONB `type_specific_data`** con schema Zod editable desde admin.

### 6.4 Escalamiento

- Hoy: **1 informe → 1 denuncia**. N:1 queda para futuro.
- **Arauco siempre es querellante**; la llamada del guardia a Carabineros en el momento cuenta como denuncia.
- Datos de denuncia los completa el abogado (flexible).
- **1 denuncia → N causas posibles** (desmembramiento); **RUC se ingresa cuando el abogado lo obtiene**.
- **Reglas de escalamiento → MÓDULO `rules` (Reglas de Sugerencia)** admin-configurable: montos, tipos, reincidencia, pre-prescripción. El sistema **sugiere**, la decisión es humana. Ver `SUGGESTION-RULES.md`.

### 6.5 Evidencia, bienes, vehículos

**Evidencia:** 20 MB foto, 200 MB video, 50 MB audio, 50 MB doc. Sin límite duro de cantidad, alerta > 50 archivos. Audios y videos largos permitidos. **SHA-256 por archivo**, sin hash encadenado. **EXIF preservado** en `surp-evidence`; versión sanitizada para exports. **Borrado de evidencia** solo soft por Administrador.

**Bienes afectados (patrimonio Arauco):** catálogo valorizado + propiedades específicas de madera (`CondicionMadera` Arrumada/Botada/EnPie, `EstadoMadera` Fresca/Húmeda/etc., `AcopioMadera` 0-3/3-6/6+ meses, `Especie`, `Faena`, `Recuperado`). Valorización en opción **(c)**: default en catálogo + override por ingreso.

**Medios incautados (del sospechoso):** listado separado, descripción textual libre (mantenemos legacy).

**Vehículos — entidad first-class:**

- Una sola tabla `vehicles` con `patente` nullable (no separamos identificados / no identificados como legacy).
- **Historial de dueños** con `valid_from`/`valid_to` + `source_document` (Certificado de Inscripción y Anotaciones Vigentes del R.V.M.).
- Estados: `in_service` / `seized_by_authority` / `unknown_whereabouts` / `destroyed`.
- **Patentes extranjeras:** futuro, con flag específico.
- **Sin patente:** se registran con descriptor.

**Cadena de custodia física:** no en MVP (los guardias no son peritos).

### 6.6 Ubicación, tiempo, relaciones

**Ubicación:**

- GPS opcional; **fallback en cascada**: GPS → centroide predio → centroide área → centroide zona.
- **Predio obligatorio** (1:1 con incidente, no N:N como legacy).
- Auto-completar zona/área/predio desde GPS con `ST_Contains`.
- **Dirección textual** poblada vía Google Maps reverse geocoding.
- Campo `location_source` indica origen (`gps` / `predio_centroid` / `area_centroid` / `zone_centroid` / `manual_map`).

**Tiempo:** solo `occurred_at` como fecha de negocio (siempre un punto, no rango). `synced_at` queda en auditoría técnica. Sin plazo máximo de reporte.

**Relaciones entre informes** (duplicado, continuación, mismo operativo): **fase inteligencia**, no MVP.

### 6.7 Semáforo

Enum `{NoDeterminado, Verde, Amarillo, Rojo}`. Lo cambian **abogados o administradores**. Transiciones libres. Significado de cada color queda como pregunta abierta para fase inteligencia (no definir protocolo ahora).

**Referencias:** `INCIDENT-CODE.md`, `SUGGESTION-RULES.md`, `feedback_keep_all_legacy.md`.

---

## 7. Búsquedas y reportes MVP

**Filtros imprescindibles en listado / mapa:**

- Rango de fechas (`occurred_at`)
- Zona / Área / Predio
- Tipo de incidente
- Estado + Semáforo
- Organización creadora
- Persona (RUT) + Patente
- Monto total afectado
- Presencia de denuncia / causa (con RUC/RIT)
- Texto libre sobre el relato
- **Filtro geográfico por polígono dibujado en el mapa**

**Reportes MVP:**

- Total de incidentes por zona / mes
- Top 10 patentes reincidentes
- Top 10 personas reincidentes
- Valor total de bienes afectados por mes / zona
- Mapa de calor por predio
- Estado de causas (vigentes / formalizadas / terminadas)
- Tiempo promedio informe → denuncia → causa

---

## 8. Catálogo de módulos MVP

**Core infra:**

- `auth` (login + MFA TOTP)
- `organizations` (3 tipos + SecurityProviderAdmin)
- `users` (multi-rol)
- `roles` (RBAC dinámico, 12 is_system)
- `permissions` (catálogo de código)
- `audit` (triple fuente: trigger + event + sensitive read → `audit_logs`)

**Identidad y bloqueo:**

- `parties` + `natural_persons` + `legal_entities`
- `party_contacts` (historial)
- `party_relationships` (red societaria + familiar — MVP sí)
- `blocks` (polimórfico party/vehicle)
- `vehicles` + `vehicle_ownerships`

**Dominio core:**

- `catalog` (zones, areas, properties, regions, provinces, communes, incident_types, asset_types, incident_person_roles, no_incautado_reasons)
- `incidents` (cabecera + estados + código correlativo + JSONB por tipo + semáforo)
- `incident_party_links` (snapshot)
- `incident_vehicle_links`
- `incident_assets` (bienes afectados con propiedades de madera)
- `incident_seized_items` (medios incautados)
- `incident_evidence` (archivos)

**Escalamiento:**

- `complaints` (denuncia: institución, unidad policial, fiscalía, seguimiento penal)
- `complaint_guides` (guías de despacho)
- `complaint_destinations` (destinos físicos)
- `cases` (RUC, RIT, fiscal, tribunal, querella, formas de término)
- `case_milestones`
- `case_attorneys`
- `case_resolutions`

**Soporte:**

- `scan_sessions` (móvil sesión+QR+token, 3 modos)
- `storage` (Azure Blob + local)
- `notifications` (Google Workspaces `surp.cl`)
- `geo` (PostGIS + chilemapas + KMZ)

**Post-MVP temprano:**

- `rules` (Reglas de Sugerencia de escalamiento)

**Fase inteligencia (no MVP):**

- `incident_relationships` (duplicados, continuaciones)
- Lógica compleja de `party_relationships`
- `maat` integration completa
- `external_forestal_companies` (EmpresasExternas legacy)
- Protocolo semántico del semáforo
- Análisis de red de `blocks` + vehículos + personas

---

## 9. Reglas y políticas transversales

1. **Use cases como fuente de verdad del dominio** — ADR-B-020, regla #19 CLAUDE.md.
2. **Mantener todo el legacy — solo mejorar, nunca quitar.** No se elimina ningún campo/feature sin acuerdo explícito (`feedback_keep_all_legacy.md`).
3. **Tabla única de RUTs `parties`** como fuente de verdad del bloqueo (`project_unified_rut_registry.md`).
4. **Legacy solo lectura por compromiso operativo**, aunque las credenciales sean admin (`reference_legacy_db.md`).
5. **No deploy a Azure** hasta estrategia clara — todo local primero (`project_infra_and_repo.md`).
6. **Sin co-autoría en commits** — `Co-Authored-By:` prohibido (regla #14 CLAUDE.md).
7. **Skills `/legal-*`** se invocan antes de modelar módulos sensibles; su output se traduce a **invariantes del use case** (no a validaciones de DTO ni a constraints de schema).
8. **Offline-first** para foto de evidencia; código correlativo sin brechas asignado server-side al sincronizar.

---

## 10. Pendientes y workshops futuros

Items que quedaron identificados pero requieren acción/data externa:

| Item                                                          | Bloquea                                      | Responsable        | Cuándo                 |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------ | ---------------------- |
| Extraer RUTs y razones sociales exactas de `Empresa` legacy   | Seed inicial security_providers              | Juan vía Azure CLI | Cuando arranque ETL    |
| Descargar geometrías de **provincias** de BCN/IDE Chile       | Seed completo territorial                    | Juan               | Pre go-live            |
| Entrega de **KMZ** de zonas/áreas/predios por Arauco          | `geo-import` + estructura territorial Arauco | Cliente            | Cuando lleguen         |
| **Workshop segmentación api_consumers**                       | Cut-over del ETL                             | Juan + Iván URP    | Pre cut-over           |
| **Asignación inicial zonas↔security_provider**                | `organization_zone_assignments` seed         | Juan + Iván URP    | Pre go-live            |
| **Confirmación protocolo semáforo** (verde/amarillo/rojo)     | Documentación fase inteligencia              | Iván URP           | Fase inteligencia      |
| **Coordinación SPF/DKIM/DMARC** de `surp.cl`                  | Email productivo                             | TI Arauco          | Pre go-live            |
| **Enterprise App Entra ID Arauco** para SSO                   | Módulo auth SSO                              | TI Arauco          | Post-MVP               |
| **Volumen legacy** (cantidad incidentes/causas/users/GB Blob) | Planning ETL + storage                       | Juan vía Azure CLI | Pre cut-over           |
| **Integración protocolos URP a skills `/legal-*`**            | Invariantes de use cases                     | Juan + Iván URP    | Al modelar cada módulo |

---

## 11. Próximos pasos

1. **Paso 3 completado (2026-04-24) — Validación legal del módulo incidents.** Ver sección 12.

2. **Primer SQL del schema** — sesión separada — empezando por:
   - `00_extensions_and_domains.sql` (postgis, pgcrypto, citext, dominios `d_rut`, `d_email`, `d_phone_cl`).
   - `01_organizations_users_roles.sql` (`parties` raíz + `natural_persons` + `legal_entities` + `organizations` + `users` + `roles` + `permissions` + `user_roles` + `role_permissions` + `blocks`).

3. **Iteración de implementación** por bounded context priorizado según el MVP definido, con ciclo: **skill legal → use case + invariantes → tests → esquema + repositorio → endpoint/processor**.

---

## 12. Validación legal completada — Paso 3 (2026-04-24)

Se consultaron las skills `/legal`, `/legal-procesal`, `/legal-penal`, `/legal-armas-vigilantes` y `/legal-datos` (mediante lectura de los `SKILL.md` en `.claude/skills/`) contra **7 preguntas procesales + 3 penales + 2 de armas y vigilantes + 5 de datos personales**.

**Resultado:** documento canónico **`apps/api/.ai-docs/standards/LEGAL-INVARIANTS-INCIDENTS.md`** (12 secciones) que rige los módulos `incidents`, `complaints`, `cases`, `persons`, `vehicles`, `surveillance`. Decisiones clave:

- **Rol procesal** unificado en un solo campo `procedural_role` (enum de 10 valores) sobre `parties`, eliminando la dualidad `Denunciado`/`Imputado` del legacy sin perder la distinción procesal.
- **Querella contra incertus** (CPP art. 113) modelada con `case_parties.party_id NULL + unidentified_description + identification_pending`.
- **Plazos del motor `rules`** cargados como seed editable desde CP art. 94, CPP arts. 234, 248, 176, 131, 60, CC art. 2332, Ley 20.283 art. 24.
- **Tipificación forestal** con 10 tipos candidatos (hurto de madera Ley 21.013, usurpación Ley 21.633, etc.) + catálogo de 7 agravantes específicas.
- **Eliminación del modo `chilean_id`** del scanner móvil queda fundada en DL 3.607 + Ley 21.719 art. 16.
- **Ley 21.719:** interés legítimo como base principal, LIA obligatorio, datos de procesos penales calificados como sensibles (art. 16), ARCOPOL+ modelado en tabla `data_subject_requests`.
- **Acuerdo reparatorio procede para robo de madera** de baja cuantía y sin reincidencia (`/legal-procesal` explícita).
- **Estados de causa penal** normalizados como máquina de estados + hitos append-only en `case_milestones`.

**Open questions resultantes:** 18 puntos no cubiertos por las skills, consolidados en:

- `apps/api/.ai-docs/standards/LEGAL-INVARIANTS-INCIDENTS.md` §11.
- Memoria `project_legal_open_questions.md` (índice en MEMORY.md).

Ninguno de los 18 bloquea el MVP ni el arranque del schema. Cada uno está ruteado a su skill correspondiente y se resolverá por bloques en workshop con abogado URP coordinado por Iván.
