# STACK.md — Stack tecnológico oficial SURP 2.0

> **Decisión canónica** tras auditoría de `/Users/jean/Projects/ERP` y
> `/Users/jean/Projects/iwarehouse-2.0`. Este documento es el inventario único
> de qué usamos y por qué. Para cambiar algo, abrir ADR en
> `apps/api/.ai-docs/memory/ARCHITECTURE-DECISIONS.md` o
> `apps/web/.ai-docs/memory/ARCHITECTURE-DECISIONS.md`.
>
> **Fecha:** 2026-04-23.
> **Referencia de auditoría:** ADR-B-019 (backend) / ADR-F-015 (frontend).

---

## Resumen ejecutivo

| Capa                        | Elección                                                                                               | Versión mínima           |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| Monorepo                    | pnpm workspaces (sin Turbo/Nx)                                                                         | `pnpm@10.30.1`           |
| Runtime                     | Node.js LTS                                                                                            | `22.x`                   |
| TypeScript                  | `6.0.3` strict + flags ERP                                                                             | `6.0.3`                  |
| Backend                     | NestJS                                                                                                 | `11.1.19`                |
| ORM / Query Builder         | **Kysely** + `kysely-codegen`                                                                          | `0.27.6` / `0.17.0`      |
| Base de datos               | PostgreSQL + PostGIS                                                                                   | `16` / `3.x`             |
| Cache / colas / state       | Redis                                                                                                  | `7-alpine`               |
| Jobs                        | BullMQ + `@nestjs/bullmq` + ioredis                                                                    | `5.74` / `11.0` / `5.10` |
| Storage                     | `@azure/storage-blob` + Managed Identity; LocalProvider en dev                                         | `12.26`                  |
| Email                       | Azure Communication Services Email (`@azure/communication-email`) con Managed Identity; MailHog en dev | `^1.0.0`                 |
| Templates email             | MJML + Handlebars                                                                                      | —                        |
| Auth                        | Passport + `@nestjs/jwt` + `bcryptjs`                                                                  | `0.7` / `11.x` / `3.0`   |
| Device fingerprint sesiones | `ua-parser-js` + `geoip-lite` (BD local, sin terceros)                                                 | `^2.0` / `^1.4`          |
| Validation backend          | `class-validator` + `class-transformer`                                                                | `0.15` / `0.5`           |
| Validation shared           | Zod v4                                                                                                 | `4.3.6`                  |
| API                         | REST + `@nestjs/swagger`                                                                               | `11.3`                   |
| HTTP security               | Helmet + `@nestjs/throttler` + CORS                                                                    | `8.1` / `6.5`            |
| Observability               | Azure Application Insights + NestJS Logger                                                             | —                        |
| Frontend framework          | Next.js App Router                                                                                     | `16.2.4`                 |
| UI framework                | React                                                                                                  | `19.2.5`                 |
| CSS                         | Tailwind v4 + `@tailwindcss/postcss`                                                                   | `4.2`                    |
| Componentes                 | Radix UI + shadcn/ui (copy-paste)                                                                      | —                        |
| Iconos                      | lucide-react                                                                                           | `1.8`                    |
| Animaciones                 | framer-motion                                                                                          | `12.38`                  |
| Forms                       | React Hook Form + `@hookform/resolvers` (Zod)                                                          | `7.72` / `5.2`           |
| Data fetching               | TanStack Query                                                                                         | `5.99`                   |
| Estado global               | Zustand + persist                                                                                      | `5.0`                    |
| Tablas                      | TanStack Table                                                                                         | `8.20`                   |
| Fechas                      | date-fns + `react-day-picker`                                                                          | `4.1` / `9.14`           |
| Toasts                      | Sonner                                                                                                 | `2.0.7`                  |
| Dark mode                   | next-themes                                                                                            | `0.4`                    |
| Mapas                       | Google Maps + `@vis.gl/react-google-maps` + `@googlemaps/markerclusterer`                              | —                        |
| Scanner móvil               | `jscanify` + `tesseract.js` + `@zxing/browser`                                                         | —                        |
| Testing backend             | Jest + Supertest                                                                                       | `30.3` / `7.0`           |
| Testing frontend            | Vitest + Testing Library + jsdom                                                                       | `4.1`                    |
| E2E                         | Playwright                                                                                             | —                        |
| Lint                        | ESLint flat config + typescript-eslint                                                                 | `10+`                    |
| Format                      | Prettier                                                                                               | `3.8`                    |
| Pre-commit                  | Husky + lint-staged                                                                                    | `9.1` / `16.4`           |
| Build backend               | `nest build` (tsc/swc)                                                                                 | —                        |
| Build frontend              | Next.js (Turbopack dev, SWC prod)                                                                      | —                        |
| Deploy                      | Azure Container Apps + PostgreSQL Flexible Server (Brazil South)                                       | —                        |
| CI                          | GitHub Actions con change detection                                                                    | —                        |
| Secretos                    | Azure Key Vault (prod) + GitHub env secrets (CI)                                                       | —                        |

