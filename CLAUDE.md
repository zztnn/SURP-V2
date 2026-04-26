# CLAUDE.md — Instrucciones para Claude Code

> Este archivo es leído automáticamente por Claude Code en todas las sesiones.
> Garantiza consistencia y evita repetir contexto que ya está documentado.
>
> **Para detalles del stack tecnológico (versiones, configs TS/ESLint, patrones de bootstrap, scripts), consultar `STACK.md` en esta misma carpeta — es la fuente de verdad canónica.** Este archivo resume; `STACK.md` detalla.

## Regla #0 — NO ASUMIR, PREGUNTAR

> **Esta es la regla maestra del proyecto. Tiene precedencia sobre cualquier
> otra regla, default, recomendación o patrón documentado en este archivo,
> en `STACK.md`, en `.ai-docs/`, o en cualquier otro lugar del repo.**

**NUNCA** asumir nada cuando una petición del usuario no es 100 % clara.
**NUNCA** alucinar prioridades, alcances, módulos siguientes, decisiones
de diseño, valores de configuración, formatos de datos, o el orden en
que se deben hacer las tareas.

Si hay **cualquier** ambigüedad, hueco o decisión implícita en una petición:

1. **DETENERSE** antes de tocar código.
2. **ENUMERAR** las decisiones que faltan, en una lista corta y concreta.
3. **PREGUNTAR** al usuario explícitamente, opción por opción, ofreciendo
   recomendación si hay una clara, pero **sin actuar** hasta tener
   respuesta explícita.
4. **NO** rellenar huecos con "lo más razonable" / "lo que hace el ERP" /
   "lo lógico" sin confirmación.

**Aplica especialmente a:**

- Orden o prioridad de fases / módulos (no asumir cuál sigue).
- Alcance de una sub-fase ("incluye X o solo Y?").
- Defaults de UI / UX cuando no hay design doc.
- Valores de negocio (umbrales, plazos, categorías) que no estén ya
  decididos en seeds, schema o memoria.
- Cualquier elección que el usuario después pueda querer distinta.

Es preferible una pregunta de más a un cambio asumido que después haya
que revertir. La latencia de pedir aclaración siempre es menor que la
latencia de deshacer trabajo en la dirección equivocada.

## Contexto del proyecto

**SURP 2.0** (Sistema de Unidad de Resguardo Patrimonial) para **Forestal Arauco** (parte de Celulosa Arauco y Constitución S.A.). Reemplaza el sistema legacy **SURP** (ASP.NET Core 3.1 + SQL Server, fuente de verdad del dominio en `/surp-legacy`).

- **Cliente:** Arauco — Unidad de Resguardo Patrimonial (URP).
- **Responsable funcional:** Jefe de Resguardo Patrimonial (ej. Iván Vuskovic).
- **Propósito:** Gestión de incidentes de seguridad forestal (robos de madera, intrusiones, tala ilegal, incendios, ocupaciones), causas judiciales, coordinación con Carabineros/PDI, y protección del patrimonio forestal.
- **Sistema previo:** `surp-legacy/` — leer antes de modelar cualquier entidad de dominio. Fuente de verdad **funcional**, no de diseño técnico. El legacy tiene fallas graves de seguridad (autorización solo en menú, credenciales hardcodeadas, clave simétrica fija, controllers sin `[Authorize]`, API con credenciales de usuario en headers, sin auditoría CRUD) que NO se heredan. Ver `apps/api/.ai-docs/memory/KNOWN-PITFALLS.md`.
- **Stack diferenciador respecto al ERP de referencia:** PostgreSQL 16 + **PostGIS** (los datos geográficos son críticos: ubicación de incidentes, polígonos de predios, zonas de patrullaje).
- **Modelo multi-organización (3 tipos):** formaliza la entidad `Empresa` del legacy (actualmente mal implementada):
  - **`principal`** — Arauco (única). Usuarios ven todos los datos según su rol.
  - **`security_provider`** — empresas de seguridad contratistas. Sus usuarios ven y modifican solo incidentes de zonas **actualmente asignadas** a su organización. Si una zona se reasigna, la nueva empresa gana acceso al histórico y la saliente lo pierde. `created_by_organization_id` se conserva solo para auditoría.
  - **`api_consumer`** — empresas forestales externas que consultan bloqueos de RUT/patentes vía API + página web de consulta (rol único `queries.blocks.check`).
