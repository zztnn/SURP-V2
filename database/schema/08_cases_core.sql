-- =============================================================================
-- SURP 2.0 — schema/08_cases_core.sql
--
-- Módulo cases — núcleo:
--
--   - case_sequences        Secuencia atómica del correlativo CAU-{YYYY}-{NNNNN}
--   - cases                 La causa judicial (penal / civil / admin / const)
--   - case_incidents        Vinculación N:N causa ↔ incidente (opcional)
--   - case_parties          Personas/entidades vinculadas con rol procesal
--   - case_attorneys        Asignación N:N abogado ↔ causa con rango temporal
--
-- Invariantes clave (CASES-MODULE-VISION.md §2.1-2.4):
--   - internal_code immutable post-INSERT (trigger)
--   - hard delete prohibido (solo soft delete via deleted_at)
--   - closure_form requerido si state = 'closed'
--   - prosecutor_office_id requerido si matter = 'PENAL'
--   - Una causa debe tener exactamente 1 abogado role='TITULAR' vigente
--   - attorney_user_id debe ser user de organización principal (Arauco)
--   - case_parties: mismo party puede tener N roles en N causas (PK compuesta)
--
-- FKs hacia case_documents (Ola 4) se agregarán via ALTER TABLE en Ola 4.
-- =============================================================================


-- =============================================================================
-- 1. case_sequences — contador atómico del correlativo
-- =============================================================================

CREATE TABLE case_sequences (
  year         SMALLINT PRIMARY KEY,
  last_number  INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT case_sequences_year_ck CHECK (year BETWEEN 2000 AND 2099),
  CONSTRAINT case_sequences_number_positive_ck CHECK (last_number >= 0)
);

COMMENT ON TABLE case_sequences IS 'Secuencia atómica anual del correlativo de causas. INSERT … ON CONFLICT DO UPDATE garantiza atomicidad sin gaps.';


-- =============================================================================
-- 2. cases
-- =============================================================================

CREATE TABLE cases (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  internal_code            VARCHAR(20) NOT NULL UNIQUE,

  -- Identificadores procesales chilenos
  rit                      VARCHAR(50) NULL,
  ruc                      VARCHAR(50) NULL,
  nui                      VARCHAR(50) NULL,

  -- Materia y submateria
  matter_id                BIGINT NOT NULL REFERENCES case_matters(id),
  submatter_code           VARCHAR(50) NULL,

  -- Actores procesales
  court_id                 BIGINT NULL REFERENCES courts(id),
  prosecutor_office_id     BIGINT NULL REFERENCES prosecutor_offices(id),
  prosecutor_id            BIGINT NULL REFERENCES prosecutors(id),

  -- Rol de Arauco en la causa
  arauco_procedural_role   VARCHAR(30) NOT NULL,

  -- Estado y etapa
  procedural_stage         VARCHAR(40) NOT NULL,
  state                    VARCHAR(20) NOT NULL DEFAULT 'active',
  closure_form             VARCHAR(40) NULL,

  -- Fechas
  started_at               TIMESTAMPTZ NOT NULL,
  closed_at                TIMESTAMPTZ NULL,

  -- Resumen narrativo y montos
  summary                  TEXT NULL,
  monto_demandado_clp      NUMERIC(15,0) NULL,
  monto_otorgado_clp       NUMERIC(15,0) NULL,
  monto_cobrado_clp        NUMERIC(15,0) NULL,

  -- Observaciones internas Arauco
  internal_notes           TEXT NULL,

  -- Auditoría
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT cases_internal_code_format_ck CHECK (
    internal_code ~ '^CAU-[0-9]{4}-[0-9]{5}$'
  ),
  CONSTRAINT cases_arauco_role_ck CHECK (arauco_procedural_role IN (
    'querellante', 'denunciante', 'parte_civil',
    'demandante', 'demandado',
    'recurrente', 'recurrido',
    'tercero'
  )),
  CONSTRAINT cases_state_ck CHECK (state IN ('active', 'suspended', 'closed')),
  CONSTRAINT cases_closure_form_ck CHECK (
    closure_form IS NULL OR closure_form IN (
      'condena', 'absolutoria',
      'sobreseimiento_definitivo', 'sobreseimiento_temporal',
      'acuerdo_reparatorio', 'suspension_condicional_cumplida',
      'no_perseverar', 'archivo_provisional',
      'desistimiento', 'avenimiento',
      'acogido', 'rechazado',
      'otro'
    )
  ),
  CONSTRAINT cases_closed_consistency_ck CHECK (
    (state = 'closed'  AND closure_form IS NOT NULL AND closed_at IS NOT NULL) OR
    (state <> 'closed' AND closed_at IS NULL)
  ),
  CONSTRAINT cases_montos_positive_ck CHECK (
    (monto_demandado_clp IS NULL OR monto_demandado_clp >= 0) AND
    (monto_otorgado_clp  IS NULL OR monto_otorgado_clp  >= 0) AND
    (monto_cobrado_clp   IS NULL OR monto_cobrado_clp   >= 0)
  )
);