---

## 1. Monorepo y package management

**pnpm workspaces, sin Turbo/Nx.**

```
/Users/jean/Projects/SURP/
├── package.json           ← raíz del workspace
├── pnpm-workspace.yaml
├── apps/
│   ├── api/               ← NestJS
│   └── web/               ← Next.js
├── database/
│   ├── schema/            ← *.sql numerados — fuente de verdad
│   └── seed/
└── docker-compose.yml
```

Scripts raíz usan `pnpm --filter` para paralelizar:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter './apps/*' dev",
    "dev:api": "pnpm --filter @surp/api dev",
    "dev:web": "pnpm --filter @surp/web dev",
    "build": "pnpm --filter './apps/*' build",
    "check": "pnpm typecheck && pnpm lint",
    "typecheck": "pnpm --filter './apps/*' typecheck",
    "lint": "pnpm --filter './apps/*' lint",
    "test": "pnpm --filter './apps/*' test"
  }
}
```

Agregar Turbo solo si el monorepo supera 5+ apps con build times >30s. Por ahora no aplica.

---

## 2. Runtime: Node 22 LTS

- `engines.node` en cada `package.json`: `">=22.11.0"`.
- `.nvmrc` en la raíz: `22`.
- Dockerfiles base: `node:22-slim`.
- Final image backend: `node:22-slim` con solo `dist/` + `node_modules` producción.

---

## 3. TypeScript

**Versión:** `6.0.3`. **`strict: true`** más los siguientes flags (todos activos):

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
  },
}
```

**No negociables:**

- `any` prohibido — usar `unknown` + type guards.
- `@ts-ignore` / `@ts-expect-error` prohibidos salvo con comentario explícito citando issue upstream.
- `skipLibCheck: true` solo para node_modules; nuestro código cumple todo.

---

## 4. Lint, format y pre-commit (reglas mergeadas ERP + iwarehouse)

### ESLint — flat config (v10)

Reglas adoptadas de **iwarehouse-2.0** (todas las custom que aporta):

| Regla                                                                              | Uso                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `no-console: ['error', { allow: ['warn', 'error'] }]`                              | Solo `warn/error`. En backend, preferir NestJS Logger.                               |
| `eqeqeq: 'error'`                                                                  | Siempre `===` / `!==`.                                                               |
| `no-eval: 'error'`                                                                 | Sin `eval` ni `new Function`.                                                        |
| `typescript-eslint/recommendedTypeChecked` + `strictTypeChecked`                   | Lint con tipos.                                                                      |
| Frontend: `security` plugin (`detect-unsafe-regex`, `detect-eval-with-expression`) | Defensivo.                                                                           |
| Frontend: `react/no-danger`                                                        | Sin `dangerouslySetInnerHTML`.                                                       |
| Frontend: `no-restricted-syntax` prohíbe `useEffect` directo en componentes        | Obliga usar `useMountEffect` de la capa de hooks — evita stale closures en React 19. |
| Frontend: refs solo en `src/hooks/**` y `src/providers/**`                         | Disciplina de separación.                                                            |

Regla adoptada de **ERP**:

