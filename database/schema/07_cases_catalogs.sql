-- =============================================================================
-- SURP 2.0 — schema/07_cases_catalogs.sql
--
-- Módulo cases — capa de catálogos y actores procesales:
--
--   Actores híbridos (seed + on-the-fly + normalización):
--     - courts                  Tribunales
--     - prosecutor_offices      Fiscalías locales/regionales del MP
--     - prosecutors             Fiscales
--
--   Catálogos fijos del sistema (is_system=true protegido):
--     - case_matters            Materias (penal/civil/admin/constitucional)
--     - case_milestone_types    Tipos de hito procesal (~55)
--     - case_hearing_types      Tipos de audiencia (12)
--     - case_resolution_types   Tipos de resolución (10)
--     - case_appeal_types       Tipos de recurso (6)
--     - case_party_roles        Roles procesales (15)
--     - case_attorney_roles     Roles del abogado en la causa (5)
--     - case_document_types     Tipos de documento (8)
--
-- Referencia: CASES-MODULE-VISION.md §3.
-- =============================================================================


-- =============================================================================
-- 1. courts
-- =============================================================================

CREATE TABLE courts (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                     VARCHAR(50) NULL,
  name                     VARCHAR(200) NOT NULL,
  court_type               VARCHAR(40) NOT NULL,
  commune_id               BIGINT NULL REFERENCES communes(id),
  region_code              VARCHAR(10) NULL,
  jurisdiction_notes       TEXT NULL,
  pjud_estado_diario_url   TEXT NULL,
  is_normalized            BOOLEAN NOT NULL DEFAULT false,
  is_system                BOOLEAN NOT NULL DEFAULT false,
  active                   BOOLEAN NOT NULL DEFAULT true,
  normalized_by_id         BIGINT NULL REFERENCES users(id),
  normalized_at            TIMESTAMPTZ NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT courts_type_ck CHECK (court_type IN (
    'juzgado_garantia',
    'tribunal_oral_penal',
    'corte_apelaciones',
    'corte_suprema',
    'juzgado_letras_civil',
    'juzgado_letras_trabajo',
    'juzgado_familia',
    'contencioso_administrativo',
    'tribunal_constitucional',
    'otro'
  )),
  CONSTRAINT courts_normalization_consistency_ck CHECK (
    (is_normalized = true  AND normalized_by_id IS NOT NULL AND normalized_at IS NOT NULL) OR
    (is_normalized = false AND normalized_by_id IS NULL     AND normalized_at IS NULL)
  ),
  CONSTRAINT courts_system_requires_normalized_ck CHECK (
    is_system = false OR is_normalized = true
  )
);

CREATE TRIGGER courts_touch_updated_at
  BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Autocompletar region_code desde commune
CREATE OR REPLACE FUNCTION fn_courts_resolve_region_code()
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

CREATE TRIGGER courts_resolve_region
  BEFORE INSERT OR UPDATE OF commune_id ON courts
  FOR EACH ROW EXECUTE FUNCTION fn_courts_resolve_region_code();

-- Protección de filas is_system (no se eliminan, no se pueden desmarcar)
CREATE OR REPLACE FUNCTION fn_courts_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'courts: no se puede eliminar tribunal del sistema (is_system=true). Usar active=false.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'courts: no se puede desmarcar is_system en tribunal del sistema';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER courts_protect_system
  BEFORE UPDATE OR DELETE ON courts
  FOR EACH ROW EXECUTE FUNCTION fn_courts_protect_system();

