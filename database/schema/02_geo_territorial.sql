-- =============================================================================
-- SURP 2.0 — 02_geo_territorial.sql
--
-- División política administrativa de Chile: regiones → provincias → comunas.
-- Catálogo canónico que se cruza con sistemas externos vía `ine_code` (CUT).
--
-- Fuentes de seed (cargadas por `pnpm db:seed:geo`):
--   - regions.geojson   — juanbrujo/chilemapas
--   - communes.geojson  — juanbrujo/chilemapas
--   - provinces.geojson — BCN/IDE Chile (descarga pendiente)
--
-- Convenciones (ver GEO-PATTERNS.md §9):
--   - SRID 4326 (WGS84) en todas las geometrías.
--   - `ine_code` = clave natural; `id` = surrogate para JOINs.
--   - `geometry_simplified` se calcula post-load desde el seed (no es STORED
--     porque ST_Simplify con tolerancia variable se ejecuta una sola vez).
--   - `centroid`, `bbox` y `area_km2` son columnas generadas STORED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. regions — 16 regiones de Chile.
-- -----------------------------------------------------------------------------

CREATE TABLE regions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  ine_code                    VARCHAR(2) UNIQUE NOT NULL,    -- '01' a '16'
  name                        VARCHAR(100) NOT NULL,
  short_name                  VARCHAR(20),                   -- 'RM', 'Biobío', 'La Araucanía'
  iso_3166_2                  VARCHAR(6),                    -- 'CL-RM', 'CL-BI', etc. (ISO 3166-2)
  capital                     VARCHAR(100),
  order_north_south           SMALLINT NOT NULL,             -- orden geográfico de norte a sur

  geometry                    geometry(MultiPolygon, 4326),
  geometry_simplified         geometry(MultiPolygon, 4326),  -- ST_Simplify(geometry, 0.01) — calculado en seed

  -- Métricas derivadas STORED.
  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(geometry)) STORED,
  area_km2                    NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1000000.0) STORED,
  perimeter_km                NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Perimeter(geometry::geography) / 1000.0) STORED,

  -- Auditoría liviana (la fuente de verdad es el seed; raras mutaciones).
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT regions_ine_code_format_ck CHECK (ine_code ~ '^[0-9]{2}$')
);

CREATE INDEX regions_geometry_gix          ON regions USING GIST (geometry);
CREATE INDEX regions_geometry_simpl_gix    ON regions USING GIST (geometry_simplified);
CREATE INDEX regions_order_ix              ON regions (order_north_south);

CREATE TRIGGER regions_touch_updated_at
  BEFORE UPDATE ON regions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE regions IS
  'Regiones de Chile. Catálogo canónico cargado desde juanbrujo/chilemapas. ine_code = código INE de 2 dígitos; clave natural para integraciones.';
COMMENT ON COLUMN regions.geometry_simplified IS
  'Versión simplificada con ST_Simplify(geometry, 0.01) calculada en el seed. Para rendering de país completo donde la geometría detallada es excesiva.';

-- -----------------------------------------------------------------------------
-- 2. provinces — 56 provincias.
-- -----------------------------------------------------------------------------

CREATE TABLE provinces (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  ine_code                    VARCHAR(3) UNIQUE NOT NULL,    -- '011', '012', ...
  region_id                   BIGINT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name                        VARCHAR(100) NOT NULL,
  capital                     VARCHAR(100),

  geometry                    geometry(MultiPolygon, 4326),
  geometry_simplified         geometry(MultiPolygon, 4326),

  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(geometry)) STORED,
  area_km2                    NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1000000.0) STORED,
  perimeter_km                NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Perimeter(geometry::geography) / 1000.0) STORED,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT provinces_ine_code_format_ck CHECK (ine_code ~ '^[0-9]{3}$'),
  -- Los primeros 2 dígitos del CUT provincial coinciden con la región.
  CONSTRAINT provinces_ine_region_consistency_ck CHECK (
    -- Verificación se completa en el seed cruzando con regions.ine_code.
    -- Aquí solo aseguramos prefijo numérico.
    left(ine_code, 2) ~ '^[0-9]{2}$'
  )
);