| Regla                                               | Uso                                             |
| --------------------------------------------------- | ----------------------------------------------- |
| `max-lines: ['error', 1000]` (test/generated: 1500) | Límite de archivo — si se pasa, extraer módulo. |

**Configuración consolidada** (ver cada `apps/*/eslint.config.mjs` para el detalle). Todas las reglas anteriores son **error**, no warning.

### Prettier

- Raíz `.prettierrc`: `{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }`.
- Consistente frontend/backend (ERP y iwarehouse divergían — unificamos).

### Pre-commit

Husky + lint-staged en la raíz:

```jsonc
{
  "lint-staged": {
    "*.ts": ["eslint --max-warnings 0 --fix", "prettier --write"],
    "*.tsx": ["eslint --max-warnings 0 --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"],
  },
}
```

El hook `pre-push` corre `pnpm typecheck` completo.

---

## 5. Backend — NestJS 11

### Estructura

```
apps/api/src/
├── main.ts                ← bootstrap dual-mode (api / worker)
├── app.module.ts          ← monta HTTP + dominio
├── worker.module.ts       ← solo módulos con @Processor
├── common/                ← capa transversal
│   ├── context/           ← RequestContextService (AsyncLocalStorage)
│   ├── audit/             ← AuditService + trigger GUCs
│   ├── decorators/        ← @RequirePermission, @AuditSensitiveRead
│   ├── guards/            ← JwtAuthGuard, PermissionGuard, OrganizationScopeGuard
│   ├── interceptors/      ← AuditInterceptor, LoggingInterceptor
│   ├── errors/            ← PostgresErrorFilter, mappings a HTTP
│   ├── dto/               ← contratos compartidos
│   └── validation/        ← validation-pipe.factory.ts
├── database/
│   ├── kysely.config.ts
│   ├── database.module.ts ← provider global
│   ├── generated/         ← kysely-codegen output (types)
│   └── geo.ts             ← helpers ST_*
├── modules/               ← bounded contexts
│   ├── auth/
│   ├── users/
│   ├── roles/
│   ├── organizations/
│   ├── incidents/
│   ├── complaints/
│   ├── cases/
│   ├── persons/
│   ├── vehicles/
│   ├── fires/
│   ├── maat/
│   ├── surveillance/
│   ├── statistics/
│   └── catalog/
├── notifications/         ← cola + templates
├── storage/               ← providers + abstracción
└── scripts/               ← seeds, migraciones CLI
```

### Bootstrap dual-mode (de iwarehouse)

`main.ts` detecta `WORKER_MODE`:

```typescript
async function bootstrap() {
  if (process.env.WORKER_MODE === 'true') {
    const app = await NestFactory.createApplicationContext(WorkerModule);
    await app.init();
    Logger.log('Worker arrancado — sin HTTP listener', 'Bootstrap');
    return;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: configService.get('CORS_ORIGIN', '').split(','), credentials: true });
  app.useGlobalPipes(buildValidationPipe());
  app.useGlobalFilters(new PostgresErrorFilter());
  app.useGlobalInterceptors(new AuditInterceptor(...));

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('/api/docs', app, buildSwaggerDocument(app));
  }

  await app.listen(port);
}

// Watchdog timeout — de iwarehouse
const bootWatchdog = setTimeout(() => {
  Logger.error('Bootstrap superó 60s — abortando');
  process.exit(1);
}, 60_000);

bootstrap().catch((err) => { earlyFatalHandler(err); process.exit(1); })
           .finally(() => clearTimeout(bootWatchdog));
```

