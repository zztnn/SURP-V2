# PostgreSQL + PostGIS Patterns — SURP 2.0 API

> Patrones de base de datos no negociables. Existen por cómo funciona
> PostgreSQL 16 + PostGIS 3 + Drizzle en este proyecto.

La fuente de verdad del schema es `/database/schema/` (archivos `.sql` numerados).
Drizzle **refleja** ese schema, no al revés.

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

### snake_case + Drizzle mapping

Tablas y columnas en `snake_case`. Drizzle mapea a `camelCase` en TS con `casing: 'snake_case'`:

```typescript
// apps/api/src/database/drizzle.config.ts
export default defineConfig({
  schema: './src/database/schema/*',
  casing: 'snake_case',
});
```

### Sin multi-tenant: no hay `tenant_id`

SURP es single-org. Ninguna tabla tiene `tenant_id`. El aislamiento es por RBAC.

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
- `created_by_id` / `updated_by_id` los setea el service desde `ctx.userId`.

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

| Entidad | Columna | Tipo PostGIS |
|---------|---------|-------------|
| `incidents` | `location` | `GEOMETRY(POINT, 4326)` |
| `properties` (predios) | `boundary` | `GEOMETRY(MULTIPOLYGON, 4326)` |
| `zones` | `boundary` | `GEOMETRY(MULTIPOLYGON, 4326)` |
| `areas` | `boundary` | `GEOMETRY(POLYGON, 4326)` |
| `patrol_routes` | `route` | `GEOMETRY(LINESTRING, 4326)` |

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

## 3. Drizzle + PostGIS — tipos customizados

Drizzle no tiene soporte nativo para tipos PostGIS. Usar `customType`:

```typescript
// src/database/types/geometry.ts
import { customType } from 'drizzle-orm/pg-core';

export const geometryPoint = customType<{
  data: { lat: number; lng: number };
  driverData: string; // WKB hex
}>({
  dataType() {
    return 'GEOMETRY(POINT, 4326)';
  },
  fromDriver(value: string): { lat: number; lng: number } {
    // Drizzle retorna WKB hex — parsear con wkx o similar
    // O bien usar ST_AsGeoJSON y retornar como JSON
    const parsed = parseWkb(value);
    return { lat: parsed.y, lng: parsed.x };
  },
  toDriver(value: { lat: number; lng: number }): string {
    return `ST_GeomFromText('POINT(${value.lng} ${value.lat})', 4326)`;
  },
});

export const geometryPolygon = customType<{
  data: GeoJSON.MultiPolygon | null;
  driverData: string;
}>({
  dataType() {
    return 'GEOMETRY(MULTIPOLYGON, 4326)';
  },
  fromDriver(value: string): GeoJSON.MultiPolygon | null {
    if (!value) return null;
    return parseWkbToGeoJson(value) as GeoJSON.MultiPolygon;
  },
  toDriver(value: GeoJSON.MultiPolygon): string {
    return `ST_GeomFromGeoJSON('${JSON.stringify(value)}')`;
  },
});
```

**Alternativa más simple:** en queries de lectura, usar `ST_AsGeoJSON(column)` para obtener JSON directamente sin necesidad de parsear WKB:

```typescript
const rows = await this.db.execute(sql`
  SELECT
    id,
    external_id,
    ST_AsGeoJSON(location)::json AS location,
    ST_AsGeoJSON(boundary)::json AS boundary
  FROM incidents
  WHERE id = ${id}
`);
```

---

## 4. Queries espaciales frecuentes

### Insertar un punto

```typescript
await this.db.execute(sql`
  INSERT INTO incidents (external_id, location, occurred_at, ...)
  VALUES (
    gen_random_uuid(),
    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
    ${occurredAt},
    ...
  )
`);
```

### Buscar incidentes dentro de un radio (metros)

```typescript
const incidentsNearby = await this.db.execute(sql`
  SELECT
    i.external_id,
    i.incident_type,
    ST_AsGeoJSON(i.location)::json AS location,
    ST_Distance(
      i.location::geography,
      ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography
    ) AS distance_meters
  FROM incidents i
  WHERE ST_DWithin(
    i.location::geography,
    ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography,
    ${radiusMeters}
  )
  ORDER BY distance_meters ASC
`);
```

> Nota: `::geography` convierte a tipo geográfico para que `ST_DWithin` trabaje en **metros** (no en grados).

### Buscar incidentes dentro de un predio (intersección)

