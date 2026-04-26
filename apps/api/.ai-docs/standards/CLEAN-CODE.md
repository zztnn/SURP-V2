# Clean Code Standards — SURP 2.0 API (NestJS)

> Complementa las reglas del `CLAUDE.md` raíz y del `CLAUDE.md` del backend.
> Aplica a todo código bajo `apps/api/src/`.

Regla 0: identificadores (funciones, clases, variables, tablas, columnas, archivos) en **inglés**.
Comentarios y docstrings en español están bien. Mensajes visibles al usuario en **español latinoamericano**.

---

## 1. Tamaño de archivo

- **Objetivo:** 200–400 líneas por archivo.
- **Límite duro:** 1000 líneas (ESLint enforces).
- **Umbral de alerta:** ~800 líneas.

El límite es una alarma, no una ley. Al acercarse a 1000:

1. **Extraer** una unidad cohesiva a su propio archivo (lo más común).
2. **Dejarlo** si no hay extracción que mejore legibilidad — documentar con `// eslint-disable-next-line max-lines` + motivo.
3. **Repensar el diseño** si el archivo hace demasiadas cosas.

**Extracciones buenas:**

- Queries geoespaciales grandes → `*.geo.queries.ts`
- Orquestación de flujo complejo → `*.orchestrator.ts`
- Lógica de permisos → `PermissionService` dedicado

**Overrides por tipo de archivo:**

| Glob                             | Límite | Por qué                                                   |
| -------------------------------- | ------ | --------------------------------------------------------- |
| `src/database/generated/**/*.ts` | 1500   | Tipos generados por `kysely-codegen` crecen con el schema |
| `**/*.generated.ts`              | 1500   | Código generado                                           |
| `**/*.spec.ts`, `test/**/*.ts`   | 1500   | Tests exhaustivos de módulos complejos                    |

---

## 2. Naming conventions

**Archivos:** kebab-case en todas partes.

```
incidents.service.ts
create-incident.dto.ts
incidents.repository.ts
```

**Clases:** PascalCase.

```
IncidentsService
CreateIncidentDto
IncidentsRepository
```

**Métodos y variables:** camelCase.

```typescript
findByExternalId();
resolvePropertyFromPoint();
const isActive = row.isActive;
```

**Constantes:** UPPER_SNAKE_CASE.

```typescript
const MAX_INCIDENTS_PER_MAP = 2000;
const DEFAULT_PAGE_SIZE = 50;
```

**Booleans:** prefijo `is`/`has`/`can`/`should`.

```typescript
(isActive, hasEvidenceAttached, canClose, shouldNotify);
```

**Tablas y columnas (BD):** `snake_case`. Los tipos generados por `kysely-codegen` también viven en `snake_case` (sin plugin de camelCase). El mapeo a camelCase ocurre en el mapper del repositorio al construir el DTO de respuesta.

---

## 3. Reglas de métodos

- **Responsabilidad única:** un método hace una cosa.
- **Máx 3 parámetros:** usar objeto opciones para más.
- **Máx 2 niveles de anidación:** usar early returns (guard clauses).
- **Tipo de retorno explícito** en todos los métodos públicos.

Bueno:

```typescript
async findAllInRadius(filters: RadiusFilterDto): Promise<IncidentSummary[]>
async findByExternalId(id: string): Promise<Incident>
async create(dto: CreateIncidentDto, ctx: RequestContext): Promise<Incident>
```

Malo:

```typescript
async handleData(x: unknown): Promise<unknown>
async process(a, b, c, d, e): Promise<void>
```

---

## 4. Orden de imports

```typescript
// 1. NestJS core (@nestjs/*)
// 2. Librerías externas (kysely, class-validator, etc.)
// 3. Módulos internos (rutas relativas o alias de tsconfig)
// 4. Tipos (import type)
```

---

## 5. Comentarios

Bueno — explica el **por qué**, no el **qué**:

```typescript
// PostGIS usa [lng, lat] en ST_MakePoint — invertido respecto a la convención lat/lng de la app.
// Ver POSTGIS-PATTERNS.md sección "Insertar un punto".

// El predio puede ser null si el incidente ocurrió fuera del catastro de Arauco.
// No bloquear el registro — el usuario asigna el predio manualmente después.
```

Bueno — JSDoc en métodos públicos de services:

```typescript
/** Resuelve el predio que contiene el punto dado, retorna null si ninguno lo contiene. */
async resolvePropertyFromPoint(lat: number, lng: number): Promise<Property | null>
```

Malo:

```typescript
// incrementar contador
counter++;
// código comentado
// const old = await this.repo.findLegacy(key)
```

**Formato TODO** (siempre con ticket):

```typescript
// TODO(SURP-123): implementar clustering server-side para mapas con >5000 incidentes
```

---

## 6. TypeScript estricto

Nunca usar:

```
any                  → usar interfaces tipadas o unknown + type guard
@ts-ignore           → arreglar el error de tipos
as SomeType          → estrechar con type guards
eslint-disable       → arreglar la causa raíz
```

Siempre usar:

```
Tipos de retorno explícitos en métodos públicos
DTOs tipados para todo input (class-validator)
Tipos de Kysely (Selectable<DB['table']> / Insertable<DB['table']> / Updateable<DB['table']>) para rows
```

---

## 7. Logging

Usar `Logger` de NestJS (nunca `console.log`):

```typescript
private readonly logger = new Logger(IncidentsService.name);

this.logger.error('MAAT sync failed', error.stack);
this.logger.warn('Incident location outside all known properties', { externalId });
this.logger.log('Incident created', { incidentId, incidentType, propertyId });
```

Nunca loggear: contraseñas, tokens, PII más allá del `user_id`. Los datos de personas (RUT, nombres de imputados) son especialmente sensibles en el contexto forense.
