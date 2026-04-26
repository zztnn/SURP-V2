-- =============================================================================
-- SURP 2.0 — schema/12_complaints.sql
--
-- Módulo complaints — denuncias formales ante autoridades:
--
--   Tabla híbrida (seed + on-the-fly + normalización):
--     - police_units              Comisarías, subcomisarías, retenes,
--                                 brigadas PDI. Misma política que courts/
--                                 prosecutor_offices.
--
--   Núcleo:
--     - complaints                Denuncia presentada ante autoridad
--     - complaint_persons         N:N denuncia ↔ party con rol procesal
--                                 (denunciante / imputado / testigo / víctima)
--     - complaint_vehicles        N:N denuncia ↔ vehículo con metadata
--                                 de incautación
--
--   Vinculación:
--     - case_complaints           N:N causa ↔ denuncia (corrige el N:1 legacy)
--
-- Invariantes (CPP arts. 173-178, /legal-procesal):
--   - Denuncia debe tener `incident_id` O `external_incident_description`
--     (denuncia de incidente externo no registrado en SURP). XOR enforce.
--   - `institution_code` enum: carabineros / pdi / fiscalia / otros.
--   - Si institution=carabineros|pdi → police_unit_id puede llenarse.
--   - Si institution=fiscalia → prosecutor_office_id puede llenarse.
--   - Hard delete prohibido (mismo patrón que cases/incidents).
--   - complaint_persons: máximo 1 denunciante por denuncia (rol DENUNCIANTE
--     único; un mismo party puede ser denunciante en N denuncias distintas).
--   - complaint_vehicles: si seized=true → seized_at NOT NULL;
--                         si returned=true → seized=true AND returned_at NOT NULL.
-- =============================================================================


-- =============================================================================
-- 1. police_units (Carabineros / PDI / otros uniformados)
-- =============================================================================

CREATE TABLE police_units (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name                VARCHAR(200) NOT NULL,
  unit_type           VARCHAR(40) NOT NULL,
  institution         VARCHAR(20) NOT NULL,
  commune_id          BIGINT NULL REFERENCES communes(id),
  region_code         VARCHAR(10) NULL,
  parent_unit_id      BIGINT NULL REFERENCES police_units(id),
  is_normalized       BOOLEAN NOT NULL DEFAULT false,
  is_system           BOOLEAN NOT NULL DEFAULT false,
  active              BOOLEAN NOT NULL DEFAULT true,
  normalized_by_id    BIGINT NULL REFERENCES users(id),
  normalized_at       TIMESTAMPTZ NULL,
  notes               TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT pu_unit_type_ck CHECK (unit_type IN (
    'comisaria', 'subcomisaria', 'tenencia', 'reten',
    'prefectura', 'brigada_pdi', 'comisaria_judicial',
    'cuartel', 'oficina', 'otro'
  )),
  CONSTRAINT pu_institution_ck CHECK (institution IN (
    'carabineros', 'pdi', 'gendarmeria', 'fuerzas_especiales', 'otra'
  )),
  CONSTRAINT pu_normalization_consistency_ck CHECK (
    (is_normalized = true  AND normalized_by_id IS NOT NULL AND normalized_at IS NOT NULL) OR
    (is_normalized = false AND normalized_by_id IS NULL     AND normalized_at IS NULL)
  ),
  CONSTRAINT pu_system_requires_normalized_ck CHECK (
    is_system = false OR is_normalized = true
  ),
  CONSTRAINT pu_no_self_parent_ck CHECK (parent_unit_id IS NULL OR parent_unit_id <> id)
);

CREATE TRIGGER pu_touch_updated_at
  BEFORE UPDATE ON police_units
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Autoresolver region_code desde commune
CREATE OR REPLACE FUNCTION fn_pu_resolve_region_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commune_id IS NOT NULL AND NEW.region_code IS NULL THEN
    SELECT r.iso_3166_2 INTO NEW.region_code
    FROM communes c
    JOIN regions r ON r.id = c.region_id
    WHERE c.id = NEW.commune_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pu_resolve_region
  BEFORE INSERT OR UPDATE OF commune_id ON police_units
  FOR EACH ROW EXECUTE FUNCTION fn_pu_resolve_region_code();

-- Protección de filas is_system
CREATE OR REPLACE FUNCTION fn_pu_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'police_units: no se puede eliminar unidad del sistema';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'police_units: no se puede desmarcar is_system';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pu_protect_system
  BEFORE UPDATE OR DELETE ON police_units
  FOR EACH ROW EXECUTE FUNCTION fn_pu_protect_system();