CREATE INDEX provinces_geometry_gix         ON provinces USING GIST (geometry);
CREATE INDEX provinces_geometry_simpl_gix   ON provinces USING GIST (geometry_simplified);
CREATE INDEX provinces_region_ix            ON provinces (region_id);

CREATE TRIGGER provinces_touch_updated_at
  BEFORE UPDATE ON provinces
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE provinces IS
  'Provincias de Chile (56). ine_code de 3 dígitos. Fuente pendiente — BCN/IDE Chile (no incluida en chilemapas).';

-- -----------------------------------------------------------------------------
-- 3. communes — 346 comunas.
-- -----------------------------------------------------------------------------

CREATE TABLE communes (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  ine_code                    VARCHAR(5) UNIQUE NOT NULL,    -- CUT: 5 dígitos (ej. '13101' Santiago)
  province_id                 BIGINT NOT NULL REFERENCES provinces(id) ON DELETE RESTRICT,
  region_id                   BIGINT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name                        VARCHAR(100) NOT NULL,

  geometry                    geometry(MultiPolygon, 4326),
  geometry_simplified         geometry(MultiPolygon, 4326),

  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(geometry)) STORED,
  area_km2                    NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1000000.0) STORED,
  perimeter_km                NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Perimeter(geometry::geography) / 1000.0) STORED,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT communes_ine_code_format_ck CHECK (ine_code ~ '^[0-9]{5}$')
);

CREATE INDEX communes_geometry_gix          ON communes USING GIST (geometry);
CREATE INDEX communes_geometry_simpl_gix    ON communes USING GIST (geometry_simplified);
CREATE INDEX communes_province_ix           ON communes (province_id);
CREATE INDEX communes_region_ix             ON communes (region_id);
CREATE INDEX communes_name_trgm_ix
  ON communes USING gin (fn_immutable_unaccent(lower(name)) gin_trgm_ops);

CREATE TRIGGER communes_touch_updated_at
  BEFORE UPDATE ON communes
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE communes IS
  'Comunas de Chile (346). ine_code = CUT de 5 dígitos. region_id está denormalizado para evitar el join doble en filtros frecuentes.';

-- -----------------------------------------------------------------------------
-- 4. Trigger de consistencia: communes.region_id debe coincidir con la región
-- de la provincia referenciada. Defensa contra denormalización inconsistente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_communes_check_region_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_province_region BIGINT;
BEGIN
  SELECT region_id INTO v_province_region FROM provinces WHERE id = NEW.province_id;
  IF v_province_region IS NULL THEN
    RAISE EXCEPTION 'communes.province_id % no existe', NEW.province_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_province_region <> NEW.region_id THEN
    RAISE EXCEPTION 'communes.region_id (%) inconsistente con provinces.region_id (%) para province_id %',
      NEW.region_id, v_province_region, NEW.province_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER communes_check_region_consistency_ck
  BEFORE INSERT OR UPDATE OF province_id, region_id ON communes
  FOR EACH ROW EXECUTE FUNCTION fn_communes_check_region_consistency();

-- -----------------------------------------------------------------------------
-- 5. Función utilitaria: resolver comuna/provincia/región desde un punto.
-- Usada por el módulo de incidentes y por el job de reverse-geocoding.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_resolve_territory_from_point(
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS TABLE (
  commune_id   BIGINT,
  commune_name VARCHAR(100),
  commune_ine  VARCHAR(5),
  province_id  BIGINT,
  region_id    BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.name, c.ine_code, c.province_id, c.region_id
  FROM communes c
  WHERE ST_Contains(c.geometry, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  LIMIT 1;
$$;

COMMENT ON FUNCTION fn_resolve_territory_from_point(NUMERIC, NUMERIC) IS
  'Devuelve la comuna/provincia/región que contiene el punto (lat, lng) o vacío si cae fuera de Chile.';
