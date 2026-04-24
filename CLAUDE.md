# CLAUDE.md — Instrucciones para Claude Code

> Este archivo es leído automáticamente por Claude Code en todas las sesiones.
> Garantiza consistencia y evita repetir contexto que ya está documentado.

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
- **Leaflet** o **MapLibre GL** (mapas interactivos para visualización geográfica)
- **Framer Motion** (animaciones)
- **next-themes** (dark mode)
- **Lucide** (icons)
- **Vitest + Testing Library** (tests)

### Backend (`apps/api/`)

- **NestJS 11** (framework)
- **TypeScript 6** (strict)
- **PostgreSQL 16 + PostGIS 3** (BD con extensiones geoespaciales)
- **Drizzle ORM** (query builder tipado; mapea el DDL de `/database/schema/`)
- **BullMQ + ioredis** (colas, generación async de reportes y exportaciones)
- **Passport + JWT** (auth — access 15 min, refresh 30 días)
- **class-validator + class-transformer** (DTOs)
- **@nestjs/swagger** (OpenAPI)
- **Helmet + throttler** (seguridad HTTP)
- **Nodemailer** (alertas por email)
- **Jest + Supertest** (tests)
- **Azure Key Vault** (secretos)
- **Azure Blob Storage** (fotos de incidentes, evidencias, documentos de causas)

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

| Bounded context | Módulos principales | Complejidad |
|-----------------|--------------------|-|
| `incidents`     | incidents, incident-properties, assets | Alta — core del sistema |
| `complaints`    | complaints, institutions | Media |
| `cases`         | cases, milestones, rulings, attorneys | Alta — proceso judicial |
| `persons`       | persons, person-links | Media |
| `vehicles`      | vehicles, vehicle-links | Media |
| `fires`         | fires, fire-documents | Media |
| `maat`          | maat-records, seized-goods | Media |
| `surveillance`  | patrols, vehicle-tracking | Media |
| `statistics`    | reports, dashboards | Alta — múltiples vistas analíticas |
| `catalog`       | zones, areas, properties, regions, communes, incident-types | Baja (CRUD) |
| `users`         | users, profiles, permissions | Media |

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

| Documento | Uso |
|-----------|-----|
| `surp-legacy/` | Fuente de verdad funcional del sistema anterior |
| `apps/api/.ai-docs/README.md` | Índice y orden de lectura del backend |
| `apps/web/.ai-docs/README.md` | Índice y orden de lectura del frontend |
| `apps/api/.ai-docs/standards/POSTGIS-PATTERNS.md` | Patrones de BD con PostGIS — lectura obligatoria |
| `apps/api/.ai-docs/standards/GEO-PATTERNS.md` | Patrones geoespaciales de dominio |
| `apps/api/.ai-docs/standards/AUTHORIZATION.md` | Modelo multi-organización + RBAC dinámico — lectura obligatoria |
| `apps/api/.ai-docs/standards/SECURITY.md` | Seguridad: auth, passwords, API keys, auditoría, prohibiciones heredadas del legacy |
| `apps/api/.ai-docs/standards/DATA-MIGRATION.md` | Mapeo legacy → SURP 2.0 |
| `database/schema/` | DDL fuente de verdad |

## Skills legales — invocación obligatoria

El proyecto cuenta con un asesor legal experto en derecho chileno aplicado a la URP de Forestal Arauco, organizado como una skill principal `/legal` y seis sub-skills especializadas. Todas viven en `.claude/skills/`.

| Sub-skill | Materia |
|-----------|---------|
| `/legal` | Dispatcher principal, formato y disclaimer comunes |
| `/legal-penal` | Tipos penales del catálogo SURP, agravantes, prescripción, concurso |
| `/legal-procesal` | CPP, denuncia, querella, plazos, medidas cautelares, salidas alternativas, CONAF |
| `/legal-tomas` | Ley 21.633 (usurpación 2023) y procedimiento expedito de desalojo |
| `/legal-incendios` | Arts. 474-481 CP + Ley 20.653 + coordinación CONAF/Bomberos/LABOCAR |
| `/legal-datos` | Ley 21.719 protección de datos personales aplicada al diseño del SURP |
| `/legal-armas-vigilantes` | Ley 17.798 + DL 3.607 + OS-10 (régimen de empresas externas de seguridad) |

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

## Reglas específicas del dominio

- **Geo-primero:** todo incidente tiene ubicación geográfica (punto). Los predios y zonas tienen polígono (PostGIS). Visualización en mapa es funcionalidad de primera clase.
- **Perfiles de usuario** del legacy como referencia funcional: Administrador, Abogado, AbogadoAdministrador, AbogadoTerreno, UnidadPatrimonial, UnidadPatrimonialAdministrador, Incendios, Seguimiento, Visor, Consultas, UsuarioApi. En SURP 2.0 los roles son **editables en BD** por el admin del sistema (RBAC dinámico); los permisos son un catálogo fijo definido por el código (`modulo.recurso.accion`). Ver `apps/api/.ai-docs/standards/AUTHORIZATION.md`.
- **Visibilidad por zona asignada:** las empresas de seguridad (`security_provider`) ven y modifican incidentes **solo de zonas actualmente asignadas** a su organización. La reasignación de zona traspasa el histórico completo a la nueva empresa.
- **Causas judiciales son de Arauco:** las empresas de seguridad llegan hasta la denuncia. Nunca ven causas, imputados de causas, ni abogados asignados.
- **Auditoría completa CRUD + lecturas sensibles:** cada entidad registra `created_at`, `created_by_id`, `updated_at`, `updated_by_id`. Toda mutación se registra en `audit_logs` (trigger). Lecturas sensibles (descarga de evidencia, acceso a RUT de imputado, visualización de causas) se registran desde el backend. Los incidentes y causas son append-only en sus eventos/hitos.
- **Evidencia digital:** fotos, videos y documentos se almacenan en Azure Blob Storage. Nunca en la BD.
- **Coordinación con autoridades:** las denuncias vinculan con instituciones (Carabineros, PDI, Fiscalía, Tribunal). Los RUTs de personas son obligatorios cuando están disponibles.
- **API externa de bloqueos:** endpoint restringido (`/blocks/check?rut=X` / `/blocks/check?plate=X`) con API key por `api_consumer`, rate limit, y auditoría por consulta. NUNCA expone listas completas de incidentes (corrigiendo la vulnerabilidad del legacy `/araucaria/incidentes`).

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
