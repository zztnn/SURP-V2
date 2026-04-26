# PostgreSQL + PostGIS Patterns — SURP 2.0 API

> Patrones de base de datos no negociables. Existen por cómo funciona
> PostgreSQL 16 + PostGIS 3 + **Kysely** en este proyecto.

La fuente de verdad del schema es `/database/schema/` (archivos `.sql` numerados).
`kysely-codegen` **genera tipos TS** desde ese schema (no al revés).

Ver `STACK.md` §6 (ORM) y `ADR-B-002` (decisión).

---

## 1. Convenciones de schema

### Clave primaria + identificador público

Cada tabla aggregate-root tiene **dos** columnas de identidad:

```sql
id           BIGSERIAL PRIMARY KEY,
external_id  UUID NOT NULL DEFAULT gen_random_uuid(),
```

- `id` (BIGSERIAL) — FK interna, nunca se expone.
- `external_id` (UUID) — expuesto en URLs y payloads públicos.

### snake_case end-to-end

**Todas las tablas y columnas en `snake_case`.** Los tipos generados por `kysely-codegen` también viven en `snake_case` — **sin plugin de camelCase**. Razón: el SQL a mano (schema, queries ad-hoc, triggers, auditoría) y el código TS hablan el mismo idioma. Evita trabajar con dos conjuntos de nombres.

```typescript
// Tipo generado por kysely-codegen
export interface Incidents {
  id: Generated<number>;
  external_id: Generated<string>;
  occurred_at: Date;
  location: string; // geometry serialization — manejar con sql template
  // ...
}
```

Los DTOs del API **sí usan camelCase** (convención REST/JS del lado cliente). El mapeo snake_case → camelCase ocurre **en el mapper del repositorio**, no en Kysely.

### Timestamps + audit

```sql
created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by_id  BIGINT REFERENCES users(id),
updated_at     TIMESTAMPTZ,
updated_by_id  BIGINT REFERENCES users(id),
deleted_at     TIMESTAMPTZ,  -- solo si la tabla usa soft delete
```

- **Siempre `TIMESTAMPTZ`**, nunca `TIMESTAMP` sin timezone.
- `updated_at` lo llena el trigger `set_updated_at()`.
- `created_by_id` / `updated_by_id` los setea el service desde `ctx.userId` (leído por el trigger vía GUC, o seteado explícitamente en el `INSERT`/`UPDATE`).

### Soft delete selectivo

- Entidades de dominio con historia relevante: `deleted_at` (soft delete).
- Registros append-only (hitos, evidencias, audit_logs, alertas): hard delete o no se borran.

---

## 2. PostGIS — tipos geométricos

### Activar la extensión

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

### SRID único: EPSG:4326 (WGS84)

**Todo en EPSG:4326.** Nunca mezclar SRIDs. Coordenadas de entrada siempre en decimal degrees (ej. `-37.4617, -72.3552`).

### Tipos por entidad

| Entidad                            | Columna    | Tipo PostGIS                   |
| ---------------------------------- | ---------- | ------------------------------ |
| `incidents`                        | `location` | `GEOMETRY(POINT, 4326)`        |
| `properties` (predios)             | `boundary` | `GEOMETRY(MULTIPOLYGON, 4326)` |
| `zones`                            | `boundary` | `GEOMETRY(MULTIPOLYGON, 4326)` |
| `areas`                            | `boundary` | `GEOMETRY(POLYGON, 4326)`      |
| `regions`, `provinces`, `communes` | `geometry` | `GEOMETRY(MULTIPOLYGON, 4326)` |
| `patrol_routes`                    | `route`    | `GEOMETRY(LINESTRING, 4326)`   |

```sql
-- Ejemplo: tabla de incidentes
CREATE TABLE incidents (
  id             BIGSERIAL PRIMARY KEY,
  external_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  location       GEOMETRY(POINT, 4326) NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  -- ...
);
```

### Índices GIST (obligatorio en columnas geométricas)

```sql
CREATE INDEX idx_incidents_location   ON incidents   USING GIST(location);
CREATE INDEX idx_properties_boundary  ON properties  USING GIST(boundary);
CREATE INDEX idx_zones_boundary       ON zones       USING GIST(boundary);
```

**NUNCA** índice BTREE en columnas geométricas — no sirve para operadores espaciales.

---

## 3. Kysely + PostGIS

Kysely no tiene un tipo nativo para PostGIS, pero tampoco lo necesita: las columnas geométricas se declaran en los `.sql` y la plantilla `sql` de Kysely permite escribir queries geoespaciales de forma natural. No hay `customType`, no hay parsing de WKB en el lado TS.

### Tipos generados

`kysely-codegen` emite las columnas geométricas como `string` (WKB hex en lectura directa). **No se leen directamente** — siempre se proyectan con `ST_AsGeoJSON(...)::json` o `ST_X`/`ST_Y` en el `SELECT`.

```typescript
// kysely-types.ts (generado)
export interface Incidents {
  id: Generated<number>;
  external_id: Generated<string>;
  location: string; // WKB hex — no usar directo; proyectar con ST_AsGeoJSON
  occurred_at: Date;
}
```

