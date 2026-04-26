-- =============================================================================
-- SURP 2.0 — 03_zones_areas_properties.sql
--
-- Estructura interna de Arauco: Zona → Área → Predio. Carga inicial desde
-- archivos KMZ vía job `geo-import` (ver BACKGROUND-JOBS.md y GEO-PATTERNS §6).
--
-- Incluye además:
--   - organization_zone_assignments — asignación temporal zona ↔ security_provider
--     (RBAC zonal — la base de la regla de visibilidad de ADR-B-003).
--   - incident_sequences — contador atómico para el código correlativo
--     `{NN}-{YYYY}-Z{XX}` (ver INCIDENT-CODE.md).
--
-- Referencias clave:
--   - ADR-B-003 (modelo multi-organización, visibilidad por zona asignada)
--   - INCIDENT-CODE.md (formato y reglas del correlativo)
--   - GEO-PATTERNS.md §1, §6, §7 (jerarquía, ingesta KMZ, columnas calculadas)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. zones — Zonas operativas Arauco. Polígonos grandes que agrupan áreas.
-- -----------------------------------------------------------------------------

CREATE TABLE zones (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  -- Código interno legacy (10 chars). Identificador estable para integraciones.
  code                        VARCHAR(10) UNIQUE NOT NULL,
  -- Sigla de 2 letras usada en el código correlativo del informe `Z{XX}` (ej. 'VA', 'AR').
  short_code                  VARCHAR(2) UNIQUE NOT NULL,
  name                        VARCHAR(100) NOT NULL,

  boundary                    geometry(MultiPolygon, 4326),
  boundary_simplified         geometry(MultiPolygon, 4326),  -- ST_Simplify(boundary, 0.005) calculado en el job

  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(boundary)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(boundary)) STORED,
  area_ha                     NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(boundary::geography) / 10000.0) STORED,

  -- Trazabilidad de la última ingesta KMZ (no la única — más detalle en
  -- geo_import_runs cuando se cree).
  last_imported_at            TIMESTAMPTZ,
  last_import_source          VARCHAR(255),                  -- nombre/hash del KMZ
  containment_warning         BOOLEAN NOT NULL DEFAULT false, -- algún área no contenida 100% en la zona

  active                      BOOLEAN NOT NULL DEFAULT true,
  migrated_from_legacy_id     INT,                           -- Zona.ZonaId legacy

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT zones_short_code_format_ck CHECK (short_code ~ '^[A-Z]{2}$')
);

CREATE INDEX zones_boundary_gix       ON zones USING GIST (boundary);
CREATE INDEX zones_boundary_simpl_gix ON zones USING GIST (boundary_simplified);
CREATE INDEX zones_active_ix          ON zones (active) WHERE deleted_at IS NULL;

CREATE TRIGGER zones_touch_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE zones IS
  'Zonas operativas Arauco. short_code = sigla de 2 letras usada en el código correlativo del informe (Z{XX}).';
COMMENT ON COLUMN zones.short_code IS
  'Sigla canónica de 2 letras mayúsculas. Embebida en el código del informe (`{NN}-{YYYY}-Z{XX}`). Las siglas se cargan desde el legacy en el seed; no se inventan.';

-- -----------------------------------------------------------------------------
-- 2. areas — Áreas dentro de una zona.
-- -----------------------------------------------------------------------------

CREATE TABLE areas (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  zone_id                     BIGINT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  code                        VARCHAR(20) NOT NULL,           -- código interno legacy
  name                        VARCHAR(150) NOT NULL,

  boundary                    geometry(MultiPolygon, 4326),
  boundary_simplified         geometry(MultiPolygon, 4326),

  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(boundary)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(boundary)) STORED,
  area_ha                     NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(boundary::geography) / 10000.0) STORED,

  containment_warning         BOOLEAN NOT NULL DEFAULT false,  -- el polígono no está 100% dentro de su zona
  last_imported_at            TIMESTAMPTZ,
  last_import_source          VARCHAR(255),

  active                      BOOLEAN NOT NULL DEFAULT true,
  migrated_from_legacy_id     INT,                            -- Area.AreaId legacy

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT areas_zone_code_unique UNIQUE (zone_id, code)
);