CREATE INDEX idx_pu_institution    ON police_units(institution)    WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_unit_type      ON police_units(unit_type)      WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_region         ON police_units(region_code)    WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_commune        ON police_units(commune_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_parent         ON police_units(parent_unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_normalized     ON police_units(is_normalized)  WHERE deleted_at IS NULL;
CREATE INDEX idx_pu_name_trgm
  ON police_units USING gin (fn_immutable_unaccent(name) gin_trgm_ops);

CREATE UNIQUE INDEX idx_pu_name_commune_uq
  ON police_units (lower(fn_immutable_unaccent(name)), commune_id)
  WHERE deleted_at IS NULL AND is_normalized = true;

COMMENT ON TABLE police_units IS 'Unidades policiales (comisarías Carabineros, brigadas PDI, retenes, etc.). Política híbrida: seed mínimo + on-the-fly + scrape post-MVP de fuentes Carabineros/PDI.';


-- =============================================================================
-- 2. complaints
-- =============================================================================

CREATE TABLE complaints (
  id                              BIGSERIAL PRIMARY KEY,
  external_id                     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  -- Vinculación con incidente (XOR con descripción externa)
  incident_id                     BIGINT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  external_incident_description   TEXT NULL,

  -- Identificadores oficiales
  complaint_number                VARCHAR(80) NOT NULL,

  -- Institución y unidad receptora
  institution                     VARCHAR(20) NOT NULL,
  police_unit_id                  BIGINT NULL REFERENCES police_units(id),
  prosecutor_office_id            BIGINT NULL REFERENCES prosecutor_offices(id),

  -- Quién denunció (party representando a Arauco o tercero)
  filed_at                        TIMESTAMPTZ NOT NULL,
  filed_by_user_id                BIGINT NULL REFERENCES users(id),

  -- Seguimiento procesal por URP
  penal_followup                  BOOLEAN NOT NULL DEFAULT false,
  penal_followup_started_at       TIMESTAMPTZ NULL,
  formalization_date              TIMESTAMPTZ NULL,

  -- Resumen y notas
  summary                         TEXT NULL,
  internal_notes                  TEXT NULL,

  -- Estado funcional
  state                           VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Auditoría
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                   BIGINT NULL REFERENCES users(id),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                   BIGINT NULL REFERENCES users(id),
  deleted_at                      TIMESTAMPTZ NULL,
  deleted_by_id                   BIGINT NULL REFERENCES users(id),

  CONSTRAINT complaints_institution_ck CHECK (institution IN (
    'carabineros', 'pdi', 'fiscalia', 'tribunal', 'otra'
  )),
  CONSTRAINT complaints_state_ck CHECK (state IN (
    'active', 'superseded', 'cancelled'
  )),
  -- XOR: incident_id O external_incident_description, no ambos ni ninguno
  CONSTRAINT complaints_incident_xor_external_ck CHECK (
    (incident_id IS NOT NULL AND external_incident_description IS NULL) OR
    (incident_id IS NULL     AND external_incident_description IS NOT NULL)
  ),
  -- Si institution = carabineros/pdi, police_unit_id puede estar
  -- Si institution = fiscalia, prosecutor_office_id puede estar
  -- (Validación blanda — no obliga a tener la unidad/oficina)
  CONSTRAINT complaints_followup_consistency_ck CHECK (
    (penal_followup = false AND penal_followup_started_at IS NULL) OR
    (penal_followup = true  AND penal_followup_started_at IS NOT NULL)
  )
);

CREATE TRIGGER complaints_touch_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido
CREATE OR REPLACE FUNCTION fn_complaints_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'complaints: hard delete prohibido. Usar UPDATE deleted_at = now() o state=cancelled.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER complaints_no_hard_delete
  BEFORE DELETE ON complaints
  FOR EACH ROW EXECUTE FUNCTION fn_complaints_no_hard_delete();

-- complaint_number único por (institution, complaint_number) — la URP puede
-- tener el mismo número de parte en distintas instituciones.
CREATE UNIQUE INDEX idx_complaints_number_per_institution
  ON complaints (institution, complaint_number)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_complaints_incident          ON complaints(incident_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_institution       ON complaints(institution)          WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_police_unit       ON complaints(police_unit_id)       WHERE deleted_at IS NULL AND police_unit_id IS NOT NULL;
CREATE INDEX idx_complaints_prosecutor_office ON complaints(prosecutor_office_id) WHERE deleted_at IS NULL AND prosecutor_office_id IS NOT NULL;
CREATE INDEX idx_complaints_filed_at          ON complaints(filed_at DESC)        WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_followup          ON complaints(penal_followup)       WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_state             ON complaints(state)                WHERE deleted_at IS NULL;

COMMENT ON TABLE complaints IS 'Denuncia formal ante autoridad. CPP arts. 173-178. Una denuncia puede no tener incident_id si el hecho denunciado no fue registrado como incidente del SURP (incidente externo / colaborativo).';


-- =============================================================================
-- 3. complaint_persons (N:N party ↔ complaint con rol procesal)
-- =============================================================================

CREATE TABLE complaint_persons (
  complaint_id            BIGINT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  party_id                BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  role_code               VARCHAR(40) NOT NULL,

  -- Solo aplica a IMPUTADO / DENUNCIADO_INCERTUS
  armed_at_arrest         BOOLEAN NULL,
  arrest_control_at       TIMESTAMPTZ NULL,
  alias                   VARCHAR(100) NULL,
  gang_name               VARCHAR(100) NULL,
  precautionary_measure   VARCHAR(40) NULL,

  is_identified           BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id           BIGINT NULL REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id           BIGINT NULL REFERENCES users(id),

  PRIMARY KEY (complaint_id, party_id, role_code),

  CONSTRAINT complaint_persons_role_ck CHECK (role_code IN (
    'DENUNCIANTE', 'IMPUTADO', 'TESTIGO', 'VICTIMA', 'DENUNCIADO_INCERTUS'
  )),
  CONSTRAINT complaint_persons_measure_ck CHECK (
    precautionary_measure IS NULL OR precautionary_measure IN (
      'sin_cautelar',
      'prision_preventiva',
      'arresto_domiciliario_total',
      'arresto_domiciliario_nocturno',
      'firma_periodica',
      'arraigo_nacional',
      'prohibicion_acercarse_predio',
      'prohibicion_acercarse_victima',
      'otros'
    )
  )
);

CREATE TRIGGER complaint_persons_touch_updated_at
  BEFORE UPDATE ON complaint_persons
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: is_identified=false solo válido para IMPUTADO o DENUNCIADO_INCERTUS
CREATE OR REPLACE FUNCTION fn_complaint_persons_validate_identification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_identified = false AND NEW.role_code NOT IN ('IMPUTADO', 'DENUNCIADO_INCERTUS') THEN
    RAISE EXCEPTION 'complaint_persons: is_identified=false solo se admite para IMPUTADO o DENUNCIADO_INCERTUS (rol: %)', NEW.role_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER complaint_persons_validate_identification
  BEFORE INSERT OR UPDATE ON complaint_persons
  FOR EACH ROW EXECUTE FUNCTION fn_complaint_persons_validate_identification();

-- 1 solo DENUNCIANTE por denuncia
CREATE UNIQUE INDEX idx_complaint_persons_one_denunciante
  ON complaint_persons (complaint_id)
  WHERE role_code = 'DENUNCIANTE';

CREATE INDEX idx_complaint_persons_party ON complaint_persons(party_id);
CREATE INDEX idx_complaint_persons_role  ON complaint_persons(role_code);

COMMENT ON TABLE complaint_persons IS 'Personas vinculadas a la denuncia con rol procesal. PK compuesta permite mismo party con N roles. Máximo 1 DENUNCIANTE por denuncia (partial unique).';


-- =============================================================================
-- 4. complaint_vehicles (N:N vehículo ↔ complaint con incautación)
-- =============================================================================

CREATE TABLE complaint_vehicles (
  complaint_id           BIGINT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  vehicle_id             BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,

  controlled             BOOLEAN NOT NULL DEFAULT false,
  seized                 BOOLEAN NOT NULL DEFAULT false,
  seized_at              TIMESTAMPTZ NULL,
  not_seized_reason      TEXT NULL,

  returned               BOOLEAN NOT NULL DEFAULT false,
  returned_at            TIMESTAMPTZ NULL,

  notes                  TEXT NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id          BIGINT NULL REFERENCES users(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id          BIGINT NULL REFERENCES users(id),

  PRIMARY KEY (complaint_id, vehicle_id),

  CONSTRAINT complaint_vehicles_seizure_consistency_ck CHECK (
    (seized = true  AND seized_at IS NOT NULL) OR
    (seized = false AND seized_at IS NULL)
  ),
  CONSTRAINT complaint_vehicles_return_requires_seizure_ck CHECK (
    returned = false OR (seized = true AND returned_at IS NOT NULL)
  ),
  CONSTRAINT complaint_vehicles_returned_after_seized_ck CHECK (
    returned_at IS NULL OR seized_at IS NULL OR returned_at >= seized_at
  )
);

CREATE TRIGGER complaint_vehicles_touch_updated_at
  BEFORE UPDATE ON complaint_vehicles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_complaint_vehicles_vehicle    ON complaint_vehicles(vehicle_id);
CREATE INDEX idx_complaint_vehicles_seized     ON complaint_vehicles(seized);
CREATE INDEX idx_complaint_vehicles_pending_return
  ON complaint_vehicles(seized_at)
  WHERE seized = true AND returned = false;

COMMENT ON TABLE complaint_vehicles IS 'Vehículos involucrados en la denuncia. Si seized=true, requiere seized_at. Si returned=true, requiere haber sido incautado y returned_at.';


-- =============================================================================
-- 5. case_complaints (N:N causa ↔ denuncia)
-- =============================================================================

CREATE TABLE case_complaints (
  case_id          BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  complaint_id     BIGINT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by_id     BIGINT NULL REFERENCES users(id),
  link_reason      TEXT NULL,

  PRIMARY KEY (case_id, complaint_id)
);

CREATE INDEX idx_case_complaints_complaint ON case_complaints(complaint_id);

COMMENT ON TABLE case_complaints IS 'Vinculación N:N entre causas y denuncias. Una causa puede agrupar denuncias múltiples (ej. mismo modus operandi); una denuncia puede generar más de una causa (separación procesal).';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('police_units');
SELECT fn_audit_attach('complaints');
SELECT fn_audit_attach('complaint_persons',  'complaint_id');
SELECT fn_audit_attach('complaint_vehicles', 'complaint_id');
SELECT fn_audit_attach('case_complaints',    'case_id');