- **Requisito transversal:** todos los datos del legacy deben poder migrarse al nuevo sistema. Cada decisión de schema debe tener path de migración pensado. Ver `apps/api/.ai-docs/standards/DATA-MIGRATION.md`.

## Lenguaje del proyecto

- **Código (identificadores, funciones, clases, métodos, variables, tablas, columnas):** inglés.
- **Comentarios en código:** español está bien.
- **Documentación, docs markdown, commit messages (body), PRs:** español.
- **Commit message (subject line):** inglés corto con convención `type(scope): desc`.
- **TODO lo que ve el usuario final va en español latinoamericano** — labels, botones, tooltips, placeholders, mensajes de error/éxito/validación, toasts, notificaciones, reportes. Sin excepciones.

## Localización chilena (no negociable)

El sistema se usa **exclusivamente en Chile**, operado por personal de Arauco.

- **Locale de UI:** `es-CL`.
- **Fechas:** `dd-MM-yyyy`. Almacenar UTC, formatear en presentación.
- **Zona horaria:** `America/Santiago`.
- **Hora:** 24h `HH:mm`.
- **Números:** separador de miles `.`, decimal `,`.
- **RUT chileno:** validación módulo 11 obligatoria en personas, empresas, imputados, testigos. Formato canónico sin puntos con guion (`76543210-K`). Mostrar con puntos (`76.543.210-K`).
- **Coordenadas geográficas:** latitud/longitud en WGS84 (EPSG:4326). Presentar en formato decimal (ej. `-37.4617, -72.3552`).
- **Estructura territorial:** Región → Provincia → Comuna (códigos INE). Arauco usa internamente: Zona → Área → Predio.

## Estructura del monorepo

```
/Users/jean/Projects/SURP/
├── CLAUDE.md                      ← estás aquí
├── package.json                   ← raíz pnpm workspace
├── pnpm-workspace.yaml
├── docker-compose.yml             ← postgres+postgis + redis + azurite + mailhog
├── .claude/memory/                ← memoria persistente de Claude
├── apps/
│   ├── web/                       ← Next.js 16 (frontend)
│   │   ├── CLAUDE.md              ← patrones frontend
│   │   └── .ai-docs/              ← documentación de IA para el frontend
│   └── api/                       ← NestJS 11 (backend)
│       ├── CLAUDE.md              ← patrones backend
│       └── .ai-docs/              ← documentación de IA para el backend
├── database/
│   ├── schema/                    ← DDL PostgreSQL + PostGIS (archivos .sql numerados)
│   └── seed/                      ← seeds (regiones, comunas, tipos de incidente, perfiles, etc.)
├── docs/
│   └── legacy/                    ← análisis del sistema surp-legacy
└── surp-legacy/                   ← sistema anterior (solo lectura, referencia)
```

## Stack tecnológico

### Frontend (`apps/web/`)

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 6** (strict)
- **Tailwind CSS v4** (CSS variables, no config JS)
- **shadcn/ui** (componentes sobre Radix UI)
- **React Hook Form + Zod** (formularios y validación)
- **TanStack Query v5** (data fetching / cache)
- **TanStack Table v8** (tablas)
- **Zustand** (estado global)
- **Sonner** (toasts)
- **date-fns** (fechas, locale es-CL)
- **Google Maps JS API** vía `@vis.gl/react-google-maps` (motor único de mapas — ver ADR-F-007)
- **`@googlemaps/markerclusterer`** (clustering cuando hay densidad alta de marcadores)
- **`jscanify`, `tesseract.js`, `@zxing/browser`** (scanner móvil: documentos físicos, cédula chilena, QR/placas — ver `apps/web/.ai-docs/standards/MOBILE-SCANNER.md`)
- **Framer Motion** (animaciones)
- **next-themes** (dark mode)
- **Lucide** (icons)
- **Vitest + Testing Library** (tests)