CREATE INDEX idx_courts_type           ON courts(court_type)     WHERE deleted_at IS NULL;
CREATE INDEX idx_courts_region         ON courts(region_code)    WHERE deleted_at IS NULL;
CREATE INDEX idx_courts_normalized     ON courts(is_normalized)  WHERE deleted_at IS NULL;
CREATE INDEX idx_courts_commune        ON courts(commune_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_courts_name_trgm
  ON courts USING gin (fn_immutable_unaccent(name) gin_trgm_ops);

-- Un tribunal normalizado es único por (name, commune). Los no normalizados se
-- aceptan duplicados (serán fusionados en proceso de normalización).
CREATE UNIQUE INDEX idx_courts_name_commune_uq
  ON courts (lower(fn_immutable_unaccent(name)), commune_id)
  WHERE deleted_at IS NULL AND is_normalized = true;

COMMENT ON TABLE courts IS 'Tribunales. Catálogo híbrido: seed mínimo (4 regiones Arauco) + entrada on-the-fly (is_normalized=false) + normalización manual por Abogado Administrador. Scrape PJUD post-MVP.';


-- =============================================================================
-- 2. prosecutor_offices (fiscalías)
-- =============================================================================

CREATE TABLE prosecutor_offices (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name                VARCHAR(200) NOT NULL,
  office_type         VARCHAR(30) NOT NULL,
  commune_id          BIGINT NULL REFERENCES communes(id),
  region_code         VARCHAR(10) NULL,
  parent_office_id    BIGINT NULL REFERENCES prosecutor_offices(id),
  is_normalized       BOOLEAN NOT NULL DEFAULT false,
  is_system           BOOLEAN NOT NULL DEFAULT false,
  active              BOOLEAN NOT NULL DEFAULT true,
  normalized_by_id    BIGINT NULL REFERENCES users(id),
  normalized_at       TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT po_type_ck CHECK (office_type IN (
    'fiscalia_local',
    'fiscalia_regional',
    'fiscalia_nacional',
    'unidad_especializada'
  )),
  CONSTRAINT po_normalization_consistency_ck CHECK (
    (is_normalized = true  AND normalized_by_id IS NOT NULL AND normalized_at IS NOT NULL) OR
    (is_normalized = false AND normalized_by_id IS NULL     AND normalized_at IS NULL)
  ),
  CONSTRAINT po_system_requires_normalized_ck CHECK (
    is_system = false OR is_normalized = true
  ),
  CONSTRAINT po_no_self_parent_ck CHECK (parent_office_id IS NULL OR parent_office_id <> id)
);

CREATE TRIGGER po_touch_updated_at
  BEFORE UPDATE ON prosecutor_offices
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE OR REPLACE FUNCTION fn_po_resolve_region_code()
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

CREATE TRIGGER po_resolve_region
  BEFORE INSERT OR UPDATE OF commune_id ON prosecutor_offices
  FOR EACH ROW EXECUTE FUNCTION fn_po_resolve_region_code();

CREATE OR REPLACE FUNCTION fn_po_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'prosecutor_offices: no se puede eliminar fiscalía del sistema';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'prosecutor_offices: no se puede desmarcar is_system';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER po_protect_system
  BEFORE UPDATE OR DELETE ON prosecutor_offices
  FOR EACH ROW EXECUTE FUNCTION fn_po_protect_system();

CREATE INDEX idx_po_type       ON prosecutor_offices(office_type)    WHERE deleted_at IS NULL;
CREATE INDEX idx_po_region     ON prosecutor_offices(region_code)    WHERE deleted_at IS NULL;
CREATE INDEX idx_po_commune    ON prosecutor_offices(commune_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_po_parent     ON prosecutor_offices(parent_office_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_po_normalized ON prosecutor_offices(is_normalized)  WHERE deleted_at IS NULL;
CREATE INDEX idx_po_name_trgm
  ON prosecutor_offices USING gin (fn_immutable_unaccent(name) gin_trgm_ops);

CREATE UNIQUE INDEX idx_po_name_commune_uq
  ON prosecutor_offices (lower(fn_immutable_unaccent(name)), commune_id)
  WHERE deleted_at IS NULL AND is_normalized = true;

COMMENT ON TABLE prosecutor_offices IS 'Fiscalías del Ministerio Público. Misma política híbrida que courts.';


-- =============================================================================
-- 3. prosecutors (fiscales)
-- =============================================================================

CREATE TABLE prosecutors (
  id                      BIGSERIAL PRIMARY KEY,
  external_id             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  party_id                BIGINT NULL REFERENCES parties(id),
  full_name               VARCHAR(200) NOT NULL,
  prosecutor_office_id    BIGINT NOT NULL REFERENCES prosecutor_offices(id),
  email                   d_email NULL,
  phone                   d_phone_cl NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  is_normalized           BOOLEAN NOT NULL DEFAULT false,
  is_system               BOOLEAN NOT NULL DEFAULT false,
  normalized_by_id        BIGINT NULL REFERENCES users(id),
  normalized_at           TIMESTAMPTZ NULL,
  notes                   TEXT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id           BIGINT NULL REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id           BIGINT NULL REFERENCES users(id),
  deleted_at              TIMESTAMPTZ NULL,
  deleted_by_id           BIGINT NULL REFERENCES users(id),

  CONSTRAINT prosecutors_normalization_consistency_ck CHECK (
    (is_normalized = true  AND normalized_by_id IS NOT NULL AND normalized_at IS NOT NULL) OR
    (is_normalized = false AND normalized_by_id IS NULL     AND normalized_at IS NULL)
  )
);

CREATE TRIGGER prosecutors_touch_updated_at
  BEFORE UPDATE ON prosecutors
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE OR REPLACE FUNCTION fn_prosecutors_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'prosecutors: no se puede eliminar fiscal del sistema';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'prosecutors: no se puede desmarcar is_system';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prosecutors_protect_system
  BEFORE UPDATE OR DELETE ON prosecutors
  FOR EACH ROW EXECUTE FUNCTION fn_prosecutors_protect_system();

CREATE INDEX idx_prosecutors_office     ON prosecutors(prosecutor_office_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_prosecutors_party      ON prosecutors(party_id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_prosecutors_active     ON prosecutors(is_active)            WHERE deleted_at IS NULL;
CREATE INDEX idx_prosecutors_normalized ON prosecutors(is_normalized)        WHERE deleted_at IS NULL;
CREATE INDEX idx_prosecutors_name_trgm
  ON prosecutors USING gin (fn_immutable_unaccent(full_name) gin_trgm_ops);

-- Unicidad de fiscal normalizado por (fiscalía, nombre canonical). Los no
-- normalizados aceptan duplicados — se fusionan al normalizar.
CREATE UNIQUE INDEX idx_prosecutors_unique_in_office
  ON prosecutors (prosecutor_office_id, lower(fn_immutable_unaccent(full_name)))
  WHERE deleted_at IS NULL AND is_normalized = true;

COMMENT ON TABLE prosecutors IS 'Fiscales del Ministerio Público. party_id opcional (no siempre se tiene RUT). Misma política híbrida.';


-- =============================================================================
-- 4. case_matters (catálogo fijo — 4 materias)
-- =============================================================================

CREATE TABLE case_matters (
  id            BIGSERIAL PRIMARY KEY,
  external_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code          VARCHAR(30) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT NULL,
  order_index   INT NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER case_matters_touch_updated_at
  BEFORE UPDATE ON case_matters
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_matters_protect_system
  BEFORE UPDATE OR DELETE ON case_matters
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 5. case_milestone_types
-- =============================================================================

CREATE TABLE case_milestone_types (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                     VARCHAR(60) NOT NULL UNIQUE,
  name                     VARCHAR(150) NOT NULL,
  description              TEXT NULL,
  category                 VARCHAR(30) NOT NULL,
  applicable_to_matter     VARCHAR(30) NULL,
  auto_advances_stage_to   VARCHAR(40) NULL,
  order_index              INT NOT NULL DEFAULT 0,
  is_system                BOOLEAN NOT NULL DEFAULT false,
  active                   BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT case_milestone_types_category_ck CHECK (category IN (
    'judicial', 'fiscalia', 'administrativo', 'interno_arauco', 'otros'
  )),
  CONSTRAINT case_milestone_types_matter_ck CHECK (
    applicable_to_matter IS NULL OR applicable_to_matter IN ('PENAL', 'CIVIL', 'ADMIN', 'CONST')
  ),
  CONSTRAINT case_milestone_types_stage_ck CHECK (
    auto_advances_stage_to IS NULL OR auto_advances_stage_to IN (
      'investigation_unformalized',
      'investigation_formalized',
      'accusation',
      'oral_trial_prep',
      'oral_trial',
      'sentence',
      'appeal',
      'cassation',
      'execution',
      'closed'
    )
  )
);

CREATE TRIGGER case_milestone_types_touch_updated_at
  BEFORE UPDATE ON case_milestone_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_milestone_types_protect_system
  BEFORE UPDATE OR DELETE ON case_milestone_types
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();

CREATE INDEX idx_case_milestone_types_category ON case_milestone_types(category);
CREATE INDEX idx_case_milestone_types_matter   ON case_milestone_types(applicable_to_matter);


-- =============================================================================
-- 6. case_hearing_types
-- =============================================================================

CREATE TABLE case_hearing_types (
  id                     BIGSERIAL PRIMARY KEY,
  external_id            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                   VARCHAR(40) NOT NULL UNIQUE,
  name                   VARCHAR(150) NOT NULL,
  description            TEXT NULL,
  applicable_to_matter   VARCHAR(30) NULL,
  order_index            INT NOT NULL DEFAULT 0,
  is_system              BOOLEAN NOT NULL DEFAULT false,
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT case_hearing_types_matter_ck CHECK (
    applicable_to_matter IS NULL OR applicable_to_matter IN ('PENAL', 'CIVIL', 'ADMIN', 'CONST')
  )
);

CREATE TRIGGER case_hearing_types_touch_updated_at
  BEFORE UPDATE ON case_hearing_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_hearing_types_protect_system
  BEFORE UPDATE OR DELETE ON case_hearing_types
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 7. case_resolution_types
-- =============================================================================

CREATE TABLE case_resolution_types (
  id                        BIGSERIAL PRIMARY KEY,
  external_id               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                      VARCHAR(40) NOT NULL UNIQUE,
  name                      VARCHAR(150) NOT NULL,
  description               TEXT NULL,
  is_appealable             BOOLEAN NOT NULL DEFAULT false,
  is_subject_to_replevin    BOOLEAN NOT NULL DEFAULT false,
  is_subject_to_nullity     BOOLEAN NOT NULL DEFAULT false,
  order_index               INT NOT NULL DEFAULT 0,
  is_system                 BOOLEAN NOT NULL DEFAULT false,
  active                    BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER case_resolution_types_touch_updated_at
  BEFORE UPDATE ON case_resolution_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_resolution_types_protect_system
  BEFORE UPDATE OR DELETE ON case_resolution_types
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 8. case_appeal_types
-- =============================================================================

CREATE TABLE case_appeal_types (
  id                     BIGSERIAL PRIMARY KEY,
  external_id            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                   VARCHAR(30) NOT NULL UNIQUE,
  name                   VARCHAR(150) NOT NULL,
  description            TEXT NULL,
  applicable_against     TEXT NULL,
  order_index            INT NOT NULL DEFAULT 0,
  is_system              BOOLEAN NOT NULL DEFAULT false,
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER case_appeal_types_touch_updated_at
  BEFORE UPDATE ON case_appeal_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_appeal_types_protect_system
  BEFORE UPDATE OR DELETE ON case_appeal_types
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 9. case_party_roles
-- =============================================================================

CREATE TABLE case_party_roles (
  id                     BIGSERIAL PRIMARY KEY,
  external_id            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                   VARCHAR(40) NOT NULL UNIQUE,
  name                   VARCHAR(150) NOT NULL,
  description            TEXT NULL,
  applicable_to_matter   VARCHAR(30) NULL,
  is_defendant           BOOLEAN NOT NULL DEFAULT false,
  order_index            INT NOT NULL DEFAULT 0,
  is_system              BOOLEAN NOT NULL DEFAULT false,
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT case_party_roles_matter_ck CHECK (
    applicable_to_matter IS NULL OR applicable_to_matter IN ('PENAL', 'CIVIL', 'ADMIN', 'CONST')
  )
);

CREATE TRIGGER case_party_roles_touch_updated_at
  BEFORE UPDATE ON case_party_roles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_party_roles_protect_system
  BEFORE UPDATE OR DELETE ON case_party_roles
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 10. case_attorney_roles
-- =============================================================================

CREATE TABLE case_attorney_roles (
  id            BIGSERIAL PRIMARY KEY,
  external_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code          VARCHAR(30) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT NULL,
  order_index   INT NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER case_attorney_roles_touch_updated_at
  BEFORE UPDATE ON case_attorney_roles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_attorney_roles_protect_system
  BEFORE UPDATE OR DELETE ON case_attorney_roles
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 11. case_document_types
-- =============================================================================

CREATE TABLE case_document_types (
  id            BIGSERIAL PRIMARY KEY,
  external_id   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code          VARCHAR(40) NOT NULL UNIQUE,
  name          VARCHAR(150) NOT NULL,
  description   TEXT NULL,
  is_evidence   BOOLEAN NOT NULL DEFAULT false,
  is_sensitive  BOOLEAN NOT NULL DEFAULT false,
  order_index   INT NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER case_document_types_touch_updated_at
  BEFORE UPDATE ON case_document_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER case_document_types_protect_system
  BEFORE UPDATE OR DELETE ON case_document_types
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();


-- =============================================================================
-- 12. Auditoría
-- =============================================================================

SELECT fn_audit_attach('courts');
SELECT fn_audit_attach('prosecutor_offices');
SELECT fn_audit_attach('prosecutors');
SELECT fn_audit_attach('case_matters');
SELECT fn_audit_attach('case_milestone_types');
SELECT fn_audit_attach('case_hearing_types');
SELECT fn_audit_attach('case_resolution_types');
SELECT fn_audit_attach('case_appeal_types');
SELECT fn_audit_attach('case_party_roles');
SELECT fn_audit_attach('case_attorney_roles');
SELECT fn_audit_attach('case_document_types');