### Regla de oro

- **Escribir** geometrías siempre vía `sql\`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)\``.
- **Leer** geometrías siempre vía `ST_AsGeoJSON(col)::json` (o `ST_X/ST_Y` para puntos).
- **Nunca** exponer WKB al código de dominio ni al frontend.

### Helpers en `src/database/geo.ts`

Para no repetir los fragmentos, centralizar en helpers:

```typescript
// apps/api/src/database/geo.ts
import { sql, type RawBuilder } from 'kysely';

export const makePoint = (lng: number, lat: number): RawBuilder<string> =>
  sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

export const asGeoJson = (column: string): RawBuilder<unknown> =>
  sql`ST_AsGeoJSON(${sql.ref(column)})::json`;

export const dwithin = (
  columnExpr: RawBuilder<string> | string,
  lng: number,
  lat: number,
  meters: number,
): RawBuilder<boolean> => {
  const col = typeof columnExpr === 'string' ? sql.ref(columnExpr) : columnExpr;
  return sql`ST_DWithin(${col}::geography, ${makePoint(lng, lat)}::geography, ${meters})`;
};
```

Con esto los repos quedan legibles:

```typescript
await db
  .selectFrom('incidents')
  .select(['external_id', 'occurred_at', asGeoJson('location').as('location')])
  .where(dwithin('location', centerLng, centerLat, radiusMeters))
  .where('deleted_at', 'is', null)
  .execute();
```

---

## 4. Queries espaciales frecuentes

### Insertar un punto

```typescript
await db
  .insertInto('incidents')
  .values({
    external_id: sql`gen_random_uuid()`,
    location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
    occurred_at: occurredAt,
    // ...
  })
  .execute();
```

### Buscar incidentes dentro de un radio (metros)

```typescript
const incidentsNearby = await db
  .selectFrom('incidents as i')
  .select([
    'i.external_id',
    'i.incident_type',
    sql<unknown>`ST_AsGeoJSON(i.location)::json`.as('location'),
    sql<number>`
      ST_Distance(
        i.location::geography,
        ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography
      )
    `.as('distance_meters'),
  ])
  .where(
    sql`
    ST_DWithin(
      i.location::geography,
      ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography,
      ${radiusMeters}
    )
  `,
  )
  .orderBy('distance_meters', 'asc')
  .execute();
```

> Nota: `::geography` convierte a tipo geográfico para que `ST_DWithin` trabaje en **metros** (no en grados).

### Buscar incidentes dentro de un predio (intersección)

```typescript
const incidentsInProperty = await db
  .selectFrom('incidents as i')
  .innerJoin('properties as p', (join) => join.on(sql`ST_Within(i.location, p.boundary)`))
  .select([
    'i.external_id',
    'i.incident_type',
    sql<unknown>`ST_AsGeoJSON(i.location)::json`.as('location'),
  ])
  .where('p.external_id', '=', propertyExternalId)
  .where('i.deleted_at', 'is', null)
  .execute();
```

### Buscar predios que contienen un punto

```typescript
const containingProperties = await db
  .selectFrom('properties as p')
  .select(['p.external_id', 'p.name'])
  .where(sql`ST_Contains(p.boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`)
  .where('p.deleted_at', 'is', null)
  .execute();
```

### Bounding box del viewport (operador `&&`)

Para filtrar features del mapa por los límites del viewport, usar `&&` (overlap de bounding boxes) — es **mucho más rápido** que `ST_Within` para filtrado inicial:

```typescript
const mapFeatures = await db
  .selectFrom('incidents')
  .select([
    'external_id',
    'incident_type',
    'occurred_at',
    sql<number>`ST_X(location)`.as('lng'),
    sql<number>`ST_Y(location)`.as('lat'),
  ])
  .where(sql`location && ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326)`)
  .where('deleted_at', 'is', null)
  .orderBy('occurred_at', 'desc')
  .limit(2000)
  .execute();
```

### Retornar GeoJSON FeatureCollection

Cuando el frontend necesita un `FeatureCollection` GeoJSON (para Google Maps Data Layer), construirlo en SQL:

```typescript
const rows = await db
  .selectFrom('incidents as i')
  .select(
    sql<string>`
      json_build_object(
        'type', 'FeatureCollection',
        'features', json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(i.location)::json,
            'properties', json_build_object(
              'externalId', i.external_id,
              'incidentType', i.incident_type,
              'occurredAt', i.occurred_at
            )
          )
        )
      )
    `.as('feature_collection'),
  )
  .where(sql`i.location && ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326)`)
  .where('i.deleted_at', 'is', null)
  .executeTakeFirstOrThrow();

return rows.feature_collection as unknown as GeoJSON.FeatureCollection;
```

---

## 5. GUCs de auditoría (sin RLS de tenant)

El modelo multi-organización se aplica en la capa de aplicación (guards + filtros de query), no vía RLS (ver `ADR-B-003`). Los GUCs existen **solo para auditoría**: el trigger `fn_audit_row_change` los lee para saber quién hizo qué.