### Runtime

- **Node.js 22 LTS** (`engines.node: ">=22.11.0"`, base imagen Docker `node:22-slim`).
- **TypeScript 6.0.3** strict + flags extendidos: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`. Ver `STACK.md` §3.

### Backend (`apps/api/`)

- **NestJS 11** (framework) con bootstrap dual-mode (`WORKER_MODE=true` arranca `WorkerModule` sin HTTP listener). Ver `STACK.md` §5.
- **PostgreSQL 16 + PostGIS 3** (BD con extensiones geoespaciales)
- **Kysely + `kysely-codegen`** (query builder tipado, sin ORM; tipos generados desde `/database/schema/*.sql` que es la fuente de verdad). Ver `STACK.md` §6 y `ADR-B-002`.
- **BullMQ + ioredis** (colas async). Worker separado: misma imagen de contenedor con bootstrap condicional (`WORKER_MODE=true` carga `WorkerModule` sin HTTP listener). Dos Azure Container Apps comparten la imagen (`surp-api`, `surp-worker`). Ver `apps/api/.ai-docs/standards/BACKGROUND-JOBS.md`.
- **Passport + JWT** (auth — access 15 min, refresh 30 días)
- **class-validator + class-transformer** (DTOs)
- **@nestjs/swagger** (OpenAPI)
- **Helmet + throttler** (seguridad HTTP)
- **Nodemailer + Google Workspaces** (SMTP `smtp.gmail.com:587` con OAuth2 + Service Account, domain-wide delegation sobre dominio `surp.cl`; MailHog en dev). Ver `apps/api/.ai-docs/standards/NOTIFICATIONS.md`.
- **Jest + Supertest** (tests)
- **Azure Key Vault** (secretos)
- **Storage dual** — Azure Blob Storage con **Managed Identity** + containers privados + SAS corto en staging/prod; disco local bajo `./storage-data/` en dev. Abstracción `StorageService` conmutable vía `STORAGE_DRIVER=local|azure`. Ver `apps/api/.ai-docs/standards/STORAGE.md`.

### Infraestructura

- **Azure Container Apps** (deploy producción)
- **Azure Database for PostgreSQL Flexible Server** (con extensión PostGIS habilitada)
- **Azure Blob Storage** (evidencias, fotos, documentos)
- **Azure Key Vault** (secretos)
- **Azure Application Insights** (observabilidad)

### Base de datos

- **PostgreSQL 16 + PostGIS 3** — multi-organización (3 tipos), sin RLS de aislamiento; la segregación de datos se hace en la capa de aplicación con guards + filtros de query por zona/predio asignado
- Schema en `/database/schema/` (archivos `.sql` numerados)
- Seed en `/database/seed/`
- Convenciones: `BIGSERIAL` PK + `external_id UUID`, snake_case, soft delete selectivo, tipos geométricos PostGIS
- **Auditoría CRUD + lecturas sensibles** obligatoria vía trigger PostgreSQL + interceptor NestJS (tabla `audit_logs`)

## Módulos de dominio (derivados del legacy)

| Bounded context | Módulos principales                                                                                              | Complejidad                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `incidents`     | incidents, incident-properties, assets                                                                           | Alta — core del sistema                                                          |
| `complaints`    | complaints, institutions                                                                                         | Media                                                                            |
| `cases`         | cases, milestones, rulings, attorneys                                                                            | Alta — proceso judicial                                                          |
| `persons`       | persons, person-links                                                                                            | Media                                                                            |
| `vehicles`      | vehicles, vehicle-links                                                                                          | Media                                                                            |
| `fires`         | fires, fire-documents                                                                                            | Media                                                                            |
| `maat`          | maat-records, seized-goods                                                                                       | Media                                                                            |
| `surveillance`  | patrols, vehicle-tracking                                                                                        | Media                                                                            |
| `statistics`    | reports, dashboards                                                                                              | Alta — múltiples vistas analíticas                                               |
| `catalog`       | zones, areas, properties, regions, communes, incident-types, asset-types, seizure-reasons, incident-person-roles | Baja (CRUD)                                                                      |
| `users`         | users, profiles, permissions                                                                                     | Media                                                                            |
| `rules`         | suggestion-rules, incident-suggestions (motor de sugerencias de escalamiento admin-configurable)                 | Media — post-MVP temprano. Ver `apps/api/.ai-docs/standards/SUGGESTION-RULES.md` |

Referencia funcional completa: `surp-legacy/` (58 controladores, 57 entidades, 281 vistas Razor).

## Comandos principales

```bash
# Setup inicial
pnpm install
cp .env.example .env
pnpm db:up              # inicia postgres+postgis + redis + azurite
pnpm db:schema          # ejecuta DDL en orden
pnpm db:seed            # carga datos iniciales

# Desarrollo
pnpm dev                # todos los apps en paralelo
pnpm dev:web            # solo frontend
pnpm dev:api            # solo backend

# Calidad
pnpm check              # typecheck + lint en todo el monorepo
pnpm typecheck
pnpm lint
pnpm test

# Base de datos
pnpm db:up / pnpm db:down / pnpm db:reset
pnpm db:schema          # re-aplicar DDL
pnpm db:seed            # re-cargar seed
```

## Documentación clave

| Documento                                         | Uso                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **`STACK.md`** (raíz)                             | **Inventario oficial del stack SURP 2.0 — lectura obligatoria antes de introducir cualquier librería nueva**                       |
| `surp-legacy/`                                    | Fuente de verdad funcional del sistema anterior                                                                                    |
| `apps/api/.ai-docs/README.md`                     | Índice y orden de lectura del backend                                                                                              |
| `apps/web/.ai-docs/README.md`                     | Índice y orden de lectura del frontend                                                                                             |
| `apps/api/.ai-docs/standards/POSTGIS-PATTERNS.md` | Patrones de BD con PostGIS — lectura obligatoria                                                                                   |
| `apps/api/.ai-docs/standards/GEO-PATTERNS.md`     | Patrones geoespaciales de dominio + geometrías territoriales (regiones/provincias/comunas) + ingesta de KMZ de zonas/áreas/predios |
| `apps/api/.ai-docs/standards/AUTHORIZATION.md`    | Modelo multi-organización + RBAC dinámico — lectura obligatoria                                                                    |
| `apps/api/.ai-docs/standards/SECURITY.md`         | Seguridad: auth, passwords, API keys, auditoría, prohibiciones heredadas del legacy                                                |
| `apps/api/.ai-docs/standards/DATA-MIGRATION.md`   | Mapeo legacy → SURP 2.0                                                                                                            |
| `apps/api/.ai-docs/standards/BACKGROUND-JOBS.md`  | BullMQ + worker separado, catálogo de colas, cancelación cooperativa                                                               |
| `apps/api/.ai-docs/standards/STORAGE.md`          | Storage dual local/Azure, validación MIME, virus scan, containers SURP, SAS                                                        |
| `apps/api/.ai-docs/standards/NOTIFICATIONS.md`    | Email via Google Workspaces, templates MJML, catálogo de notificaciones                                                            |
| `apps/web/.ai-docs/standards/MAP-PATTERNS.md`     | Google Maps JS API: Advanced Markers, Data Layer, Places, clustering                                                               |
| `apps/web/.ai-docs/standards/MOBILE-SCANNER.md`   | Scanner móvil con sesión+QR: foto evidencia, documento, cédula chilena, QR/placa                                                   |
| `database/schema/`                                | DDL fuente de verdad                                                                                                               |

## Skills legales — invocación obligatoria

El proyecto cuenta con un asesor legal experto en derecho chileno aplicado a la URP de Forestal Arauco, organizado como una skill principal `/legal` y seis sub-skills especializadas. Todas viven en `.claude/skills/`.

| Sub-skill                 | Materia                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `/legal`                  | Dispatcher principal, formato y disclaimer comunes                               |
| `/legal-penal`            | Tipos penales del catálogo SURP, agravantes, prescripción, concurso              |
| `/legal-procesal`         | CPP, denuncia, querella, plazos, medidas cautelares, salidas alternativas, CONAF |
| `/legal-tomas`            | Ley 21.633 (usurpación 2023) y procedimiento expedito de desalojo                |
| `/legal-incendios`        | Arts. 474-481 CP + Ley 20.653 + coordinación CONAF/Bomberos/LABOCAR              |
| `/legal-datos`            | Ley 21.719 protección de datos personales aplicada al diseño del SURP            |
| `/legal-armas-vigilantes` | Ley 17.798 + DL 3.607 + OS-10 (régimen de empresas externas de seguridad)        |

**Reglas de invocación obligatoria** (no opcionales):

1. **Antes de modelar o modificar entidades de dominio** en los módulos `incidents/`, `complaints/`, `cases/`, `persons/`, `vehicles/`, `fires/`, `maat/`, `surveillance/`, invocar `/legal` (o la sub-skill que corresponda) **antes** de escribir el modelo, el DTO o el schema.
2. **Antes de definir validaciones, plazos o flujos de estado** que toquen denuncias, querellas, causas, formalización, prescripción o desalojo, invocar `/legal-procesal` o `/legal-tomas`.
3. **Antes de modelar cualquier campo que contenga datos personales** (RUT, nombres, direcciones, fotografías, geolocalización de personas, datos relativos a procesos penales), invocar `/legal-datos`. Aplica especialmente a `persons`, `users`, evidencia visual y logs de vigilancia.
4. **Antes de tipificar un incidente o calcular pena** dentro del catálogo del módulo `incidents`, invocar `/legal-penal`.
5. **Antes de modelar el módulo `surveillance`** (contratistas externos, guardias, reportes con uso de fuerza, detenciones por flagrancia), invocar `/legal-armas-vigilantes`.
6. **Antes de modelar el módulo `fires`** o el flujo de incidentes asociados a fuego, invocar `/legal-incendios`.

La invocación se hace mediante la skill correspondiente. Si en una conversación ya se invocó la skill y la materia sigue siendo la misma, no es necesario reinvocarla.

**Cuando se trabaje en módulos donde la URP tiene protocolos internos** (umbrales para presentar querella, escalamiento Carabineros vs. PDI vs. Fiscalía, asignación de abogados externos por zona, plantillas internas de denuncia), recordar al usuario integrar esos protocolos a la sub-skill correspondiente. **No inventar protocolos** — si el usuario no los tiene a mano, dejar la sub-skill solo con la base legal pública.

## Reglas no negociables (todo el monorepo)

1. **Identificadores en inglés** — tablas, columnas, funciones, clases, variables. Comentarios y docs en español.
2. **No `any`** — usar `unknown` + type guards o tipos específicos.
3. **No `@ts-ignore` ni `eslint-disable`** — arreglar la causa raíz.
4. **No `console.log`** — usar `Logger` de NestJS en el backend.
5. **No credenciales hardcodeadas** — siempre desde `.env` / Key Vault.
6. **No hardcodear valores de dominio** — tipos de incidente, perfiles, instituciones, etc. viven en BD (mantenedores o seeds configurables).
7. **No conectar a producción** sin autorización explícita.
8. **Lint + typecheck tras cada cambio**; arreglar antes de commitear.
9. **Límite de archivo: 1000 líneas**. Si se pasa, extraer módulos cohesivos.
10. **No modificar `.env`** sin petición explícita.
11. **No hacer `git push`** sin autorización explícita.
12. **Legacy es read-only:** `surp-legacy/` es solo referencia. Nunca modificar.
13. **Coordenadas en WGS84 (EPSG:4326)** siempre. Convertir en presentación si se requiere otro SRS.
14. **Nunca agregar co-autoría en commits.** Prohibido incluir `Co-Authored-By:` (u otros trailers de co-autoría) en el mensaje. El autor es siempre el humano que ejecuta el commit. Aplica a todos los commits, incluidos los que genera Claude Code.
15. **El stack está cerrado por `STACK.md`.** Introducir una librería nueva requiere ADR previo. No cambiar un flag de TS, una regla de ESLint ni una versión mayor sin ADR. Los ADRs viven en `apps/api/.ai-docs/memory/ARCHITECTURE-DECISIONS.md` y `apps/web/.ai-docs/memory/ARCHITECTURE-DECISIONS.md`.
16. **React 19 hooks discipline.** `useEffect` directo en componentes está prohibido por ESLint — usar `useMountEffect`. `useRef` solo en `src/hooks/**` y `src/providers/**`. Ver `STACK.md` §4 y §11.
17. **Archivos ≤ 1000 líneas** (1500 en tests/generated). ESLint lo enforcea. Si se pasa, extraer submódulo.
18. **Coverage mínimo 80%** (branches, functions, lines, statements) en cada app. CI falla si baja.
19. **Use cases como fuente de verdad del dominio (backend).** Toda operación significativa de negocio (registrar incidente, cerrar causa, bloquear RUT, reasignar zona, vincular persona a denuncia, emitir querella, etc.) se implementa como un **use case** en `apps/api/src/modules/{bc}/{entity}/use-cases/{verb}-{entity}.use-case.ts` siguiendo Pattern B (Clean Architecture). La lógica **no** vive en services genéricos, controllers, repositories ni processors — estos son adaptadores. Nombre = verbo de dominio (no `CreateXUseCase` genérico). Test unitario obligatorio con puertos mockeados. Las skills legales (`/legal-*`) se invocan al escribir el use case y su output se traduce en **invariantes del use case**, no en validaciones del DTO ni constraints del schema. Ver `STACK.md` §5.bis y ADR-B-020.

## Reglas específicas del dominio

- **Geo-primero:** todo incidente tiene ubicación geográfica (punto). Los predios y zonas tienen polígono (PostGIS). Visualización en mapa es funcionalidad de primera clase. Si el guardia captura sin GPS, el sistema aplica fallback en cascada: centroide del predio → centroide del área → centroide de la zona (con columna `location_source` que indica el origen).
- **Código correlativo del informe:** formato `{NN}-{YYYY}-Z{XX}` (ej. `19-2026-ZVA`). Secuencial por zona+año, sin brechas, asignado **server-side al sincronizar** (no offline en el celular). Anular un informe no libera el número. Nunca se renumera. Ver `apps/api/.ai-docs/standards/INCIDENT-CODE.md`.
- **Perfiles de usuario** del legacy como referencia funcional: Administrador, Abogado, AbogadoAdministrador, AbogadoTerreno, UnidadPatrimonial, UnidadPatrimonialAdministrador, Incendios, Seguimiento, Visor, Consultas, UsuarioApi. En SURP 2.0 los roles son **editables en BD** por el admin del sistema (RBAC dinámico); los permisos son un catálogo fijo definido por el código (`modulo.recurso.accion`). Ver `apps/api/.ai-docs/standards/AUTHORIZATION.md`.
- **Visibilidad por zona asignada:** las empresas de seguridad (`security_provider`) ven y modifican incidentes **solo de zonas actualmente asignadas** a su organización. La reasignación de zona traspasa el histórico completo a la nueva empresa.
- **Causas judiciales son de Arauco:** las empresas de seguridad llegan hasta la denuncia. Nunca ven causas, imputados de causas, ni abogados asignados.
- **Auditoría completa CRUD + lecturas sensibles:** cada entidad registra `created_at`, `created_by_id`, `updated_at`, `updated_by_id`. Toda mutación se registra en `audit_logs` (trigger). Lecturas sensibles (descarga de evidencia, acceso a RUT de imputado, visualización de causas) se registran desde el backend. Los incidentes y causas son append-only en sus eventos/hitos.
- **Evidencia digital:** fotos, videos y documentos se almacenan en Azure Blob Storage (prod) o disco local (dev) vía abstracción `StorageService`. Nunca en la BD. Containers privados, SAS corto, MIME real validado, virus scan. Descargas auditadas. Ver `STORAGE.md`.
- **Captura en terreno desde celular:** flujo web con sesión efímera + QR + token (sin login del celular). **3 modalidades:** foto de evidencia con GPS (offline-first), documento físico (jscanify), QR/placa. El modo de captura de cédula chilena se descartó — guardias OS-10 no tienen atribución legal para exigir/fotografiar cédulas; los RUTs se ingresan a mano con validación módulo 11. Ver `MOBILE-SCANNER.md`.
- **Mapas en el frontend:** motor único **Google Maps JS API** (`@vis.gl/react-google-maps`), Advanced Markers, clustering para densidad alta, Data Layer para GeoJSON de predios/comunas. Leaflet/MapLibre/OpenLayers prohibidos.
- **Geometrías territoriales:** **regiones y comunas desde `juanbrujo/chilemapas`** (fuente canónica de SURP 2.0; IGM ya las tiene cargadas como referencia). El legacy SURP **no aporta** geometrías ni códigos INE — solo tiene nombres de región/comuna como texto libre que se **mapean por nombre** durante el ETL contra el catálogo nuevo (filas sin match se reportan para revisión manual). **Provincias** desde fuente oficial (BCN / IDE Chile — pendiente descarga). **Zonas / áreas / predios** desde KMZ proporcionados por el cliente. Fuentes en `/database/seed/geo/`. Ver sección 9 de `GEO-PATTERNS.md`.
- **Notificaciones:** todo email pasa por la cola `notification-dispatch` (BullMQ) y se envía con Nodemailer + Google Workspaces SMTP (OAuth2 SA sobre `surp.cl`). Plantillas MJML editables por admin. Prohibido `sendMail` síncrono en código de dominio. Ver `NOTIFICATIONS.md`.
- **Worker de jobs:** procesos pesados (reportes, ETL legacy, media-processing, geo-import) corren en el worker (`WORKER_MODE=true`), no en la API. Todo job persiste estado en Postgres; Redis es infra. Ver `BACKGROUND-JOBS.md`.
- **Coordinación con autoridades:** las denuncias vinculan con instituciones (Carabineros, PDI, Fiscalía, Tribunal). Los RUTs de personas son obligatorios cuando están disponibles.
- **API externa de bloqueos:** endpoints autenticados (`/blocks/check?rut=X` / `/blocks/check?plate=X`, consulta batch) con API key por `api_consumer`, rate limit por consumidor, y auditoría por consulta. La tabla `blocks` es polimórfica (`party` | `vehicle`) y fuente de verdad única consultada por la API. Hoy el legacy expone `/araucaria/incidentes` que **no es un leak de seguridad** — es feature usada por Arauco para alimentar un sistema de inteligencia interno; en SURP 2.0 ese endpoint equivalente sigue existiendo con autenticación + rate limit + auditoría (nunca abierto al público).

## Commit message convention

```
type(scope): descripción corta en inglés (máx 72 chars)

Cuerpo opcional en español explicando el por qué.
```

**Types:** `feat`, `fix`, `refactor`, `style`, `chore`, `docs`, `test`, `perf`, `build`, `ci`
**Scope:** `incidents`, `complaints`, `cases`, `persons`, `vehicles`, `fires`, `maat`, `surveillance`, `statistics`, `catalog`, `users`, `geo`, `db`, `web`, `api`

Ejemplo: `feat(incidents): add geospatial search by predio polygon`

**Sin co-autoría:** el mensaje de commit **no** debe incluir trailers como `Co-Authored-By:`, `Signed-off-by:` con identidades de asistentes IA, ni menciones a Claude / Claude Code. El autor es siempre el humano. Ver regla #14 de "Reglas no negociables".

## Workflow esperado

1. **Leer `CLAUDE.md` del subproyecto relevante** antes de escribir código.
2. **Consultar `surp-legacy/`** antes de modelar cualquier entidad — el legacy es la fuente de verdad del dominio.
3. **Invocar la skill legal correspondiente** (ver sección "Skills legales — invocación obligatoria") antes de modelar entidades de los módulos sensibles, definir validaciones procesales o introducir campos con datos personales.
4. **Analizar primero, presentar enfoque, obtener aprobación** antes de cambios grandes.
5. **Actualizar memoria** cuando aprendes algo importante del usuario o del proyecto.
6. **Tests + lint + typecheck** tras cada cambio significativo.
7. **Commits frecuentes y pequeños**; push solo con autorización.
