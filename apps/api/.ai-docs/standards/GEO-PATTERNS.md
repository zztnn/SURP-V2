# Geo Patterns — Dominio Geoespacial SURP 2.0

> Patrones de dominio para el manejo de datos geográficos en SURP.
> Complementa `POSTGIS-PATTERNS.md` (que cubre la BD).

---

## Contexto

El SURP opera sobre el patrimonio forestal de Arauco, que tiene una estructura geográfica jerárquica:

```
Chile (territorio)
└── Región (ej. Biobío, La Araucanía, Los Ríos)
    └── Provincia
        └── Comuna
            └── Zona Arauco (ej. Zona Sur)
                └── Área Arauco (ej. Área Angol)
                    └── Predio (ej. Predio Los Pinos) ← polígono real
                        └── Incidente (punto GPS)
```

Las estructuras Zona, Área y Predio son propias de Arauco (internas), con polígonos reales en PostGIS. Región/Provincia/Comuna son el territorio político chileno.

---

## 1. Jerarquía geográfica interna de Arauco

### Entidades y sus tipos geométricos

```
zones        → GEOMETRY(MULTIPOLYGON, 4326)  — zonas operativas grandes
areas        → GEOMETRY(POLYGON, 4326)        — áreas dentro de una zona
properties   → GEOMETRY(MULTIPOLYGON, 4326)  — predios (pueden ser no-contiguos)
```

### Regla de contención

Un predio **debe** estar contenido en su área, y un área en su zona. Validar al crear/editar con `ST_Within` o `ST_CoveredBy`.

```typescript
const isWithin = await this.db.execute(sql`
  SELECT ST_Within(
    ${newPropertyBoundary}::geometry,
    (SELECT boundary FROM areas WHERE id = ${areaId})
  ) AS is_valid
`);
```

---

## 2. Incidentes: captura y validación de coordenadas

### Input del usuario

El frontend envía coordenadas como objeto GeoJSON `Point`:

```json
{ "type": "Point", "coordinates": [-72.3552, -37.4617] }
```

O como objeto simple:

```json
{ "lat": -37.4617, "lng": -72.3552 }
```

### Validación en DTO

```typescript
export class LocationDto {
  @IsNumber({}, { message: 'La latitud debe ser un número.' })
  @Min(-90, { message: 'Latitud inválida.' })
  @Max(90, { message: 'Latitud inválida.' })
  lat!: number;

  @IsNumber({}, { message: 'La longitud debe ser un número.' })
  @Min(-180, { message: 'Longitud inválida.' })
  @Max(180, { message: 'Longitud inválida.' })
  lng!: number;
}
```

### Auto-asignación de predio/área/zona

Al crear un incidente con coordenadas, el backend puede auto-detectar el predio que lo contiene:

```typescript
async resolvePropertyFromPoint(lat: number, lng: number): Promise<Property | null> {
  const [row] = await this.db.execute(sql`
    SELECT external_id, name, area_id
    FROM properties
    WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      AND deleted_at IS NULL
    LIMIT 1
  `);
  return row ?? null;
}
```

Si el punto cae fuera de cualquier predio conocido, el usuario debe seleccionar manualmente. Nunca bloquear el registro del incidente por falta de predio.

---

## 3. Búsqueda y filtrado geoespacial

### Por predio (predios que contienen el incidente)

```typescript
// Filtro: incidents dentro del predio X
WHERE ST_Within(i.location, p.boundary)
```

### Por radio desde un punto

```typescript
// Filtro: incidents en radio de 5 km desde coordenada
WHERE ST_DWithin(
  i.location::geography,
  ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
  5000  -- metros
)
```

### Por zona/área (containment)

```typescript
// Todos los incidentes de la zona Biobío Sur
WHERE ST_Within(i.location, z.boundary)
  AND z.external_id = ${zoneExternalId}
```

### Bounding box (para el mapa)

Cuando el frontend envía los límites del viewport del mapa:

```typescript
interface BoundsDto {
  swLat: number; swLng: number;
  neLat: number; neLng: number;
}

// Query con bounding box
WHERE i.location && ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326)
```

El operador `&&` verifica overlapping de bounding boxes — más rápido que `ST_Within` para filtrado inicial de viewport.

---

## 4. Output GeoJSON para el frontend

### Incidente individual

```typescript
interface IncidentGeoDto {
  externalId: string;
  incidentType: string;
  location: {
    lat: number;
    lng: number;
  };
  propertyName: string | null;
  occurredAt: string; // ISO 8601
}
```

### GeoJSON Feature para Leaflet/MapLibre

