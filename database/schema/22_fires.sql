-- =============================================================================
-- SURP 2.0 — schema/22_fires.sql
--
-- Módulo fires — incendios forestales.
--
-- Entidad standalone (consistente con legacy Incendio.cs). Un incendio se
-- registra siempre por valor estadístico/operacional. Solo escala a
-- `incidents` y/o `cases` cuando hay denuncia/proceso penal.
--
--   1. fires            Registro operativo + investigación de causa +
--                       calificación legal pendiente/determinada.
--   2. fire_documents   Reportes CONAF, Bomberos, LABOCAR, peritajes,
--                       imágenes aéreas/satelitales. Cadena de evidencia.
--
-- Marco legal aplicado (/legal-incendios):
--   - CP arts. 474-481 (incendio doloso).
--   - CP art. 477 inc. final + 490 (cuasidelito de incendio).
--   - Ley 20.653 (agravantes y aumento de penas para incendio forestal).
--   - DS 4.363 + Ley 20.283 (sanciones administrativas CONAF).
--   - Ley 12.927 / Ley 18.314 (calificaciones especiales — competencia
--     exclusiva del Ministerio Público + Ministerio del Interior).
--
-- Principios:
--   - Tipificación pendiente por defecto. NUNCA asumir doloso.
--   - Atentado incendiario es FLAG, no tipo penal pre-decidido.
--   - Causa de origen requiere pericia (CONAF / LABOCAR / privado) antes
--     de cerrar.
--   - Hard delete prohibido (cadena de evidencia).
--
-- Engancha con:
--   - zones / areas / properties / communes (geo)
--   - incidents (FK opcional, solo si escaló — incident_type debe ser FIRE)
--   - cases (FK opcional, causa penal asociada)
--   - StorageService (fire_documents.storage_uri)
-- =============================================================================


-- =============================================================================
-- 1. fires — registro operativo + investigación de causa
-- =============================================================================

