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
  @Max(90,  { message: 'Latitud inválida.' })
  lat!: number;

  @IsNumber({}, { message: 'La longitud debe ser un número.' })
  @Min(-180, { message: 'Longitud inválida.' })
  @Max(180,  { message: 'Longitud inválida.' })
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

## 6. Importación de predios desde shapefile/KML

Arauco probablemente tiene sus predios en shapefiles o KML. El flujo de importación:

1. Upload del archivo (shapefile .zip o .kml) a Azure Blob Storage.
2. Job BullMQ `property-import` procesa el archivo con `gdal` o `turf.js`.
3. Transformar a GeoJSON si es necesario.
4. Validar que cada polígono sea válido: `ST_IsValid(geometry)`.
5. Corregir con `ST_MakeValid(geometry)` si no es válido.
6. Insertar con `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)`.

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
- **Link a Google Maps / OSM:** `https://maps.google.com/?q=${lat},${lng}` para validación rápida en terreno.
- **Detección de predio automática:** cuando el usuario ingresa coordenadas manualmente, el frontend puede hacer una llamada a `POST /geo/resolve-point` para autocompletar el predio/área/zona.
