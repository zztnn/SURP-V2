-- =============================================================================
-- SURP 2.0 — schema/17_vehicles_enrichment.sql
--
-- Vehicles enrichment — eleva los campos planos del legacy `Vehiculo` y
-- la tabla `VehiculoUsuarios` a entidades normalizadas:
--
--   1. vehicle_documents             Padrón RVM, certificados, fotos,
--                                    permisos de circulación, seguros, etc.
--                                    Reemplaza Vehiculo.Certificado /
--                                    ArchivoFile / AzureCertificado /
--                                    ArchivoDesbloqueo.
--   2. vehicle_associated_parties    Histórico N:N party↔vehicle con rol
--                                    (dueño actual, dueño anterior, conductor
--                                    habitual, autorizado, leasing, etc.).
--                                    Reemplaza VehiculoUsuarios + el campo
--                                    Vehiculo.PersonaId (que queda como
--                                    denormalización del owner_current).
--   3. vehicle_sightings             Avistamientos sueltos del vehículo
--                                    (entrada/salida de zona, paso por punto
--                                    de control) sin necesariamente generar
--                                    un incidente formal.
--
-- Marco legal — /legal-datos (Ley 21.719):
--   - Patente, marca, color y dueño son datos personales cuando vinculados
--     a procesos penales (art. 16). Sensibles si están en el contexto de
--     una causa, denuncia o bloqueo.
--   - source/confidence explícitos.
--   - Hard delete prohibido.
--   - is_biometric NO aplica a documentos de vehículo (no hay datos
--     biométricos en padrón); aplica solo si la foto incluye al conductor
--     y se procesa con reconocimiento facial → fuera de esta ola.
--
-- Engancha con:
--   - vehicles                       (FK)
--   - parties / natural_persons / legal_entities
--   - users (auditoría)
--   - security_guards                (vehicle_sightings.observed_by_guard_id)
--   - zones / properties             (denormalización geo)
--   - incidents                      (vehicle_sightings.incident_id si escaló)
-- =============================================================================


-- =============================================================================
-- 1. vehicle_documents — adjuntos del vehículo
-- =============================================================================
-- Mismo patrón que party_documents: storage abstraído + sha256 inmutable
-- (cadena de evidencia) + confidentiality 3 niveles.