CREATE TRIGGER cases_touch_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- Asignación atómica del correlativo -----
CREATE OR REPLACE FUNCTION fn_cases_assign_correlative()
RETURNS TRIGGER AS $$
DECLARE
  v_year   SMALLINT;
  v_number INT;
BEGIN
  IF NEW.internal_code IS NOT NULL AND NEW.internal_code <> '' THEN
    -- Permite override explícito (útil para migración legacy). El CHECK
    -- de formato lo valida.
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.started_at, now()))::SMALLINT;

  INSERT INTO case_sequences (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = case_sequences.last_number + 1,
                updated_at  = now()
  RETURNING last_number INTO v_number;

  NEW.internal_code := 'CAU-' || v_year::TEXT || '-' || lpad(v_number::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_assign_correlative
  BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION fn_cases_assign_correlative();

-- ----- Inmutabilidad del internal_code post-INSERT -----
CREATE OR REPLACE FUNCTION fn_cases_correlative_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_code IS DISTINCT FROM OLD.internal_code THEN
    RAISE EXCEPTION 'cases: internal_code es inmutable post-creación (% → %)',
      OLD.internal_code, NEW.internal_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_correlative_immutable
  BEFORE UPDATE OF internal_code ON cases
  FOR EACH ROW EXECUTE FUNCTION fn_cases_correlative_immutable();

-- ----- prosecutor_office_id requerido si matter = PENAL -----
CREATE OR REPLACE FUNCTION fn_cases_validate_matter_prosecutor()
RETURNS TRIGGER AS $$
DECLARE
  v_matter_code VARCHAR(30);
BEGIN
  SELECT code INTO v_matter_code FROM case_matters WHERE id = NEW.matter_id;

  IF v_matter_code = 'PENAL' AND NEW.prosecutor_office_id IS NULL THEN
    RAISE EXCEPTION 'cases: prosecutor_office_id es obligatorio para matter=PENAL (causa %)', NEW.internal_code;
  END IF;

  IF v_matter_code <> 'PENAL' AND NEW.prosecutor_office_id IS NOT NULL THEN
    RAISE EXCEPTION 'cases: prosecutor_office_id solo aplica a matter=PENAL (causa % es %)', NEW.internal_code, v_matter_code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_validate_matter_prosecutor
  BEFORE INSERT OR UPDATE OF matter_id, prosecutor_office_id ON cases
  FOR EACH ROW EXECUTE FUNCTION fn_cases_validate_matter_prosecutor();

-- ----- Hard delete prohibido (mismo patrón que incidents) -----
CREATE OR REPLACE FUNCTION fn_cases_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'cases: hard delete prohibido. Usar UPDATE deleted_at = now().';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_no_hard_delete
  BEFORE DELETE ON cases
  FOR EACH ROW EXECUTE FUNCTION fn_cases_no_hard_delete();

-- ----- Índices -----
CREATE INDEX idx_cases_matter             ON cases(matter_id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_court              ON cases(court_id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_prosecutor_office  ON cases(prosecutor_office_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_prosecutor         ON cases(prosecutor_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_state              ON cases(state)                WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_stage              ON cases(procedural_stage)     WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_started_at         ON cases(started_at DESC)      WHERE deleted_at IS NULL;
CREATE INDEX idx_cases_rit                ON cases(rit)                  WHERE deleted_at IS NULL AND rit IS NOT NULL;
CREATE INDEX idx_cases_ruc                ON cases(ruc)                  WHERE deleted_at IS NULL AND ruc IS NOT NULL;
CREATE INDEX idx_cases_active             ON cases(id)                   WHERE deleted_at IS NULL AND state = 'active';

COMMENT ON TABLE cases IS 'Causa judicial de Arauco URP. Causas son exclusivas de la organización principal — security_provider y api_consumer no las ven.';


-- =============================================================================
-- 3. case_incidents (N:N causa ↔ incidente)
-- =============================================================================

CREATE TABLE case_incidents (
  case_id        BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  incident_id    BIGINT NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by_id   BIGINT NULL REFERENCES users(id),
  link_reason    TEXT NULL,

  PRIMARY KEY (case_id, incident_id)
);

CREATE INDEX idx_case_incidents_incident ON case_incidents(incident_id);

COMMENT ON TABLE case_incidents IS 'Vinculación N:N opcional entre causa e incidentes. Permite causa-bloque (1 causa que agrupa N incidentes del mismo modus operandi) y causa-sin-incidente (recursos de protección, civiles, contencioso administrativo).';


-- =============================================================================
-- 4. case_parties (N:N causa ↔ party con rol procesal)
-- =============================================================================

CREATE TABLE case_parties (
  case_id                 BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  party_id                BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  role_code               VARCHAR(40) NOT NULL REFERENCES case_party_roles(code),

  joined_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at                 TIMESTAMPTZ NULL,

  -- Solo aplica a role IMPUTADO o DENUNCIADO_INCERTUS
  procedural_status       VARCHAR(30) NULL,
  precautionary_measure   VARCHAR(40) NULL,
  armed_at_arrest         BOOLEAN NULL,
  alias                   VARCHAR(100) NULL,
  gang_name               VARCHAR(100) NULL,

  is_identified           BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT NULL,

  -- Auditoría
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id           BIGINT NULL REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id           BIGINT NULL REFERENCES users(id),

  PRIMARY KEY (case_id, party_id, role_code),

  CONSTRAINT case_parties_status_ck CHECK (
    procedural_status IS NULL OR procedural_status IN (
      'identified', 'incertus',
      'formalized', 'accused',
      'convicted', 'acquitted',
      'dismissed', 'suspended_conditional'
    )
  ),
  CONSTRAINT case_parties_measure_ck CHECK (
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
  ),
  CONSTRAINT case_parties_left_after_joined_ck CHECK (
    left_at IS NULL OR left_at >= joined_at
  )
);

CREATE TRIGGER case_parties_touch_updated_at
  BEFORE UPDATE ON case_parties
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- is_identified=false solo para imputado / denunciado_incertus -----
CREATE OR REPLACE FUNCTION fn_case_parties_validate_identification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_identified = false AND NEW.role_code NOT IN ('IMPUTADO', 'DENUNCIADO_INCERTUS') THEN
    RAISE EXCEPTION 'case_parties: is_identified=false solo se admite para roles IMPUTADO o DENUNCIADO_INCERTUS (rol actual: %)', NEW.role_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_parties_validate_identification
  BEFORE INSERT OR UPDATE ON case_parties
  FOR EACH ROW EXECUTE FUNCTION fn_case_parties_validate_identification();

CREATE INDEX idx_case_parties_party ON case_parties(party_id);
CREATE INDEX idx_case_parties_role  ON case_parties(role_code);

COMMENT ON TABLE case_parties IS 'Roles procesales de personas/entidades en causas. PK compuesta (case_id, party_id, role_code) permite mismo party con N roles en N causas — corrige gap del legacy donde Persona.Vinculacion era mono-valor.';


-- =============================================================================
-- 5. case_attorneys (N:N abogado ↔ causa con rango temporal)
-- =============================================================================

CREATE TABLE case_attorneys (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id             BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  attorney_user_id    BIGINT NOT NULL REFERENCES users(id),
  role_code           VARCHAR(30) NOT NULL REFERENCES case_attorney_roles(code),

  assigned_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_until      TIMESTAMPTZ NULL,

  assigned_by_id      BIGINT NULL REFERENCES users(id),
  unassigned_by_id    BIGINT NULL REFERENCES users(id),
  notes               TEXT NULL,

  -- Auditoría
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT case_attorneys_until_after_from_ck CHECK (
    assigned_until IS NULL OR assigned_until >= assigned_from
  )
);

CREATE TRIGGER case_attorneys_touch_updated_at
  BEFORE UPDATE ON case_attorneys
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- attorney debe ser user de organization principal (Arauco) -----
CREATE OR REPLACE FUNCTION fn_case_attorneys_validate_user_org()
RETURNS TRIGGER AS $$
DECLARE
  v_org_type VARCHAR(30);
  v_user_active BOOLEAN;
BEGIN
  SELECT o.type, u.active
  INTO v_org_type, v_user_active
  FROM users u
  JOIN organizations o ON o.id = u.organization_id
  WHERE u.id = NEW.attorney_user_id;

  IF v_org_type IS NULL THEN
    RAISE EXCEPTION 'case_attorneys: usuario % no existe', NEW.attorney_user_id;
  END IF;

  IF v_org_type <> 'principal' THEN
    RAISE EXCEPTION 'case_attorneys: attorney_user_id debe ser de organization principal (Arauco), no %', v_org_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_attorneys_validate_user_org
  BEFORE INSERT OR UPDATE OF attorney_user_id ON case_attorneys
  FOR EACH ROW EXECUTE FUNCTION fn_case_attorneys_validate_user_org();

-- ----- Solo 1 abogado role=TITULAR vigente por causa -----
-- Implementado con partial unique index para no requerir trigger de recálculo.
CREATE UNIQUE INDEX idx_case_attorneys_one_titular_active
  ON case_attorneys (case_id)
  WHERE role_code = 'TITULAR' AND assigned_until IS NULL;

CREATE INDEX idx_case_attorneys_case        ON case_attorneys(case_id);
CREATE INDEX idx_case_attorneys_user        ON case_attorneys(attorney_user_id);
CREATE INDEX idx_case_attorneys_active      ON case_attorneys(case_id, role_code) WHERE assigned_until IS NULL;

COMMENT ON TABLE case_attorneys IS 'Asignación N:N temporal de abogados a causas. assigned_until=NULL marca asignación vigente. Cambio de titular = cerrar el actual + crear nuevo registro (append-only del histórico).';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('cases');
SELECT fn_audit_attach('case_incidents', 'case_id');
SELECT fn_audit_attach('case_parties',   'case_id');
SELECT fn_audit_attach('case_attorneys');