### `ConfigModule` fail-closed (de iwarehouse)

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, dbConfig, azureConfig, mailConfig, bullConfig],
      validate: validateEnv, // throws si faltan JWT_SECRET, DATABASE_URL, etc. en prod
      envFilePath: ['.env.local', '.env'],
    }),
  ],
})
export class AppModule {}
```

`registerAs` por módulo + `validateEnv` usa Zod para verificar el ambiente. Falla al arranque si algo falta en prod.

### Patrones transversales (de ERP)

- **`RequestContextService` con `AsyncLocalStorage`**: `AuditInterceptor` setea `userId`, `sessionId`, `requestId`, `organizationId` al inicio de cada request. Todo código downstream (services, repositories) lee del contexto sin pasar parámetros.
- **`ValidationPipe` factory**: `flattenValidationErrors` → `{ error, code, message, errors: [{ field, messages[] }] }` en español.
- **`PostgresErrorFilter`**: convierte errores de Postgres (unique violation, FK violation, check violation) a HTTP 4xx con mensaje útil.

---

## 5.bis Arquitectura de dominio: use cases como fuente de verdad

**Decisión fundacional — ADR-B-020.** La lógica de negocio del SURP 2.0 vive en **casos de uso** (use cases), no en services genéricos, controllers ni repositories. Los use cases son el **contrato funcional** del sistema: leer sus nombres y firmas describe qué hace el sistema.

### Regla

Toda operación significativa del dominio se modela como una clase inyectable con un único método público `execute(input, ctx)`:

```
apps/api/src/modules/{bc}/{entity}/use-cases/{verb}-{entity}.use-case.ts
```

- **Pattern B (Clean Arch) por defecto** en módulos con lógica real: `incidents`, `complaints`, `cases`, `persons`, `vehicles`, `fires`, `maat`, `surveillance`.
- **Pattern A (CRUD fino)** solo para mantenedores sin invariantes: `catalog/*` trivial, etc. Ver `apps/api/.ai-docs/skills/CHOOSE-MODULE-PATTERN.md`.
- **Nombre = verbo de dominio**, no CRUD: `RegisterIncidentUseCase`, `CloseCaseWithRulingUseCase`, `BlockRutUseCase`, `ReassignZoneUseCase`. Evitar `CreateXUseCase` genérico.

### Orden canónico dentro de `execute`

1. Validaciones adicionales al DTO (permisos ya los chequeó `PermissionGuard`).
2. Cargar aggregates vía **puertos** (`ports/*.repository.port.ts`), no Kysely directo.
3. **Invariantes de dominio** — la lógica real. Este es el único lugar donde pueden vivir.
4. Mutación y persistencia.
5. Eventos: `AuditService.logEvent(...)` + encolar notificaciones/jobs.
6. Construir y retornar **DTO tipado** (nunca row de BD).

### Qué implica

- **Controllers delgados.** Parsean DTO, invocan el use case, retornan el resultado. Un endpoint por verbo de dominio (`POST /cases/:id/close`, no `PATCH /cases/:id` genérico).
- **Processors BullMQ invocan use cases** — la lógica nunca vive en el processor, solo en el use case que el processor llama.
- **Test unitario obligatorio** (`{verb}-{entity}.use-case.spec.ts`) con puertos mockeados. Cada invariante se cubre allí.
- **Catálogo por bounded context:** `apps/api/src/modules/{bc}/USE-CASES.md` lista los casos del contexto con una línea descriptiva + invariantes. Referencia para negocio.
- **Migración legacy mapea al use case**, no a la tabla. ADR-B-015 + este ADR son simétricos: cada script ETL referencia el use case SURP 2.0 que reemplaza.
- **Skills legales convergen aquí.** El output de `/legal-*` se traduce en invariantes del use case — no en validaciones del DTO, no en constraints del schema.

### Qué NO es

- No es "Clean Architecture académica" con ports/adapters dogmáticos en módulos triviales.
- No es reemplazar el `Service` de NestJS por una convención de naming — es un lugar explícito para la lógica, aislado de la infra.
- No es opcional para módulos B — si un PR introduce lógica de negocio en un service, controller o repository sin extraer el use case, no se merge.

**Ver:** ADR-B-020 en `apps/api/.ai-docs/memory/ARCHITECTURE-DECISIONS.md`, `skills/CHOOSE-MODULE-PATTERN.md`, `standards/MODULE-ANATOMY.md`.

---

## 6. ORM: Kysely + kysely-codegen

**Kysely 0.27.6** como query builder tipado. **Sin ORM tradicional** (ni Drizzle, ni Prisma, ni TypeORM).

### Workflow schema-first

```
/database/schema/*.sql     (fuente de verdad — manual)
          │
          │  pnpm db:schema
          ▼
  PostgreSQL 16 + PostGIS
          │
          │  pnpm db:codegen  →  kysely-codegen
          ▼
  apps/api/src/database/generated/kysely-types.ts
          │
          ▼
  QueryBuilder tipado en todos los repositorios
```

### Config

```typescript
// apps/api/src/database/kysely.config.ts
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './generated/kysely-types';

export const buildKyselyClient = (databaseUrl: string): Kysely<DB> => {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        max: 50,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
    }),
    // No plugins de camelCase — usamos snake_case end-to-end para que
    // SQL a mano y código TS hablen el mismo idioma.
  });
};

export type KyselyDb = Kysely<DB>;
```

### PostGIS con Kysely

Queries geoespaciales con la plantilla `sql` — sin customType especial, solo SQL:

```typescript
import { sql } from 'kysely';

// Punto dentro de polígono
const result = await db
  .selectFrom('properties')
  .select(['external_id', 'name'])
  .where(sql`ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`)
  .executeTakeFirst();

// Insert con geometría
await db
  .insertInto('incidents')
  .values({
    external_id: sql`gen_random_uuid()`,
    occurred_at: occurredAt,
    location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
    // ...
  })
  .execute();
```

Los tipos geométricos se declaran en los `.sql` (`GEOMETRY(POINT, 4326)`); `kysely-codegen` los expone como `unknown` por default. En los tipos generados, override a `{ type: 'Point'; coordinates: [number, number] } | string` con un custom plugin si se usa lectura directa. Para escritura siempre vía `sql` template.

### Transacciones

```typescript
await db.transaction().execute(async (tx) => {
  await tx.insertInto('incidents').values(...).execute();
  await tx.insertInto('incident_events').values(...).execute();
});
```

### Por qué Kysely y no Drizzle

|                       | Kysely                                            | Drizzle                      |
| --------------------- | ------------------------------------------------- | ---------------------------- |
| Paradigma             | Query builder **sin ORM**                         | Mini-ORM con schema TS       |
| Schema                | SQL manual → tipos generados                      | TS → opcionalmente SQL       |
| PostGIS               | Template `sql` nativa                             | `customType` + parsing WKB   |
| Alineamiento con SURP | SQL numerado es fuente de verdad → match perfecto | Duplicación schema TS vs SQL |
| Adopción en ERP       | Validado en producción                            | No                           |
| Ceremonia             | Baja                                              | Media                        |

Ver **ADR-B-002** para el razonamiento completo.

---

## 7. Base de datos: PostgreSQL 16 + PostGIS 3

Ver `apps/api/.ai-docs/standards/POSTGIS-PATTERNS.md` y `GEO-PATTERNS.md`.

- Schema en `/database/schema/*.sql` numerado.
- Convenciones: `BIGSERIAL` PK + `external_id UUID`, `snake_case`, `TIMESTAMPTZ`, soft delete selectivo, tipos geométricos PostGIS con SRID 4326.
- Triggers de auditoría en `/database/schema/98_audit_triggers.sql`.
- **Sin RLS de PostgreSQL** — la segregación multi-organización se aplica en la capa de aplicación (ver ADR-B-003). El patrón RLS de ERP se analizó pero se descartó para SURP porque las reglas de visibilidad son temporales (zona reasignada) y dependen del tipo de organización + rol.
- GUCs `app.current_user_id`, `app.current_org_id`, `app.session_id`, `app.request_id`, `app.current_ip` seteadas por `AuditInterceptor` al inicio de cada request — consumidas por el trigger de auditoría (ADR-B-009).

### Docker Compose

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4-alpine
    volumes: ['postgres-data:/var/lib/postgresql/data']
    ports: ['5432:5432']
    environment:
      POSTGRES_USER: surp
      POSTGRES_PASSWORD: surp
      POSTGRES_DB: surp_dev

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes: ['redis-data:/data']
    ports: ['6379:6379']

  mailhog:
    image: mailhog/mailhog:latest
    ports: ['1025:1025', '8025:8025']

  azurite:
    image: mcr.microsoft.com/azure-storage/azurite:latest
    ports: ['10000:10000', '10001:10001', '10002:10002']
    volumes: ['azurite-data:/data']
```

---

## 8. BullMQ + worker

Ver `apps/api/.ai-docs/standards/BACKGROUND-JOBS.md`.

- Misma imagen docker, flag `WORKER_MODE=true` arranca `WorkerModule` (sin HTTP listener).
- Dos Azure Container Apps: `surp-api` (HTTP) y `surp-worker` (sin ingress).
- Colas iniciales: `report-generation`, `export-excel`, `export-pdf`, `notification-dispatch`, `media-processing`, `legacy-etl`, `geo-import`, `scheduled-digest`.
- Dashboard `bull-board` en `/admin/queues` con `PermissionGuard('system.queues.view')`.

---

## 9. Storage dual

Ver `apps/api/.ai-docs/standards/STORAGE.md`.

- `StorageService` con dos providers: `LocalStorageProvider` (dev) y `AzureBlobStorageProvider` (staging/prod, Managed Identity).
- Containers privados, SAS 15 min, paths estructurados, MIME real, virus scan.

---

## 10. Notificaciones

Ver `apps/api/.ai-docs/standards/NOTIFICATIONS.md`.

- Azure Communication Services Email con Managed Identity (sin secrets en código). Dominio personalizado `surp.cl` verificado en ACS o, fase MVP, dominio Azure-managed.
- Cola `notification-dispatch` (BullMQ). MJML + Handlebars para templates editables por admin. MailHog en dev (driver `local`).
- Tracking de delivery vía Event Grid (`EmailDeliveryReportReceived`).

---

## 11. Frontend — Next.js 16 App Router

### Estructura

```
apps/web/
├── next.config.ts         ← typedRoutes: true
├── src/
│   ├── app/
│   │   ├── (auth)/        ← login, reset password
│   │   ├── (protected)/   ← dashboard + módulos autenticados
│   │   └── scan/[sessionId]/ ← scanner móvil (público con token)
│   ├── components/
│   │   ├── ui/            ← shadcn/ui (copy-paste)
│   │   ├── data-table/
│   │   ├── maps/          ← Google Maps wrappers
│   │   ├── scanner/
│   │   └── forms/
│   ├── hooks/             ← únicos lugares que pueden tener useEffect directo
│   ├── providers/         ← MapsProvider, QueryProvider, ThemeProvider, Toaster
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── query-keys.ts
│   │   ├── validators/    ← schemas Zod
│   │   ├── chilean/       ← rut.ts, id-card-parser.ts
│   │   └── scanner/
│   ├── stores/            ← Zustand (uno por dominio)
│   └── config/            ← themes, locale
```

### Hooks discipline (de iwarehouse)

- `useEffect` directo en componentes **prohibido** por ESLint. Usar `useMountEffect` (hook propio) que compone `useEffect` con `useEffectEvent` de React 19.
- Refs solo en `src/hooks/**` y `src/providers/**`.
- Client/server component clearly marked con `'use client'` donde aplica.

### Theming

- Tailwind v4 con CSS variables.
- Dark mode via `next-themes`.
- Zustand `theme-store` persiste la preferencia.

### Forms

- RHF + `zodResolver` siempre.
- Schema Zod en `src/lib/validators/{entity}.ts`.
- Draft persistence en localStorage (patrón `form-draft-snapshot.ts` de iwarehouse) para formularios largos (denuncias, causas).
- `<FormField>` wrapper envuelve `Controller` + `<Label>` + error.
- `<FloatingActionBar>` para guardar/cancelar (ADR-F-008).

### Data fetching

- TanStack Query v5 con `staleTime: 30_000` default.
- Query keys centralizadas en `src/lib/query-keys.ts`.
- `fetch` crudo en componentes prohibido (ADR-F-003).
- `apiClient.get/post/put/delete` en `src/lib/api-client.ts` — única puerta de salida HTTP.

### Mapas

- Google Maps JS API vía `@vis.gl/react-google-maps` con `APIProvider` en layout protegido. Ver `apps/web/.ai-docs/standards/MAP-PATTERNS.md`.

### Scanner móvil

- `jscanify` + `tesseract.js` + `@zxing/browser` por modalidad. Ver `apps/web/.ai-docs/standards/MOBILE-SCANNER.md`.

---

## 12. Testing

### Coverage threshold: 80% en ambos apps (de ERP)

```javascript
// apps/api/jest.config.ts
coverageThreshold: {
  global: { branches: 80, functions: 80, lines: 80, statements: 80 },
}

// apps/web/vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
}
```

### Backend

- Jest 30 + Supertest 7.
- Unit tests `*.spec.ts` junto al código.
- E2E `test/*.e2e-spec.ts` con Postgres + Redis reales (Testcontainers o docker-compose).
- Mocking mínimo: preferir integration tests contra DB real.
- Tests de processors BullMQ: instanciar processor directo con DB mocked, sin Redis.

### Frontend

- Vitest 4 + Testing Library + jsdom.
- E2E con Playwright.
- Snapshot tests **solo** para componentes estables de UI kit.
- Tests de formularios: interacción real (type, click, submit) + assertion del payload.

---

## 13. CI/CD — GitHub Actions

Patrón de **change detection** (de iwarehouse):

```yaml
# .github/workflows/ci.yml
jobs:
  detect-changes:
    outputs:
      api: ${{ steps.filter.outputs.api }}
      web: ${{ steps.filter.outputs.web }}
      database: ${{ steps.filter.outputs.database }}
    steps:
      - uses: dorny/paths-filter@v3
        with:
          filters: |
            api: ['apps/api/**', 'database/**']
            web: ['apps/web/**']
            database: ['database/**']

  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - ... pnpm typecheck + pnpm lint

  test-api:
    needs: [detect-changes, lint-typecheck]
    if: needs.detect-changes.outputs.api == 'true'
    services:
      postgres: postgis/postgis:16-3.4-alpine
      redis: redis:7-alpine
    steps: [...]

  test-web:
    needs: [detect-changes, lint-typecheck]
    if: needs.detect-changes.outputs.web == 'true'
    steps: [...]
```

Deploy triggers:

- `deploy-api.yml` en push a `main` si `api==true`.
- `deploy-web.yml` en push a `main` si `web==true`.
- `release-please` para changelogs + versiones.

### Build info injection (de iwarehouse)

Script pre-build genera `build-info.generated.ts` con:

- `APP_VERSION` (de `package.json`).
- `GIT_SHA` (de `git rev-parse HEAD`).
- `BUILD_TIME` (ISO now).
- `BUILD_ENV` (de CI env var).

Expuesto en endpoint `/health` para debug de soporte.

---

## 14. Deploy — Azure

- **Container Apps** para `surp-api` y `surp-worker` (misma imagen, distinto comando).
- **Azure Database for PostgreSQL Flexible Server** región **Brazil South** (más cerca de Chile), réplica read-only East US.
- **Azure Cache for Redis** para colas + cache de permisos.
- **Azure Blob Storage** con Managed Identity.
- **Azure Key Vault** para secretos.
- **Azure Application Insights** para APM.

---

## 15. Seguridad base

- Helmet con CSP estricta.
- CORS restrictivo (`CORS_ORIGIN` env).
- `@nestjs/throttler` global 120 req/min; endpoints públicos (`/scan-sessions/*/files`, `/blocks/check`) con rate limit custom más estricto.
- JWT fail-closed (si `JWT_SECRET` falta en prod, la app no arranca).
- Error masking OWASP A07 en auth (siempre "Credenciales inválidas").
- `bcryptjs` para passwords en runtime; **argon2id** para seed/migración del legacy (más robusto).
- Ver `apps/api/.ai-docs/standards/SECURITY.md`.

---

## 16. Variables de entorno críticas

```bash
# Runtime
NODE_ENV=development|staging|production
PORT=4000
WORKER_MODE=false              # true en el contenedor del worker