```typescript
const incidentsInProperty = await this.db.execute(sql`
  SELECT i.external_id, i.incident_type, ST_AsGeoJSON(i.location)::json AS location
  FROM incidents i
  JOIN properties p ON ST_Within(i.location, p.boundary)
  WHERE p.external_id = ${propertyExternalId}
    AND i.deleted_at IS NULL
`);
```

### Buscar predios que contienen un punto

```typescript
const containingProperties = await this.db.execute(sql`
  SELECT p.external_id, p.name
  FROM properties p
  WHERE ST_Contains(p.boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    AND p.deleted_at IS NULL
`);
```

### Retornar GeoJSON para el frontend

```typescript
const incidents = await this.db.execute(sql`
  SELECT
    external_id,
    incident_type,
    occurred_at,
    ST_X(location) AS lng,
    ST_Y(location) AS lat,
    ST_AsGeoJSON(location)::json AS geo_point
  FROM incidents
  WHERE deleted_at IS NULL
  ORDER BY occurred_at DESC
  LIMIT 500
`);
```

---

## 5. GUCs de auditoría (sin RLS de tenant)

Sin multi-tenant no hay GUCs de aislamiento. Solo auditoría:

```typescript
await tx.execute(sql`SET LOCAL app.current_user_id = ${ctx.userId}`);
await tx.execute(sql`SET LOCAL app.session_id      = ${ctx.sessionId}`);
await tx.execute(sql`SET LOCAL app.request_id      = ${ctx.requestId}`);
```

**Siempre `SET LOCAL`** (no `SET`). El scope debe ser la transacción actual para no contaminar otras requests del pool.

---

## 6. Auditoría automática

- El trigger `fn_audit_row_change` (ver `database/schema/98_audit_triggers.sql`) captura INSERT/UPDATE/DELETE en tablas aggregate-root automáticamente.
- Para acciones de dominio (alert_created, complaint_filed, case_closed, etc.) llamar explícitamente a `fn_audit_log_event()` desde NestJS.
- Para bypass en migraciones/bulk imports:
  ```typescript
  await tx.execute(sql`SET LOCAL app.skip_audit = 'true'`);
  ```

---

## 7. Dominios personalizados

Definidos en `00_extensions_and_domains.sql`:

| Domain  | Tipo        | Uso |
|---------|-------------|-----|
| `d_rut` | VARCHAR(12) | RUT chileno canónico `XXXXXXXX-D` |
| `d_email` | CITEXT    | Email (case-insensitive) |

> SURP no maneja dinero ni monedas, por lo que no hay `d_money` ni `d_ccy`.

---

## 8. Migraciones

- **Fuente de verdad**: `/database/schema/*.sql`, scripts numerados.
- **Dev**: `pnpm db:reset` + `pnpm db:schema` reconstruye desde cero.
- **Drizzle NO genera migraciones** automáticamente — `drizzle-kit introspect` solo para regenerar el mapping TS.
- Para nuevas columnas/tablas: editar el `.sql` en `/database/schema/` y actualizar el mapping en `apps/api/src/database/schema/`.

---

## 9. Performance

- **Índices GIST** en toda columna geométrica (obligatorio).
- **Índices parciales** para queries frecuentes:
  ```sql
  CREATE INDEX idx_incidents_active ON incidents(occurred_at DESC)
    WHERE deleted_at IS NULL;
  ```
- **Nunca `SELECT *`** en repos — especialmente con columnas geométricas grandes.
- **Paginar siempre** listas con potencial > 100 filas. Contrato:
  ```json
  { "data": [...], "pagination": { "page": 1, "pageSize": 50, "total": 1240 } }
  ```
- Para exportaciones grandes: usar BullMQ (job async) en vez de respuesta HTTP directa.

---

## 10. Prohibiciones

- Nunca guardar lat/lon en columnas `NUMERIC` separadas si la entidad tiene semántica espacial.
- Nunca crear índice BTREE en columnas geométricas.
- Nunca mezclar SRIDs — todo en EPSG:4326.
- Nunca retornar geometrías en WKB crudo al frontend — siempre transformar a GeoJSON o coordenadas decimales.
- Nunca `TIMESTAMP` sin timezone.
- Nunca almacenar binarios de fotos/evidencias en la BD.

---

## Referencias

- Schema fuente: `/database/schema/`
- Audit triggers: `/database/schema/98_audit_triggers.sql`
- Drizzle config: `apps/api/src/database/drizzle.config.ts`
- Geo helpers: `apps/api/src/database/geo.ts`
- Geo domain patterns: `standards/GEO-PATTERNS.md`