CREATE INDEX areas_boundary_gix       ON areas USING GIST (boundary);
CREATE INDEX areas_boundary_simpl_gix ON areas USING GIST (boundary_simplified);
CREATE INDEX areas_zone_ix            ON areas (zone_id) WHERE deleted_at IS NULL;
CREATE INDEX areas_active_ix          ON areas (active)  WHERE deleted_at IS NULL;

CREATE TRIGGER areas_touch_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE areas IS
  'Áreas Arauco. Se esperan contenidas en su zona; el job de ingesta marca `containment_warning=true` si la geometría se sale, sin bloquear la importación.';

-- -----------------------------------------------------------------------------
-- 3. properties — Predios. Pueden ser MultiPolygon (predios no contiguos).
-- -----------------------------------------------------------------------------

CREATE TABLE properties (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  area_id                     BIGINT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  -- Denormalización: zona vía área. Útil para queries rápidas y para el
  -- cálculo del código correlativo del informe (que necesita la zona).
  zone_id                     BIGINT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,

  code                        VARCHAR(40) NOT NULL,           -- código interno (ej. 'VA-AN-LP-001')
  name                        VARCHAR(200) NOT NULL,
  -- Comuna inferida desde la geometría (set por trigger / job al insertar/actualizar).
  -- Permite reportes por comuna sin tener que hacer ST_Contains contra communes en cada query.
  commune_id                  BIGINT REFERENCES communes(id),

  boundary                    geometry(MultiPolygon, 4326),
  boundary_simplified         geometry(MultiPolygon, 4326),  -- ST_Simplify(boundary, 0.0005)

  centroid                    geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_Centroid(boundary)) STORED,
  bbox                        box2d
    GENERATED ALWAYS AS (Box2D(boundary)) STORED,
  area_ha                     NUMERIC(14, 4)
    GENERATED ALWAYS AS (ST_Area(boundary::geography) / 10000.0) STORED,

  containment_warning         BOOLEAN NOT NULL DEFAULT false,  -- el predio no está 100% dentro de su área
  last_imported_at            TIMESTAMPTZ,
  last_import_source          VARCHAR(255),

  active                      BOOLEAN NOT NULL DEFAULT true,
  migrated_from_legacy_id     INT,                             -- Predio.PredioId legacy

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT properties_area_code_unique UNIQUE (area_id, code)
);

CREATE INDEX properties_boundary_gix         ON properties USING GIST (boundary);
CREATE INDEX properties_boundary_simpl_gix   ON properties USING GIST (boundary_simplified);
CREATE INDEX properties_area_ix              ON properties (area_id)    WHERE deleted_at IS NULL;
CREATE INDEX properties_zone_ix              ON properties (zone_id)    WHERE deleted_at IS NULL;
CREATE INDEX properties_commune_ix           ON properties (commune_id) WHERE deleted_at IS NULL;
CREATE INDEX properties_active_ix            ON properties (active)     WHERE deleted_at IS NULL;
CREATE INDEX properties_name_trgm_ix
  ON properties USING gin (fn_immutable_unaccent(lower(name)) gin_trgm_ops);

CREATE TRIGGER properties_touch_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE properties IS
  'Predios Arauco. zone_id está denormalizado vía area_id para queries rápidas y para el correlativo del informe. commune_id se infiere del centroide vía trigger.';

-- -----------------------------------------------------------------------------
-- 4. Triggers de consistencia jerárquica
--
-- (a) properties.zone_id debe coincidir con areas.zone_id de su área.
-- (b) properties.commune_id se calcula desde el centroide del boundary
--     (cuando boundary no es NULL). El job KMZ puede setear directamente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_properties_check_zone_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_area_zone BIGINT;
BEGIN
  SELECT zone_id INTO v_area_zone FROM areas WHERE id = NEW.area_id;
  IF v_area_zone IS NULL THEN
    RAISE EXCEPTION 'properties.area_id % no existe', NEW.area_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_area_zone <> NEW.zone_id THEN
    RAISE EXCEPTION 'properties.zone_id (%) inconsistente con areas.zone_id (%) para area_id %',
      NEW.zone_id, v_area_zone, NEW.area_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_check_zone_consistency_ck
  BEFORE INSERT OR UPDATE OF area_id, zone_id ON properties
  FOR EACH ROW EXECUTE FUNCTION fn_properties_check_zone_consistency();