CREATE TABLE vehicle_documents (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  vehicle_id          BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,

  document_type       VARCHAR(40) NOT NULL,

  storage_uri         TEXT NOT NULL,
  mime_type           VARCHAR(100) NOT NULL,
  size_bytes          BIGINT NOT NULL,
  sha256_hash         CHAR(64) NOT NULL,

  description         TEXT NULL,
  document_number     VARCHAR(80) NULL,           -- nro padrón, póliza, permiso
  issued_at           DATE NULL,
  expires_at          DATE NULL,
  issuing_authority   VARCHAR(200) NULL,

  confidentiality     VARCHAR(30) NOT NULL DEFAULT 'internal',

  source_description  TEXT NULL,
  captured_at         TIMESTAMPTZ NULL,
  captured_by_user_id BIGINT NULL REFERENCES users(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT vd_document_type_ck CHECK (document_type IN (
    'rvm_padron',              -- padrón Registro Civil RVM
    'rvm_certificate',          -- certificado RVM
    'circulation_permit',       -- permiso de circulación municipal
    'insurance',                -- póliza SOAP / seguro voluntario
    'technical_inspection',     -- revisión técnica
    'photo_front',              -- foto frontal (sin biometría)
    'photo_rear',
    'photo_side',
    'authorization_use',        -- autorización de uso de tercero
    'block_evidence',           -- legacy: doc sustento del bloqueo
    'unblock_evidence',         -- legacy: doc sustento del desbloqueo
    'court_document',           -- copia de documento judicial vinculado
    'other'
  )),
  CONSTRAINT vd_confidentiality_ck CHECK (confidentiality IN (
    'internal', 'sensitive', 'judicial_evidence'
  )),
  CONSTRAINT vd_size_positive_ck CHECK (size_bytes > 0),
  CONSTRAINT vd_sha256_format_ck CHECK (sha256_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT vd_dates_ck CHECK (
    expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at
  )
);

CREATE TRIGGER vehicle_documents_touch_updated_at
  BEFORE UPDATE ON vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido (cadena de evidencia + retención).
CREATE OR REPLACE FUNCTION fn_vehicle_documents_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'vehicle_documents: hard delete prohibido. Usar deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_documents_no_hard_delete
  BEFORE DELETE ON vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION fn_vehicle_documents_no_hard_delete();

-- sha256/size/storage_uri/vehicle_id inmutables (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_vehicle_documents_immutable_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash
     OR NEW.size_bytes  IS DISTINCT FROM OLD.size_bytes
     OR NEW.storage_uri IS DISTINCT FROM OLD.storage_uri THEN
    RAISE EXCEPTION 'vehicle_documents: sha256_hash, size_bytes y storage_uri son inmutables (cadena de evidencia).';
  END IF;
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    RAISE EXCEPTION 'vehicle_documents: vehicle_id es inmutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_documents_immutable_evidence
  BEFORE UPDATE ON vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION fn_vehicle_documents_immutable_evidence();

CREATE INDEX idx_vd_vehicle           ON vehicle_documents(vehicle_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_vd_document_type     ON vehicle_documents(document_type)  WHERE deleted_at IS NULL;
CREATE INDEX idx_vd_confidentiality   ON vehicle_documents(confidentiality) WHERE deleted_at IS NULL;
CREATE INDEX idx_vd_expires           ON vehicle_documents(expires_at)     WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX idx_vd_sha256            ON vehicle_documents(sha256_hash);

COMMENT ON TABLE vehicle_documents IS
  'Documentos digitales asociados a un vehículo (padrón RVM, permiso, seguro, foto). Storage abstraído por StorageService. sha256+size+storage_uri inmutables (cadena de evidencia).';


-- =============================================================================
-- 2. vehicle_associated_parties — N:N vehicle↔party con rol y vigencia
-- =============================================================================
-- Reemplaza VehiculoUsuarios legacy + extiende con rol semántico y source.
-- vehicles.owner_party_id queda como denormalización del association_type=
-- 'owner_current' activo (mantener sincronizado en capa app o trigger).

CREATE TABLE vehicle_associated_parties (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  vehicle_id          BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  party_id            BIGINT NOT NULL REFERENCES parties(id)  ON DELETE RESTRICT,

  association_type    VARCHAR(40) NOT NULL,
  source              VARCHAR(40) NOT NULL,
  source_description  TEXT NULL,
  confidence          VARCHAR(20) NOT NULL DEFAULT 'reported',

  valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE NULL,

  active              BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED,

  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT vap_association_type_ck CHECK (association_type IN (
    'owner_current',          -- dueño actual (RVM)
    'owner_previous',          -- dueño anterior (cambio de propietario)
    'habitual_driver',         -- conductor habitual
    'authorized_user',         -- autorizado a usar el vehículo
    'leasing_holder',          -- titular de leasing / contrato
    'sighted_in',              -- avistado dentro del vehículo (no necesariamente conduciendo)
    'sighted_driving',         -- avistado conduciendo
    'reported_user',           -- reportado por terceros como usuario
    'other'
  )),
  CONSTRAINT vap_source_ck CHECK (source IN (
    'rvm_official',            -- Registro Civil RVM
    'declared',                -- declarado por el party o terceros
    'observed',                -- observado por personal URP
    'reported',                -- reportado por terceros
    'inferred',                -- inferido (avistamiento contextual)
    'legacy'                   -- migrado del SURP legacy
  )),
  CONSTRAINT vap_confidence_ck CHECK (confidence IN (
    'verified', 'reported', 'suspected'
  )),
  CONSTRAINT vap_validity_ck CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TRIGGER vap_touch_updated_at
  BEFORE UPDATE ON vehicle_associated_parties
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_vap_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'vehicle_associated_parties: hard delete prohibido. Usar valid_to o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vap_no_hard_delete
  BEFORE DELETE ON vehicle_associated_parties
  FOR EACH ROW EXECUTE FUNCTION fn_vap_no_hard_delete();

-- vehicle_id, party_id, association_type inmutables (un cambio = nueva fila).
CREATE OR REPLACE FUNCTION fn_vap_immutable_keys()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.party_id IS DISTINCT FROM OLD.party_id
     OR NEW.association_type IS DISTINCT FROM OLD.association_type THEN
    RAISE EXCEPTION 'vehicle_associated_parties: vehicle_id, party_id y association_type son inmutables.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vap_immutable_keys
  BEFORE UPDATE ON vehicle_associated_parties
  FOR EACH ROW EXECUTE FUNCTION fn_vap_immutable_keys();

-- Solo un 'owner_current' activo por vehículo (regla RVM: dueño único).
CREATE UNIQUE INDEX idx_vap_one_owner_current_per_vehicle
  ON vehicle_associated_parties(vehicle_id)
  WHERE deleted_at IS NULL AND active = true AND association_type = 'owner_current';

-- Solo una asociación activa de un mismo (vehicle, party, association_type).
CREATE UNIQUE INDEX idx_vap_one_active_per_triple
  ON vehicle_associated_parties(vehicle_id, party_id, association_type)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX idx_vap_vehicle           ON vehicle_associated_parties(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vap_party             ON vehicle_associated_parties(party_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_vap_active_vehicle    ON vehicle_associated_parties(vehicle_id) WHERE deleted_at IS NULL AND active = true;
CREATE INDEX idx_vap_active_party      ON vehicle_associated_parties(party_id)   WHERE deleted_at IS NULL AND active = true;
CREATE INDEX idx_vap_association_type  ON vehicle_associated_parties(association_type) WHERE deleted_at IS NULL;

COMMENT ON TABLE vehicle_associated_parties IS
  'Histórico N:N party↔vehicle con rol semántico y vigencia. Solo un owner_current activo por vehículo. vehicles.owner_party_id es denormalización del owner_current activo.';


-- =============================================================================
-- 3. vehicle_sightings — avistamientos sueltos del vehículo
-- =============================================================================
-- Captura el momento en que el vehículo es visto sin que necesariamente se
-- abra un informe formal. Útil para reportería de patrullaje y trazabilidad.

CREATE TABLE vehicle_sightings (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  vehicle_id          BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,

  observed_at         TIMESTAMPTZ NOT NULL,
  location            geometry(Point, 4326) NOT NULL,
  -- Geo denormalizado por trigger (resolver desde location).
  zone_id             BIGINT NULL REFERENCES zones(id),
  property_id         BIGINT NULL REFERENCES properties(id),
  commune_id          BIGINT NULL REFERENCES communes(id),

  observed_plate      VARCHAR(10) NULL,         -- patente leída en terreno (puede diferir de vehicles.license_plate)
  speed_kmh           NUMERIC(6, 2) NULL,
  heading_deg         INT NULL,

  observation_method  VARCHAR(30) NOT NULL,
  observed_by_user_id BIGINT NULL REFERENCES users(id),
  observed_by_guard_id BIGINT NULL REFERENCES security_guards(id),

  description         TEXT NULL,
  source_description  TEXT NULL,

  -- Si el avistamiento escaló a incidente formal.
  generated_incident  BOOLEAN NOT NULL DEFAULT false,
  incident_id         BIGINT NULL REFERENCES incidents(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT vs_observation_method_ck CHECK (observation_method IN (
    'visual',                  -- vista directa por personal
    'patrol',                  -- durante rondín
    'camera',                  -- cámara de seguridad
    'gps_track',               -- detectado por GPS de un equipo
    'reported_by_third_party', -- reportado por tercero
    'other'
  )),
  CONSTRAINT vs_chile_bbox_ck CHECK (
    ST_X(location) BETWEEN -110 AND -66
    AND ST_Y(location) BETWEEN -90 AND -17
  ),
  CONSTRAINT vs_speed_nonneg_ck CHECK (speed_kmh IS NULL OR speed_kmh >= 0),
  CONSTRAINT vs_heading_range_ck CHECK (heading_deg IS NULL OR heading_deg BETWEEN 0 AND 359),
  CONSTRAINT vs_incident_consistency_ck CHECK (
    (generated_incident = false AND incident_id IS NULL)
    OR (generated_incident = true AND incident_id IS NOT NULL)
  ),
  CONSTRAINT vs_observer_consistency_ck CHECK (
    -- Al menos uno de los dos observadores debe estar (user URP o guard contratista).
    observed_by_user_id IS NOT NULL OR observed_by_guard_id IS NOT NULL
  )
);

CREATE TRIGGER vehicle_sightings_touch_updated_at
  BEFORE UPDATE ON vehicle_sightings
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Auto-resolver zone_id / property_id / commune_id desde location.
CREATE OR REPLACE FUNCTION fn_vehicle_sightings_resolve_geo()
RETURNS TRIGGER AS $$
BEGIN
  -- Property contiene location → zone se infiere desde property.
  IF NEW.property_id IS NULL THEN
    SELECT id INTO NEW.property_id
    FROM properties
    WHERE deleted_at IS NULL AND boundary IS NOT NULL
      AND ST_Contains(boundary, NEW.location)
    LIMIT 1;
  END IF;
  IF NEW.zone_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT zone_id INTO NEW.zone_id FROM properties WHERE id = NEW.property_id;
  END IF;
  IF NEW.zone_id IS NULL THEN
    SELECT id INTO NEW.zone_id
    FROM zones
    WHERE deleted_at IS NULL AND boundary IS NOT NULL
      AND ST_Contains(boundary, NEW.location)
    LIMIT 1;
  END IF;
  IF NEW.commune_id IS NULL THEN
    SELECT id INTO NEW.commune_id
    FROM communes
    WHERE geometry IS NOT NULL AND ST_Contains(geometry, NEW.location)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_sightings_resolve_geo
  BEFORE INSERT OR UPDATE OF location ON vehicle_sightings
  FOR EACH ROW EXECUTE FUNCTION fn_vehicle_sightings_resolve_geo();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_vehicle_sightings_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'vehicle_sightings: hard delete prohibido. Usar deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_sightings_no_hard_delete
  BEFORE DELETE ON vehicle_sightings
  FOR EACH ROW EXECUTE FUNCTION fn_vehicle_sightings_no_hard_delete();

-- vehicle_id y observed_at inmutables (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_vehicle_sightings_immutable_keys()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
    RAISE EXCEPTION 'vehicle_sightings: vehicle_id y observed_at son inmutables.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_sightings_immutable_keys
  BEFORE UPDATE ON vehicle_sightings
  FOR EACH ROW EXECUTE FUNCTION fn_vehicle_sightings_immutable_keys();

CREATE INDEX idx_vs_vehicle          ON vehicle_sightings(vehicle_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_vs_observed_desc    ON vehicle_sightings(observed_at DESC)  WHERE deleted_at IS NULL;
CREATE INDEX idx_vs_zone             ON vehicle_sightings(zone_id)           WHERE deleted_at IS NULL AND zone_id IS NOT NULL;
CREATE INDEX idx_vs_property         ON vehicle_sightings(property_id)       WHERE deleted_at IS NULL AND property_id IS NOT NULL;
CREATE INDEX idx_vs_commune          ON vehicle_sightings(commune_id)        WHERE deleted_at IS NULL AND commune_id IS NOT NULL;
CREATE INDEX idx_vs_method           ON vehicle_sightings(observation_method) WHERE deleted_at IS NULL;
CREATE INDEX idx_vs_incident         ON vehicle_sightings(incident_id)       WHERE deleted_at IS NULL AND incident_id IS NOT NULL;
CREATE INDEX idx_vs_location_gix     ON vehicle_sightings USING GIST (location);
CREATE INDEX idx_vs_observed_plate   ON vehicle_sightings(observed_plate)    WHERE deleted_at IS NULL AND observed_plate IS NOT NULL;

COMMENT ON TABLE vehicle_sightings IS
  'Avistamientos sueltos del vehículo sin generar incidente formal. zone_id/property_id/commune_id se autoresuelven desde location. observed_plate puede diferir de vehicles.license_plate (registro forense).';


-- =============================================================================
-- 4. Auditoría
-- =============================================================================

SELECT fn_audit_attach('vehicle_documents');
SELECT fn_audit_attach('vehicle_associated_parties');
SELECT fn_audit_attach('vehicle_sightings');