CREATE TABLE fires (
  id                              BIGSERIAL PRIMARY KEY,
  external_id                     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- ClaveExternaIncendio del legacy: código operativo Arauco/CONAF.
  external_code                   VARCHAR(40) NULL UNIQUE,

  -- Identificación temporal
  season                          INT NOT NULL,                       -- temporada de incendios (año fiscal)
  detected_at                     TIMESTAMPTZ NOT NULL,
  detection_source                VARCHAR(40) NULL,                   -- 'tower','aerial_patrol','satellite','citizen','conaf','contractor','other'
  dispatcher_name                 VARCHAR(120) NULL,
  incident_commander_name         VARCHAR(120) NULL,
  detector_name                   VARCHAR(120) NULL,                  -- legacy.Detector (texto libre)

  -- Tiempos del combate
  dispatched_at                   TIMESTAMPTZ NULL,
  arrived_at                      TIMESTAMPTZ NULL,
  controlled_at                   TIMESTAMPTZ NULL,
  extinguished_at                 TIMESTAMPTZ NULL,
  closed_at                       TIMESTAMPTZ NULL,

  -- Tiempos relativos en minutos (legacy preserva esto; útil para KPIs).
  -- Calculados pero almacenados para consistencia con legacy y estadística.
  dispatch_minutes                NUMERIC(8, 2) NULL,
  arrival_minutes                 NUMERIC(8, 2) NULL,
  control_minutes                 NUMERIC(8, 2) NULL,
  extinction_minutes              NUMERIC(8, 2) NULL,
  total_minutes                   NUMERIC(8, 2) NULL,

  -- Geo
  -- location_point: foco inicial (lat/lng). burned_polygon: zona quemada
  -- consolidada (puede ser NULL hasta extinción + pericia).
  location_point                  geometry(Point, 4326) NOT NULL,
  burned_polygon                  geometry(MultiPolygon, 4326) NULL,
  zone_id                         BIGINT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  area_id                         BIGINT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  primary_property_id             BIGINT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  commune_id                      BIGINT NULL REFERENCES communes(id),
  sector                          VARCHAR(150) NULL,                  -- texto libre (legacy.Sector)

  -- Característica del fuego
  focal_points_count              INT NULL CHECK (focal_points_count IS NULL OR focal_points_count > 0),
  initial_fuel                    TEXT NULL,                          -- legacy.CombustibleInicial
  final_fuel                      TEXT NULL,                          -- legacy.CombustibleFinal
  day_or_night                    VARCHAR(10) NULL CHECK (day_or_night IN ('day','night')),

  -- Meteorología al momento del foco (prueba clave para evaluar negligencia).
  weather_temperature_c           NUMERIC(5, 2) NULL,
  weather_humidity_pct            INT NULL,
  weather_wind_kmh                NUMERIC(6, 2) NULL,
  weather_wind_direction          VARCHAR(10) NULL,                   -- N, NE, E, SE, S, SW, W, NW

  -- Investigación de la causa de origen
  origin_cause                    VARCHAR(30) NOT NULL DEFAULT 'under_investigation',
  origin_cause_subcategory        VARCHAR(100) NULL,                  -- legacy.Causa1 / Causa2
  origin_motivation               TEXT NULL,                          -- legacy.Motivacion
  origin_investigation_notes      TEXT NULL,                          -- legacy.ObservacionIndagacion
  origin_determined_at            TIMESTAMPTZ NULL,
  origin_determined_by_user_id    BIGINT NULL REFERENCES users(id),

  -- Calificación legal (pendiente por defecto). Permite que la determinación
  -- se haga tras la pericia, no al crear el registro.
  legal_qualification             VARCHAR(40) NOT NULL DEFAULT 'pending',
  -- Atentado incendiario como FLAG. NO es un tipo penal — es un indicador
  -- operativo URP que activa workflows especiales (panfletos, reivindicación,
  -- modus operandi). La calificación bajo Ley 12.927/18.314 es exclusiva del
  -- Ministerio Público.
  terrorism_attack_flag           BOOLEAN NOT NULL DEFAULT false,
  terrorism_indicators            JSONB NULL,                         -- {"pamphlets":true,"slogans":[...],"vehicles":[...]}

  -- Superficies afectadas (hectáreas). Trazabilidad de daño por especie.
  total_affected_ha               NUMERIC(12, 4) NOT NULL DEFAULT 0,
  initial_surface_ha              NUMERIC(12, 4) NULL,                -- legacy.SuperficieInicial
  plantation_affected_ha          NUMERIC(12, 4) NULL,                -- legacy.SuperficiePlantacionAfectada
  native_forest_affected_ha       NUMERIC(12, 4) NULL,
  pinus_radiata_ha                NUMERIC(12, 4) NULL,                -- legacy.Pira
  eucalyptus_ha                   NUMERIC(12, 4) NULL,                -- legacy.Euca
  other_species_ha                NUMERIC(12, 4) NULL,                -- legacy.Otras

  -- Daño económico
  estimated_value_clp             NUMERIC(15, 2) NULL,
  estimated_value_ifrs_clp        NUMERIC(15, 2) NULL,                -- legacy.ValorIFRS

  -- Recursos de combate (counts del legacy)
  combat_resources_count          INT NULL CHECK (combat_resources_count IS NULL OR combat_resources_count >= 0),
  control_resources_count         INT NULL CHECK (control_resources_count IS NULL OR control_resources_count >= 0),

  -- Vínculos opcionales con incidents/cases. Si se setea incident_id, debe
  -- ser un incident con incident_type=FIRE (validado por trigger).
  incident_id                     BIGINT NULL UNIQUE REFERENCES incidents(id) ON DELETE RESTRICT,
  case_id                         BIGINT NULL REFERENCES cases(id) ON DELETE RESTRICT,

  -- Vínculo con toma activa (flag operativo; detección automática por
  -- intersección espacial+temporal con tomas se hace en use case TS).
  during_active_land_occupation   BOOLEAN NOT NULL DEFAULT false,
  occupation_intersection_notes   TEXT NULL,

  -- Sanciones / requerimientos administrativos
  conaf_complaint_filed           BOOLEAN NOT NULL DEFAULT false,
  conaf_complaint_filed_at        TIMESTAMPTZ NULL,
  conaf_complaint_resolution_id   VARCHAR(80) NULL,                   -- nro resolución CONAF
  denuncia_request_at             TIMESTAMPTZ NULL,                   -- legacy.SolicitudDenuncia (cuándo URP solicitó)

  -- Estado funcional
  state                           VARCHAR(20) NOT NULL DEFAULT 'detected',
  voided_at                       TIMESTAMPTZ NULL,
  voided_by_user_id               BIGINT NULL REFERENCES users(id),
  void_reason                     TEXT NULL,

  notes                           TEXT NULL,
  migrated_from_legacy_id         INT NULL,                           -- legacy.IncendioId

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                   BIGINT NULL REFERENCES users(id),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                   BIGINT NULL REFERENCES users(id),
  deleted_at                      TIMESTAMPTZ NULL,
  deleted_by_id                   BIGINT NULL REFERENCES users(id),

  -- Geo Chile bbox
  CONSTRAINT fires_chile_bbox_ck CHECK (
    ST_X(location_point) BETWEEN -110 AND -66
    AND ST_Y(location_point) BETWEEN -90 AND -17
  ),

  -- Origin cause enum
  CONSTRAINT fires_origin_cause_ck CHECK (origin_cause IN (
    'intentional',         -- atentado / quema dirigida (CP 476 N° 3 + Ley 20.653)
    'negligence',          -- imprudencia (CP art. 477 inc. final + 490)
    'electrical',          -- línea eléctrica caída, transformador
    'natural',             -- rayo, autocombustión
    'undetermined',        -- pericia concluyó sin determinación
    'under_investigation'  -- aún no hay pericia (estado por defecto)
  )),

  -- Legal qualification enum
  CONSTRAINT fires_legal_qualification_ck CHECK (legal_qualification IN (
    'pending',                   -- por defecto hasta que haya pericia
    'dolous_476_3',              -- CP 476 N°3 + Ley 20.653 (forestal doloso)
    'culposo_490',               -- CP art. 490 (cuasidelito)
    'art_475_persons',           -- CP 475 (lugares con personas)
    'art_474_death_injury',      -- CP 474 (con resultado de muerte/lesiones)
    'ley_12927_internal_security', -- requiere querella Ministerio Interior
    'ley_18314_terrorism',       -- antiterrorista (competencia MP exclusiva)
    'administrative_only',       -- solo CONAF, sin sede penal
    'no_action'                  -- archivado sin acción
  )),

  -- Origin determination consistency
  CONSTRAINT fires_origin_determined_consistency_ck CHECK (
    -- Si origin_cause es terminal (no under_investigation), exige determinado_at + by.
    -- Si under_investigation, esos campos deben ser NULL.
    (origin_cause = 'under_investigation' AND origin_determined_at IS NULL AND origin_determined_by_user_id IS NULL)
    OR (origin_cause <> 'under_investigation' AND origin_determined_at IS NOT NULL AND origin_determined_by_user_id IS NOT NULL)
  ),

  -- State enum
  CONSTRAINT fires_state_ck CHECK (state IN (
    'detected', 'dispatched', 'arrived', 'controlled', 'extinguished', 'closed', 'voided'
  )),

  -- Void consistency
  CONSTRAINT fires_void_consistency_ck CHECK (
    (state <> 'voided' AND voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
    OR (state = 'voided' AND voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL)
  ),

  -- Combat timestamps coherentes
  CONSTRAINT fires_dispatch_after_detected_ck CHECK (dispatched_at IS NULL OR dispatched_at >= detected_at),
  CONSTRAINT fires_arrival_after_dispatch_ck CHECK (arrived_at IS NULL OR dispatched_at IS NULL OR arrived_at >= dispatched_at),
  CONSTRAINT fires_control_after_arrival_ck CHECK (controlled_at IS NULL OR arrived_at IS NULL OR controlled_at >= arrived_at),
  CONSTRAINT fires_extinction_after_control_ck CHECK (extinguished_at IS NULL OR controlled_at IS NULL OR extinguished_at >= controlled_at),
  CONSTRAINT fires_closed_after_extinction_ck CHECK (closed_at IS NULL OR extinguished_at IS NULL OR closed_at >= extinguished_at),

  -- Surfaces no negativas
  CONSTRAINT fires_surfaces_nonneg_ck CHECK (
    total_affected_ha >= 0
    AND (initial_surface_ha IS NULL OR initial_surface_ha >= 0)
    AND (plantation_affected_ha IS NULL OR plantation_affected_ha >= 0)
    AND (native_forest_affected_ha IS NULL OR native_forest_affected_ha >= 0)
    AND (pinus_radiata_ha IS NULL OR pinus_radiata_ha >= 0)
    AND (eucalyptus_ha IS NULL OR eucalyptus_ha >= 0)
    AND (other_species_ha IS NULL OR other_species_ha >= 0)
  ),

  -- Weather ranges
  CONSTRAINT fires_humidity_range_ck CHECK (weather_humidity_pct IS NULL OR weather_humidity_pct BETWEEN 0 AND 100),
  CONSTRAINT fires_wind_nonneg_ck CHECK (weather_wind_kmh IS NULL OR weather_wind_kmh >= 0),
  CONSTRAINT fires_wind_direction_ck CHECK (
    weather_wind_direction IS NULL OR weather_wind_direction IN ('N','NE','E','SE','S','SW','W','NW')
  ),

  -- CONAF complaint consistency
  CONSTRAINT fires_conaf_complaint_consistency_ck CHECK (
    (conaf_complaint_filed = false AND conaf_complaint_filed_at IS NULL)
    OR (conaf_complaint_filed = true AND conaf_complaint_filed_at IS NOT NULL)
  )
);

CREATE TRIGGER fires_touch_updated_at
  BEFORE UPDATE ON fires
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- area_id consistente con properties.area_id si primary_property_id está,
-- y zone_id consistente con properties.zone_id (mismo patrón que incidents).
CREATE OR REPLACE FUNCTION fn_fires_validate_geo_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_property_zone BIGINT;
  v_property_area BIGINT;
  v_area_zone BIGINT;
BEGIN
  IF NEW.primary_property_id IS NOT NULL THEN
    SELECT zone_id, area_id INTO v_property_zone, v_property_area
    FROM properties WHERE id = NEW.primary_property_id;
    IF v_property_zone IS NULL THEN
      RAISE EXCEPTION 'fires: property % no existe', NEW.primary_property_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_property_zone <> NEW.zone_id THEN
      RAISE EXCEPTION 'fires: zone_id (%) inconsistente con property.zone_id (%)',
        NEW.zone_id, v_property_zone
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.area_id IS NOT NULL AND NEW.area_id <> v_property_area THEN
      RAISE EXCEPTION 'fires: area_id (%) inconsistente con property.area_id (%)',
        NEW.area_id, v_property_area
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.area_id IS NOT NULL THEN
    SELECT zone_id INTO v_area_zone FROM areas WHERE id = NEW.area_id;
    IF v_area_zone IS NULL THEN
      RAISE EXCEPTION 'fires: area % no existe', NEW.area_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_area_zone <> NEW.zone_id THEN
      RAISE EXCEPTION 'fires: zone_id (%) inconsistente con area.zone_id (%)',
        NEW.zone_id, v_area_zone
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fires_validate_geo_consistency
  BEFORE INSERT OR UPDATE OF zone_id, area_id, primary_property_id ON fires
  FOR EACH ROW EXECUTE FUNCTION fn_fires_validate_geo_consistency();

-- Si incident_id se setea, validar que incident_type=FIRE.
CREATE OR REPLACE FUNCTION fn_fires_validate_incident_link()
RETURNS TRIGGER AS $$
DECLARE
  v_type_code VARCHAR(40);
BEGIN
  IF NEW.incident_id IS NOT NULL THEN
    SELECT it.code INTO v_type_code
    FROM incidents i
    JOIN incident_types it ON it.id = i.incident_type_id
    WHERE i.id = NEW.incident_id AND i.deleted_at IS NULL;
    IF v_type_code IS NULL THEN
      RAISE EXCEPTION 'fires: incident_id % no existe', NEW.incident_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_type_code <> 'FIRE' THEN
      RAISE EXCEPTION 'fires: incident_id % debe tener incident_type=FIRE (got %)', NEW.incident_id, v_type_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fires_validate_incident_link
  BEFORE INSERT OR UPDATE OF incident_id ON fires
  FOR EACH ROW EXECUTE FUNCTION fn_fires_validate_incident_link();

-- Máquina de estados: detected → dispatched → arrived → controlled →
-- extinguished → closed. cualquiera → voided.
CREATE OR REPLACE FUNCTION fn_fires_validate_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  -- voided es terminal y desde cualquier estado
  IF NEW.state = 'voided' THEN
    RETURN NEW;
  END IF;
  -- closed es terminal (excepto voided)
  IF OLD.state = 'closed' THEN
    RAISE EXCEPTION 'fires: estado closed solo transiciona a voided'
      USING ERRCODE = 'check_violation';
  END IF;
  -- voided es terminal absoluto
  IF OLD.state = 'voided' THEN
    RAISE EXCEPTION 'fires: estado voided no se puede revertir'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Forward transitions
  IF OLD.state = 'detected' AND NEW.state IN ('dispatched','arrived','controlled','extinguished') THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'dispatched' AND NEW.state IN ('arrived','controlled','extinguished') THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'arrived' AND NEW.state IN ('controlled','extinguished') THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'controlled' AND NEW.state = 'extinguished' THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'extinguished' AND NEW.state = 'closed' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'fires: transición inválida % → %', OLD.state, NEW.state
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fires_validate_state_transition
  BEFORE UPDATE OF state ON fires
  FOR EACH ROW EXECUTE FUNCTION fn_fires_validate_state_transition();

-- Hard delete prohibido (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_fires_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'fires: hard delete prohibido. Usar state=voided o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fires_no_hard_delete
  BEFORE DELETE ON fires
  FOR EACH ROW EXECUTE FUNCTION fn_fires_no_hard_delete();

CREATE INDEX fires_zone_ix         ON fires(zone_id) WHERE deleted_at IS NULL;
CREATE INDEX fires_property_ix     ON fires(primary_property_id) WHERE deleted_at IS NULL AND primary_property_id IS NOT NULL;
CREATE INDEX fires_commune_ix      ON fires(commune_id) WHERE deleted_at IS NULL AND commune_id IS NOT NULL;
CREATE INDEX fires_state_ix        ON fires(state) WHERE deleted_at IS NULL;
CREATE INDEX fires_origin_cause_ix ON fires(origin_cause) WHERE deleted_at IS NULL;
CREATE INDEX fires_legal_qual_ix   ON fires(legal_qualification) WHERE deleted_at IS NULL;
CREATE INDEX fires_terrorism_ix    ON fires(terrorism_attack_flag) WHERE deleted_at IS NULL AND terrorism_attack_flag = true;
CREATE INDEX fires_occupation_ix   ON fires(during_active_land_occupation) WHERE deleted_at IS NULL AND during_active_land_occupation = true;
CREATE INDEX fires_detected_at_ix  ON fires(detected_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX fires_season_ix       ON fires(season) WHERE deleted_at IS NULL;
CREATE INDEX fires_location_gix    ON fires USING GIST (location_point);
CREATE INDEX fires_burned_gix      ON fires USING GIST (burned_polygon) WHERE burned_polygon IS NOT NULL;
CREATE INDEX fires_incident_ix     ON fires(incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX fires_case_ix         ON fires(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX fires_pending_qual_ix ON fires(detected_at DESC)
  WHERE deleted_at IS NULL AND legal_qualification = 'pending';
CREATE INDEX fires_legacy_id_ix    ON fires(migrated_from_legacy_id) WHERE migrated_from_legacy_id IS NOT NULL;

COMMENT ON TABLE fires IS
  'Incendios forestales. Registro standalone (consistente con legacy). Calificación legal pendiente por defecto. Atentado incendiario es FLAG operativo, no tipo penal. Hard delete prohibido.';
COMMENT ON COLUMN fires.terrorism_attack_flag IS
  'Flag operativo URP cuando hay indicios objetivos de atentado (panfletos, lemas, modus operandi). NO equivale a calificación bajo Ley 12.927/18.314 — esa es competencia exclusiva del Ministerio Público.';
COMMENT ON COLUMN fires.during_active_land_occupation IS
  'Detección automática (use case TS) cuando hay intersección espacial+temporal con una toma activa. Multiplica gravedad legal.';


-- =============================================================================
-- 2. fire_documents — adjuntos de evidencia y peritajes
-- =============================================================================

CREATE TABLE fire_documents (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  fire_id             BIGINT NOT NULL REFERENCES fires(id) ON DELETE RESTRICT,

  document_type       VARCHAR(40) NOT NULL,

  storage_uri         TEXT NOT NULL,
  mime_type           VARCHAR(100) NOT NULL,
  size_bytes          BIGINT NOT NULL,
  sha256_hash         CHAR(64) NOT NULL,

  description         TEXT NULL,
  document_number     VARCHAR(80) NULL,                   -- nro reporte / acta
  issued_at           DATE NULL,
  issuing_authority   VARCHAR(200) NULL,                  -- 'CONAF Región Biobío', 'LABOCAR', etc.

  -- Coordenada (EXIF para imágenes drone/aéreas/satelital)
  gps_lat             NUMERIC(10, 7) NULL,
  gps_lng             NUMERIC(10, 7) NULL,
  location            geometry(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN gps_lat IS NOT NULL AND gps_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(gps_lng, gps_lat), 4326)
      END
    ) STORED,

  captured_at         TIMESTAMPTZ NULL,
  captured_by_user_id BIGINT NULL REFERENCES users(id),

  confidentiality     VARCHAR(30) NOT NULL DEFAULT 'internal',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT fd_document_type_ck CHECK (document_type IN (
    'conaf_report',                  -- pericia CONAF de causa y origen
    'bomberos_report',               -- reporte combate Bomberos
    'labocar_report',                -- pericia LABOCAR Carabineros
    'expert_assessment',             -- perito privado contratado por Arauco
    'satellite_imagery',             -- imágenes satelitales
    'drone_imagery',                 -- imágenes de dron Arauco
    'aerial_imagery',                -- imagen aérea (avión)
    'ground_photo',                  -- foto en terreno
    'weather_report',                -- reporte meteorológico oficial al momento
    'administrative_resolution_conaf', -- resolución sancionatoria CONAF
    'judicial_document',             -- copia de pieza judicial
    'other'
  )),
  CONSTRAINT fd_confidentiality_ck CHECK (confidentiality IN (
    'internal', 'sensitive', 'judicial_evidence'
  )),
  CONSTRAINT fd_size_positive_ck CHECK (size_bytes > 0),
  CONSTRAINT fd_sha256_format_ck CHECK (sha256_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT fd_chile_bbox_ck CHECK (
    location IS NULL
    OR (ST_X(location) BETWEEN -110 AND -66 AND ST_Y(location) BETWEEN -90 AND -17)
  )
);

CREATE TRIGGER fire_documents_touch_updated_at
  BEFORE UPDATE ON fire_documents
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- sha256 + storage_uri + size + fire_id inmutables (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_fire_documents_immutable_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash
     OR NEW.size_bytes  IS DISTINCT FROM OLD.size_bytes
     OR NEW.storage_uri IS DISTINCT FROM OLD.storage_uri THEN
    RAISE EXCEPTION 'fire_documents: sha256_hash, size_bytes y storage_uri son inmutables (cadena de evidencia).';
  END IF;
  IF NEW.fire_id IS DISTINCT FROM OLD.fire_id THEN
    RAISE EXCEPTION 'fire_documents: fire_id es inmutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fire_documents_immutable_evidence
  BEFORE UPDATE ON fire_documents
  FOR EACH ROW EXECUTE FUNCTION fn_fire_documents_immutable_evidence();

-- Hard delete prohibido (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_fire_documents_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'fire_documents: hard delete prohibido. Usar deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fire_documents_no_hard_delete
  BEFORE DELETE ON fire_documents
  FOR EACH ROW EXECUTE FUNCTION fn_fire_documents_no_hard_delete();

CREATE INDEX fd_fire_ix          ON fire_documents(fire_id) WHERE deleted_at IS NULL;
CREATE INDEX fd_document_type_ix ON fire_documents(document_type) WHERE deleted_at IS NULL;
CREATE INDEX fd_issued_ix        ON fire_documents(issued_at) WHERE deleted_at IS NULL AND issued_at IS NOT NULL;
CREATE INDEX fd_location_gix     ON fire_documents USING GIST (location);
CREATE INDEX fd_sha256_ix        ON fire_documents(sha256_hash);
CREATE INDEX fd_confidentiality_ix ON fire_documents(confidentiality) WHERE deleted_at IS NULL;

COMMENT ON TABLE fire_documents IS
  'Documentos asociados al incendio: reportes CONAF, Bomberos, LABOCAR, peritajes privados, imágenes satelitales/drone/terreno. sha256+size+storage_uri+fire_id inmutables (cadena de evidencia).';


-- =============================================================================
-- 3. Auditoría
-- =============================================================================

SELECT fn_audit_attach('fires');
SELECT fn_audit_attach('fire_documents');


-- La categoría 'fires' para notification_templates está declarada
-- centralmente en 13_notifications.sql. No reaplicar el CHECK aquí.