Cuando el mapa necesita cargar muchos incidentes, devolver un `FeatureCollection`:

```typescript
interface IncidentFeatureCollectionDto {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number]; // [lng, lat] — GeoJSON es lng primero
    };
    properties: {
      externalId: string;
      incidentType: string;
      occurredAt: string;
      status: string;
    };
  }>;
}
```

> **Atención al orden:** GeoJSON usa `[lng, lat]`, no `[lat, lng]`. Leaflet/MapLibre esperan GeoJSON. Documentar explícitamente en el DTO con `@ApiProperty`.

### Predio con polígono

```typescript
interface PropertyGeoDto {
  externalId: string;
  name: string;
  areaName: string;
  zoneName: string;
  boundary: GeoJSON.MultiPolygon | null;
  incidentCount: number;
}
```

---

## 5. Endpoint de mapa (patrón recomendado)

Los módulos con datos geoespaciales exponen un endpoint `/map` separado del listado paginado:

```typescript
// GET /incidents/map?swLat=...&swLng=...&neLat=...&neLng=...&from=...&to=...
@Get('map')
@RequirePermission('incidents.incidents.read')
@ApiOperation({ summary: 'Retorna incidentes como FeatureCollection para visualización en mapa' })
async getMapFeatures(
  @Query() filters: IncidentMapFiltersDto,
): Promise<IncidentFeatureCollectionDto> {
  return this.service.getMapFeatures(filters);
}
```

- El endpoint de mapa retorna máx 1000-2000 features (filtrar por viewport + fechas).
- Usar clustering en el frontend para densidades altas.
- Campos mínimos en `properties` del GeoJSON — no serializar entidades completas.

---

## 6. Ingesta de zonas, áreas y predios Arauco (desde KMZ/KML)

Arauco nos entrega la jerarquía interna (zonas → áreas → predios) como **archivos KMZ** (KML comprimido). El flujo de ingesta:

1. **Upload del KMZ** a container `surp-geo-imports` (ver `STORAGE.md`) vía `POST /geo/imports`. Autorización: rol `principal_only` con `catalog.geometries.import`.
2. **Encolar** job `geo-import` (ver `BACKGROUND-JOBS.md`). El processor corre en el worker — no en la API.
3. **Descomprimir** KMZ y parsear KML con `@tmcw/togeojson` o `tokml` (reversible). Si viene shapefile `.zip`, usar `shpjs`.
4. **Detectar jerarquía** por la estructura de folders del KML (`<Folder>` anidados → zona/área/predio) o por atributos extendidos (`<ExtendedData>` con campos `zona_id`, `area_id`, `predio_codigo`, `nombre`).
5. **Validar geometría** para cada feature: `ST_IsValid(geometry)`. Corregir con `ST_MakeValid(geometry)` si no es válida. Reportar features corruptas en un CSV de reconciliación.
6. **Validar contención**: cada predio debe caber en su área (`ST_CoveredBy`), cada área en su zona. Si no, marcar la fila con `containment_warning=true` y reportar — no bloquear la ingesta entera.
7. **Upsert por clave natural** (`zona.codigo`, `area.codigo`, `predio.codigo` del KML) con `ON CONFLICT DO UPDATE` — permite reimportes incrementales.
8. **Reproyectar si hace falta**: si el KML declara SRID distinto a 4326 (raro), convertir con `ST_Transform(geom, 4326)`.
9. **Calcular métricas derivadas** (área, perímetro, centroide, bbox) como columnas generadas — ver sección 7.
10. **Generar versión simplificada** para el frontend: `geometry_simplified = ST_Simplify(geometry, 0.0005)` en predios (tolerancia más fina que comunas).
11. **Snapshot del KMZ fuente**: se guarda en Blob (`surp-geo-imports`) durante 90 días como evidencia de qué entró en el sistema. Auditoría registra quién importó y cuándo.

**Reasignación de zonas a empresas de seguridad:** la ingesta de geometrías es independiente de `organization_zone_assignments` (ver ADR-B-003). Reimportar un KMZ nunca altera asignaciones vigentes; si una zona se elimina del KMZ, su asignación queda con `valid_to` puesto automáticamente.

**Formatos alternativos a tener preparados** (para casos en que el cliente cambie): shapefile `.zip` (contiene `.shp`+`.shx`+`.dbf`+`.prj`), GeoJSON plano, GeoPackage (`.gpkg`). El job detecta el formato por extensión/magic number.

---

## 7. Centroide y bounding box automáticos

Para facilitar zoom del mapa y estadísticas:

```sql
-- Columnas calculadas automáticamente (puede ser columna generada o trigger)
centroid     GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_Centroid(boundary)) STORED,
bbox         BOX2D                 GENERATED ALWAYS AS (Box2D(boundary)) STORED,
area_ha      NUMERIC(12,4)         GENERATED ALWAYS AS (
               ST_Area(boundary::geography) / 10000.0
             ) STORED,
```

---

## 8. Coordenadas en el frontend

- **DatePicker de fecha de incidente:** puede incluir un campo de coordenadas con un mini-mapa de selección (click en mapa → setea lat/lng).
- **Formato de display:** `Lat: -37.4617, Lon: -72.3552` (6 decimales ≈ 11 cm de precisión).
- **Link a Google Maps:** `https://www.google.com/maps?q=${lat},${lng}` para validación rápida en terreno.
- **Detección de predio automática:** cuando el usuario ingresa coordenadas manualmente, el frontend puede hacer una llamada a `POST /geo/resolve-point` para autocompletar el predio/área/zona.

---

## 9. Geometrías territoriales oficiales de Chile (regiones / provincias / comunas)

El sistema necesita la jerarquía territorial chilena para:

- Asociar cada incidente/predio a su región/provincia/comuna (reporte obligatorio en partes policiales y denuncias).
- Filtrar en el frontend (dropdowns en cascada en formularios y búsqueda).
- Renderizar capas territoriales en el mapa (p.ej. sombrear la comuna en el mini-mapa del incidente).
- Cruzar estadísticas SURP con datos públicos del INE.

### Modelo

```sql
CREATE TABLE regions (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE DEFAULT gen_random_uuid(),
  ine_code VARCHAR(2) UNIQUE NOT NULL,   -- '01' a '16'
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(10),                  -- 'RM', 'Biobío', etc.
  order_north_south SMALLINT NOT NULL,     -- orden geográfico N-S
  geometry          GEOMETRY(MULTIPOLYGON, 4326),
  geometry_simplified GEOMETRY(MULTIPOLYGON, 4326),
  centroid          GEOMETRY(POINT, 4326),
  bbox              BOX2D,
  area_km2          NUMERIC(12, 2),
  perimeter_km      NUMERIC(12, 2)
);
CREATE INDEX idx_regions_geom ON regions USING GIST (geometry);

CREATE TABLE provinces (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE DEFAULT gen_random_uuid(),
  ine_code VARCHAR(3) UNIQUE NOT NULL,     -- '011', '012', ...
  region_id BIGINT NOT NULL REFERENCES regions(id),
  name VARCHAR(100) NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326),
  geometry_simplified GEOMETRY(MULTIPOLYGON, 4326),
  centroid GEOMETRY(POINT, 4326),
  bbox BOX2D,
  area_km2 NUMERIC(12, 2),
  perimeter_km NUMERIC(12, 2)
);
CREATE INDEX idx_provinces_geom ON provinces USING GIST (geometry);

CREATE TABLE communes (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE DEFAULT gen_random_uuid(),
  ine_code VARCHAR(5) UNIQUE NOT NULL,     -- CUT: '13101' (Santiago), '08101' (Concepción)
  province_id BIGINT NOT NULL REFERENCES provinces(id),
  region_id   BIGINT NOT NULL REFERENCES regions(id),   -- denormalizado para queries directas
  name VARCHAR(100) NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326),
  geometry_simplified GEOMETRY(MULTIPOLYGON, 4326),
  centroid GEOMETRY(POINT, 4326),
  bbox BOX2D,
  area_km2 NUMERIC(12, 2),
  perimeter_km NUMERIC(12, 2)
);
CREATE INDEX idx_communes_geom ON communes USING GIST (geometry);
```

- **`ine_code`** es la clave natural. Todo cruce con sistemas externos se hace por ella, no por el `id`.
- **Denormalización** `communes.region_id`: evita el join doble para filtros del tipo "comunas de la región X".
- **`geometry_simplified`** calculada con tolerancias diferenciadas:
  - Regiones: `ST_Simplify(geometry, 0.01)` — rendering país completo.
  - Provincias: `ST_Simplify(geometry, 0.005)`.
  - Comunas: `ST_Simplify(geometry, 0.005)`.
- **Fuente CRS:** WGS84 (EPSG:4326) — convertir si el archivo fuente viene en otra proyección.

### Fuentes de datos

**Regiones y comunas — fuente canónica: `juanbrujo/chilemapas`**.