CREATE OR REPLACE FUNCTION fn_properties_resolve_commune()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_commune_id BIGINT;
BEGIN
  -- Si el caller setea commune_id explícitamente, no lo sobreescribimos.
  IF NEW.commune_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sin boundary no podemos inferir comuna.
  IF NEW.boundary IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_commune_id
  FROM communes c
  WHERE ST_Contains(c.geometry, ST_Centroid(NEW.boundary))
  LIMIT 1;

  NEW.commune_id := v_commune_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_resolve_commune_tg
  BEFORE INSERT OR UPDATE OF boundary, commune_id ON properties
  FOR EACH ROW EXECUTE FUNCTION fn_properties_resolve_commune();

-- -----------------------------------------------------------------------------
-- 5. organization_zone_assignments
--
-- Asignación temporal de zonas a empresas de seguridad (`security_provider`).
-- Es la base de la regla de visibilidad ADR-B-003: una `security_provider` ve
-- y modifica incidentes/denuncias cuya zona esté ASIGNADA ACTUALMENTE a su
-- organización. Histórico se conserva (no se elimina la fila al rotar).
-- -----------------------------------------------------------------------------

CREATE TABLE organization_zone_assignments (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  organization_id             BIGINT NOT NULL REFERENCES organizations(id),
  zone_id                     BIGINT NOT NULL REFERENCES zones(id),

  valid_from                  TIMESTAMPTZ NOT NULL,
  valid_to                    TIMESTAMPTZ,                    -- NULL = vigente
  reason                      TEXT,                           -- motivo del cambio

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NOT NULL REFERENCES users(id),

  CONSTRAINT org_zone_assignments_valid_range_ck CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX org_zone_assignments_current_ix
  ON organization_zone_assignments (zone_id)
  WHERE valid_to IS NULL;

CREATE INDEX org_zone_assignments_org_ix
  ON organization_zone_assignments (organization_id, valid_to);

-- Una zona solo puede tener UNA asignación vigente a la vez. Si se reasigna,
-- la fila anterior debe cerrarse (valid_to ← now()) en la misma transacción.
CREATE UNIQUE INDEX org_zone_assignments_one_active_per_zone_ux
  ON organization_zone_assignments (zone_id)
  WHERE valid_to IS NULL;

-- Solo `security_provider` puede recibir asignaciones de zona. Defensa en SQL.
CREATE OR REPLACE FUNCTION fn_org_zone_assignments_check_org_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_type VARCHAR(30);
BEGIN
  SELECT type INTO v_type FROM organizations WHERE id = NEW.organization_id;
  IF v_type <> 'security_provider' THEN
    RAISE EXCEPTION 'organization_zone_assignments solo aplica a organizations.type=security_provider (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_zone_assignments_check_org_type_ck
  BEFORE INSERT OR UPDATE OF organization_id ON organization_zone_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_org_zone_assignments_check_org_type();

COMMENT ON TABLE organization_zone_assignments IS
  'Asignación temporal de zonas a empresas de seguridad (security_provider). Una zona tiene a lo más una asignación vigente. El histórico se conserva.';

-- -----------------------------------------------------------------------------
-- 6. incident_sequences — contador atómico para el correlativo del informe.
--
-- Patrón de asignación (ver INCIDENT-CODE.md):
--   INSERT INTO incident_sequences (zone_id, year, last_number)
--   VALUES (:zone, :year, 1)
--   ON CONFLICT (zone_id, year) DO UPDATE
--     SET last_number = incident_sequences.last_number + 1
--   RETURNING last_number;
--
-- El número devuelto se concatena con la sigla `short_code` de la zona.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_sequences (
  zone_id                     BIGINT NOT NULL REFERENCES zones(id),
  year                        SMALLINT NOT NULL,
  last_number                 INT NOT NULL DEFAULT 0,

  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (zone_id, year),
  CONSTRAINT incident_sequences_year_range_ck CHECK (year BETWEEN 2000 AND 2099),
  CONSTRAINT incident_sequences_non_negative_ck CHECK (last_number >= 0)
);

CREATE TRIGGER incident_sequences_touch_updated_at
  BEFORE UPDATE ON incident_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE incident_sequences IS
  'Contador atómico por zona+año para el código correlativo {NN}-{YYYY}-Z{XX}. Anular un informe NO libera el número (regla del dominio).';