Setear al inicio de la transacción de cada request autenticada:

```typescript
await db.transaction().execute(async (tx) => {
  await sql`SET LOCAL app.current_user_id = ${ctx.userId}`.execute(tx);
  await sql`SET LOCAL app.current_org_id  = ${ctx.organizationId}`.execute(tx);
  await sql`SET LOCAL app.session_id      = ${ctx.sessionId}`.execute(tx);
  await sql`SET LOCAL app.request_id      = ${ctx.requestId}`.execute(tx);
  await sql`SET LOCAL app.current_ip      = ${ctx.ip}`.execute(tx);

  // ... operaciones del request ...
});
```

**Siempre `SET LOCAL`** (no `SET`). El scope debe ser la transacción actual para no contaminar otras requests del pool.

Para pipelines no-transaccionales (reads simples), el `AuditInterceptor` abre una transacción corta solo para setear los GUCs y leer con ellos activos.

---

## 6. Auditoría automática

- El trigger `fn_audit_row_change` (ver `database/schema/98_audit_triggers.sql`) captura INSERT/UPDATE/DELETE en tablas aggregate-root automáticamente.
- Para acciones de dominio (alert_created, complaint_filed, case_closed, etc.) llamar explícitamente a `AuditService.logEvent(...)` desde NestJS — escribe directo en `audit_logs` con `source='event'`.
- Para bypass en migraciones/bulk imports:
  ```typescript
  await sql`SET LOCAL app.skip_audit = 'true'`.execute(tx);
  ```

Ver `ADR-B-009` para el modelo completo de auditoría.

---

## 7. Dominios personalizados

Definidos en `00_extensions_and_domains.sql`:

| Domain    | Tipo        | Uso                               |
| --------- | ----------- | --------------------------------- |
| `d_rut`   | VARCHAR(12) | RUT chileno canónico `XXXXXXXX-D` |
| `d_email` | CITEXT      | Email (case-insensitive)          |

> SURP no maneja dinero ni monedas, por lo que no hay `d_money` ni `d_ccy`.

---

## 8. Migraciones

- **Fuente de verdad**: `/database/schema/*.sql`, scripts numerados.
- **Dev**: `pnpm db:reset` + `pnpm db:schema` reconstruye desde cero.
- **Nuevas columnas/tablas**: editar el `.sql` en `/database/schema/` y correr:
  ```bash
  pnpm db:schema    # aplica los cambios
  pnpm db:codegen   # regenera apps/api/src/database/generated/kysely-types.ts
  ```
- **`kysely-codegen` introspecciona** la BD corriendo y emite los tipos — no maneja migraciones. El archivo generado entra al repo para que CI disponga de tipos sin correr codegen.
- **Producción**: los mismos `.sql` se aplican con un runner que registra el archivo aplicado en una tabla `schema_migrations (filename, applied_at)` — orden alfabético estricto, cada archivo aplicado una sola vez. Ver `/database/migrations/README.md`.

---

## 9. Performance

- **Índices GIST** en toda columna geométrica (obligatorio).
- **Índices parciales** para queries frecuentes:
  ```sql
  CREATE INDEX idx_incidents_active ON incidents(occurred_at DESC)
    WHERE deleted_at IS NULL;
  ```
- **Nunca `SELECT *`** en repos — especialmente con columnas geométricas grandes. Kysely obliga a listar columnas explícitas salvo `selectAll()`.
- **Paginar siempre** listas con potencial > 100 filas. Contrato:
  ```json
  { "data": [...], "pagination": { "page": 1, "pageSize": 50, "total": 1240 } }
  ```
- Para exportaciones grandes: usar BullMQ (job async) en vez de respuesta HTTP directa. Ver `BACKGROUND-JOBS.md`.

---

## 10. Prohibiciones

- Nunca guardar lat/lon en columnas `NUMERIC` separadas si la entidad tiene semántica espacial (usar `GEOMETRY(POINT, 4326)`).
- Nunca crear índice BTREE en columnas geométricas.
- Nunca mezclar SRIDs — todo en EPSG:4326.
- Nunca retornar geometrías en WKB crudo al frontend — siempre transformar a GeoJSON o coordenadas decimales.
- Nunca `TIMESTAMP` sin timezone.
- Nunca almacenar binarios de fotos/evidencias en la BD (ver `STORAGE.md`).
- Nunca leer una columna geométrica sin proyectarla con `ST_AsGeoJSON` / `ST_X` / `ST_Y`.
- Nunca usar `SET` (sin `LOCAL`) — contamina el pool.

---

## Referencias

- Schema fuente: `/database/schema/`
- Audit triggers: `/database/schema/98_audit_triggers.sql`
- Kysely config: `apps/api/src/database/kysely.config.ts`
- Tipos generados: `apps/api/src/database/generated/kysely-types.ts`
- Geo helpers: `apps/api/src/database/geo.ts`
- Geo domain patterns: `standards/GEO-PATTERNS.md`
- Stack completo: `STACK.md` (raíz), sección §6.