⚠️ **El legacy SURP NO es fuente de estas geometrías.** El legacy tiene columnas de texto `Region` / `Comuna` sin código INE ni polígono. Durante el ETL, esos textos se **mapean por nombre** (case/acento-insensible) contra el catálogo canónico recién cargado desde chilemapas. Filas que no matcheen se reportan en el CSV de reconciliación para revisión manual.

IGM (`/Users/jean/Projects/IGM`) ya tiene estos datos cargados y probados usando la misma fuente — referencia útil para comparar:

- https://raw.githubusercontent.com/juanbrujo/chilemapas/master/geojson/regiones.geojson
- https://raw.githubusercontent.com/juanbrujo/chilemapas/master/geojson/comunas.geojson

Procedimiento de bootstrap: copiar los GeoJSON desde IGM a `/database/seed/geo/` del repo SURP y adaptar el importador. **No** depender de la URL pública en runtime — snapshot comiteable.

**Provincias — fuente oficial pendiente.** `juanbrujo/chilemapas` **no incluye provincias**. Opciones (por orden de preferencia):

1. **BCN (Biblioteca del Congreso Nacional)** — publica shapefiles oficiales de la división política administrativa con las 56 provincias y códigos INE completos. https://www.bcn.cl/siit/mapas_vectoriales
2. **IDE Chile (Infraestructura de Datos Espaciales)** — portal oficial del Ministerio de Bienes Nacionales. https://www.ide.cl/ — descargar capa "División Política Administrativa".
3. **Derivación desde comunas** (fallback sintético): `ST_Union(commune.geometry)` agrupando por los primeros 3 dígitos del CUT (`ine_code`). Produce polígonos correctos pero sin atributos oficiales — aceptable para dev, no para prod.

Guardar el shapefile/GeoJSON oficial descargado en `/database/seed/geo/provinces/` con nota en README de fuente y fecha de descarga.

**Zonas, áreas y predios de Arauco — desde KMZ del cliente.** Ver sección 6.

### Seed y carga

```
/database/seed/geo/
  regions.geojson          ← de chilemapas
  communes.geojson         ← de chilemapas
  provinces.geojson        ← de BCN/IDE (pendiente descarga)
  README.md                ← fuentes, fecha, licencia
```

Script de seed: `pnpm db:seed:geo` — corre en orden regiones → provincias → comunas, calcula métricas derivadas tras el insert. Idempotente (`ON CONFLICT (ine_code) DO UPDATE`).

Para cargas iniciales y reloads masivos, preferir `ogr2ogr` directo contra Postgres — más rápido que node:

```bash
ogr2ogr -f PostgreSQL PG:"$SURP_DATABASE_URL" regions.geojson \
  -nln regions_staging -t_srs EPSG:4326 -lco GEOMETRY_NAME=geometry
```

Y después un SQL que haga el upsert final desde `regions_staging` a `regions` con las métricas calculadas.

### Validación de contención vertical

Un incidente tiene `location GEOMETRY(POINT, 4326)`. Se infiere comuna/provincia/región con:

```sql
SELECT c.ine_code AS commune_code, c.province_id, c.region_id
FROM communes c
WHERE ST_Contains(c.geometry, ST_SetSRID(ST_MakePoint($lng, $lat), 4326))
LIMIT 1;
```

Para performance, el cliente `GeoResolverService` cachea el resultado por redondeo de coords a 5 decimales (≈1 m) en Redis (TTL 1 día). Una misma ubicación se resuelve una vez y se reutiliza.

### Cruce con la jerarquía Arauco

Una zona Arauco puede atravesar varias comunas. El schema guarda ambas jerarquías separadas:

- `incidents.commune_id` / `.province_id` / `.region_id` (territorial INE, llenado automático vía `ST_Contains`).
- `incidents.property_id` → `areas` → `zones` (jerarquía Arauco, llenada por asociación explícita o resolución de predio).

Los reportes pueden agrupar por cualquiera de los dos ejes.

### Endpoint público mínimo

Los dropdowns en cascada del frontend consumen:

```
GET /geo/regions                       → [{ externalId, ineCode, name, orderNorthSouth }]
GET /geo/regions/:ineCode/provinces    → [{ externalId, ineCode, name }]
GET /geo/provinces/:ineCode/communes   → [{ externalId, ineCode, name }]
```

Sin geometría (solo nombres + códigos). Las geometrías se piden aparte:

```
GET /geo/regions/:ineCode/geometry?simplified=true     → GeoJSON Feature
GET /geo/communes/:ineCode/geometry?simplified=true    → GeoJSON Feature
```

Estos endpoints son **cacheables con ETag** agresivamente (1 día) — los datos territoriales cambian rara vez y son públicos.
