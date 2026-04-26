-- =============================================================================
-- 20_zones_areas_properties.sql — Datos territoriales de Arauco (placeholder).
--
-- 4 zonas (Maule, Ñuble, Biobío, Araucanía) con polígonos cuadrados sintéticos
-- centrados en sus capitales reales. Cada zona tiene 2 áreas (Norte/Sur) y
-- cada área 2 predios (Oeste/Este). Los polígonos son referenciales — al
-- llegar el ETL real desde KMZ del cliente, se reemplazan vía UPDATE.
--
-- Coordenadas de centro (lat, lng):
--   ML Maule        Talca       -35.4264, -71.6554
--   NB Ñuble        Chillán     -36.6066, -72.1034
--   BB Biobío       Concepción  -36.8270, -73.0498
--   AR Araucanía    Temuco      -38.7396, -72.5984
--
-- short_code de 2 letras es el sufijo `Z{XX}` del código correlativo del
-- informe (ej. `19-2026-ZML`). Ver INCIDENT-CODE.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zones (4) — polígono cuadrado de ~0.6° × 0.6° centrado en la capital.
-- -----------------------------------------------------------------------------

INSERT INTO zones (code, short_code, name, boundary, last_imported_at, last_import_source)
SELECT
  zd.code,
  zd.short_code,
  zd.name,
  ST_Multi(ST_GeomFromText(
    format(
      'POLYGON((%s %s, %s %s, %s %s, %s %s, %s %s))',
      zd.center_lng - 0.3, zd.center_lat - 0.3,
      zd.center_lng + 0.3, zd.center_lat - 0.3,
      zd.center_lng + 0.3, zd.center_lat + 0.3,
      zd.center_lng - 0.3, zd.center_lat + 0.3,
      zd.center_lng - 0.3, zd.center_lat - 0.3
    ),
    4326
  ))::geometry(MultiPolygon, 4326),
  now(),
  'placeholder-seed-20'
FROM (
  VALUES
    ('ZONA-ML', 'ML', 'Zona Maule',     -35.4264::numeric, -71.6554::numeric),
    ('ZONA-NB', 'NB', 'Zona Ñuble',     -36.6066::numeric, -72.1034::numeric),
    ('ZONA-BB', 'BB', 'Zona Biobío',    -36.8270::numeric, -73.0498::numeric),
    ('ZONA-AR', 'AR', 'Zona Araucanía', -38.7396::numeric, -72.5984::numeric)
) AS zd (code, short_code, name, center_lat, center_lng)
ON CONFLICT (short_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Areas (8) — Norte (mitad superior) + Sur (mitad inferior) por zona.
-- -----------------------------------------------------------------------------

INSERT INTO areas (zone_id, code, name, boundary, last_imported_at, last_import_source)
SELECT
  z.id,
  z.short_code || '-' || ad.suffix AS code,
  z.name || ' — ' || ad.name        AS name,
  ST_Multi(ST_GeomFromText(
    format(
      'POLYGON((%s %s, %s %s, %s %s, %s %s, %s %s))',
      ST_X(z.centroid) - 0.3, ST_Y(z.centroid) + ad.lat_min,
      ST_X(z.centroid) + 0.3, ST_Y(z.centroid) + ad.lat_min,
      ST_X(z.centroid) + 0.3, ST_Y(z.centroid) + ad.lat_max,
      ST_X(z.centroid) - 0.3, ST_Y(z.centroid) + ad.lat_max,
      ST_X(z.centroid) - 0.3, ST_Y(z.centroid) + ad.lat_min
    ),
    4326
  ))::geometry(MultiPolygon, 4326),
  now(),
  'placeholder-seed-20'
FROM zones z
CROSS JOIN (
  VALUES
    ('N', 'Norte',  0.0::numeric,  0.3::numeric),
    ('S', 'Sur',   -0.3::numeric,  0.0::numeric)
) AS ad (suffix, name, lat_min, lat_max)
WHERE z.short_code IN ('ML', 'NB', 'BB', 'AR')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Properties (16) — Oeste (mitad izq.) + Este (mitad der.) por área.
--    commune_id se asigna a la comuna de la capital de cada zona.
-- -----------------------------------------------------------------------------

INSERT INTO properties
  (area_id, zone_id, code, name, commune_id, boundary, last_imported_at, last_import_source)
SELECT
  a.id,
  a.zone_id,
  a.code || '-P' || pd.suffix                          AS code,
  a.name || ' · Predio ' || pd.name                    AS name,
  c.id                                                 AS commune_id,
  ST_Multi(ST_GeomFromText(
    format(
      'POLYGON((%s %s, %s %s, %s %s, %s %s, %s %s))',
      ST_X(a.centroid) + pd.lng_min, ST_Y(a.centroid) - 0.05,
      ST_X(a.centroid) + pd.lng_max, ST_Y(a.centroid) - 0.05,
      ST_X(a.centroid) + pd.lng_max, ST_Y(a.centroid) + 0.05,
      ST_X(a.centroid) + pd.lng_min, ST_Y(a.centroid) + 0.05,
      ST_X(a.centroid) + pd.lng_min, ST_Y(a.centroid) - 0.05
    ),
    4326
  ))::geometry(MultiPolygon, 4326),
  now(),
  'placeholder-seed-20'
FROM areas a
JOIN zones z ON z.id = a.zone_id
LEFT JOIN communes c ON c.name = (
  CASE z.short_code
    WHEN 'ML' THEN 'Talca'
    WHEN 'NB' THEN 'Chillán'
    WHEN 'BB' THEN 'Concepción'
    WHEN 'AR' THEN 'Temuco'
  END
) AND c.region_id = (
  CASE z.short_code
    WHEN 'ML' THEN (SELECT id FROM regions WHERE ine_code = '07')
    WHEN 'NB' THEN (SELECT id FROM regions WHERE ine_code = '16')
    WHEN 'BB' THEN (SELECT id FROM regions WHERE ine_code = '08')
    WHEN 'AR' THEN (SELECT id FROM regions WHERE ine_code = '09')
  END
)
CROSS JOIN (
  VALUES
    ('1', 'Oeste', -0.15::numeric,  0.0::numeric),
    ('2', 'Este',    0.0::numeric,  0.15::numeric)
) AS pd (suffix, name, lng_min, lng_max)
WHERE z.short_code IN ('ML', 'NB', 'BB', 'AR')
ON CONFLICT DO NOTHING;