# Database
DATABASE_URL=postgres://surp:surp@localhost:5432/surp_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT (fail-closed en prod)
JWT_SECRET=...                 # required en prod; >=64 chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Storage
STORAGE_DRIVER=local|azure
LOCAL_STORAGE_ROOT=./storage-data
LOCAL_STORAGE_SIGNING_KEY=...
AZURE_STORAGE_ACCOUNT_URL=https://surpstorage.blob.core.windows.net  # Managed Identity, sin account key

# Mail
MAIL_DRIVER=local|azure_acs
# driver=local (dev): MailHog
SMTP_HOST=localhost
SMTP_PORT=1025
# driver=azure_acs (staging/prod): Azure Communication Services
ACS_ENDPOINT=https://surp-comm.communication.azure.com
ACS_SENDER_ADDRESS=DoNotReply@surp.cl       # debe estar verificado en ACS
ACS_SENDER_DISPLAY_NAME="SURP — Arauco URP"
# Auth: Managed Identity en Azure; en local del dev opcional connection string desde Key Vault para tests E2E
ACS_CONNECTION_STRING=                       # vacío en prod (usa MI), opcional en local

# Google Maps (frontend)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
NEXT_PUBLIC_GMAP_ID_LIGHT=...
NEXT_PUBLIC_GMAP_ID_DARK=...

# Observability
APPLICATIONINSIGHTS_CONNECTION_STRING=...
LOG_LEVEL=info
```

`.env.example` comiteable; `.env.local` nunca.

---

## 17. Scripts canónicos de pnpm

```bash
# Setup
pnpm install
cp .env.example .env
pnpm db:up                 # docker-compose up postgres redis mailhog azurite
pnpm db:schema             # aplica /database/schema/*.sql en orden
pnpm db:seed               # aplica /database/seed/*
pnpm db:codegen            # regenera apps/api/src/database/generated/ con kysely-codegen

# Dev
pnpm dev                   # todos los apps
pnpm dev:api
pnpm dev:web
pnpm dev:worker            # WORKER_MODE=true en la API

# Calidad
pnpm check                 # typecheck + lint en todo el monorepo
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e

# DB
pnpm db:reset              # drop + schema + seed
pnpm db:migrate:legacy     # ETL one-shot desde SURP legacy (ADR-B-015)

# Build
pnpm build
pnpm docker:build
```

---

## 18. Qué NO hacemos (y por qué)

- **No Turbo / Nx** — overhead no justificado para 2 apps.
- **No Drizzle / Prisma / TypeORM** — ver ADR-B-002.
- **No Leaflet / MapLibre / OpenLayers** — Google Maps único (ADR-F-007).
- **No GraphQL / tRPC** — REST + Swagger. Dominio operativo estable, no necesitamos client-driven queries.
- **No multi-region** en Fase 1 — Brazil South primario, East US read replica.
- **No feature flags dinámicos** (LaunchDarkly, Unleash) en Fase 1 — features on/off con env vars bastan.
- **No Redis Sentinel / Cluster** en Fase 1 — Azure Cache managed.
- **No Kafka / RabbitMQ** — BullMQ cubre los casos de uso.
- **No Sentry / Datadog** — Application Insights cubre APM + error tracking.
- **No Storybook** inicialmente — shadcn/ui ya tiene docs upstream; costo de mantenerlo > valor en fase inicial.
- **No Docker Swarm / Kubernetes** — Container Apps abstrae eso.

Si alguna de estas aparece como necesidad real, abrir ADR para revisar.

---

## Cambios históricos

| Fecha      | Cambio                                                          | ADR                   |
| ---------- | --------------------------------------------------------------- | --------------------- |
| 2026-04-23 | Stack inicial consolidado tras auditoría ERP + iwarehouse       | ADR-B-019 / ADR-F-015 |
| 2026-04-23 | ORM revisado: Drizzle → Kysely                                  | ADR-B-002 (revisado)  |
| 2026-04-23 | Motor de mapas revisado: Leaflet → Google Maps                  | ADR-F-007 (revisado)  |
| 2026-04-24 | Use cases como fuente de verdad del dominio (regla fundacional) | ADR-B-020             |
