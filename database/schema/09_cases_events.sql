-- =============================================================================
-- SURP 2.0 — schema/09_cases_events.sql
--
-- Módulo cases — eventos procesales:
--
--   - case_milestones    Hitos procesales (append-only)
--   - case_hearings      Audiencias como entidad de primera clase
--   - case_resolutions   Resoluciones del tribunal
--   - case_appeals       Recursos (apelación / reposición / nulidad / casación / queja)
--   - case_querellas     Querellas (principal / ampliación / adhesión)
--
-- Invariantes (CASES-MODULE-VISION.md §2.5):
--   - case_milestones append-only: no UPDATE ni DELETE (correcciones via nuevo
--     hito con triggered_by_milestone_id apuntando al original).
--   - case_hearings: state=completed requiere actual_at; resultado puede
--     generar milestones derivados (responsabilidad de la capa use case).
--   - case_resolutions.notified_at >= issued_at.
--   - case_appeals.filed_by_attorney_user_id debe ser user de org principal.
-- =============================================================================


-- =============================================================================
-- 1. case_milestones (append-only)
-- =============================================================================

CREATE TABLE case_milestones (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                     BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  milestone_type_code         VARCHAR(60) NOT NULL REFERENCES case_milestone_types(code),

  occurred_at                 TIMESTAMPTZ NOT NULL,
  recorded_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  description                 TEXT NULL,

  -- Trazabilidad
  hearing_id                  BIGINT NULL,  -- FK agregada después de definir case_hearings
  triggered_by_milestone_id   BIGINT NULL REFERENCES case_milestones(id),

  created_by_id               BIGINT NULL REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_milestones_case        ON case_milestones(case_id);
CREATE INDEX idx_case_milestones_type        ON case_milestones(milestone_type_code);
CREATE INDEX idx_case_milestones_occurred    ON case_milestones(occurred_at DESC);
CREATE INDEX idx_case_milestones_hearing     ON case_milestones(hearing_id) WHERE hearing_id IS NOT NULL;
CREATE INDEX idx_case_milestones_triggered   ON case_milestones(triggered_by_milestone_id) WHERE triggered_by_milestone_id IS NOT NULL;

-- Append-only — no UPDATE ni DELETE (correcciones via nuevo hito que apunta al original)
CREATE OR REPLACE FUNCTION fn_case_milestones_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'case_milestones: append-only. Para corregir, agregar nuevo hito con triggered_by_milestone_id apuntando al original (id=%).', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'case_milestones: append-only. Borrado prohibido (id=%).', OLD.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_milestones_append_only
  BEFORE UPDATE OR DELETE ON case_milestones
  FOR EACH ROW EXECUTE FUNCTION fn_case_milestones_append_only();

COMMENT ON TABLE case_milestones IS 'Hitos procesales append-only. Correcciones se modelan como nuevo hito con triggered_by_milestone_id apuntando al original — el histórico íntegro nunca se pierde.';


-- =============================================================================
-- 2. case_hearings (audiencias como entidad de primera clase)
-- =============================================================================

CREATE TABLE case_hearings (
  id                            BIGSERIAL PRIMARY KEY,
  external_id                   UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                       BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  hearing_type_code             VARCHAR(40) NOT NULL REFERENCES case_hearing_types(code),

  scheduled_at                  TIMESTAMPTZ NOT NULL,
  actual_at                     TIMESTAMPTZ NULL,

  court_id                      BIGINT NULL REFERENCES courts(id),
  courtroom                     VARCHAR(50) NULL,
  modality                      VARCHAR(20) NOT NULL DEFAULT 'presencial',
  meeting_url                   TEXT NULL,

  state                         VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  outcome_summary               TEXT NULL,

  -- act_document_id agregada como FK en Ola 4 cuando exista case_documents
  act_document_id               BIGINT NULL,

  -- attendees: array de objetos {party_id, role, present, notes}
  attendees                     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Audiencia siguiente fijada en esta
  next_hearing_id               BIGINT NULL REFERENCES case_hearings(id),

  -- Recordatorios enviados
  notification_sent_24h_at      TIMESTAMPTZ NULL,
  notification_sent_1h_at       TIMESTAMPTZ NULL,

  -- Auditoría
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                 BIGINT NULL REFERENCES users(id),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                 BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_hearings_modality_ck CHECK (modality IN (
    'presencial', 'videoconferencia', 'mixta'
  )),
  CONSTRAINT case_hearings_state_ck CHECK (state IN (
    'scheduled', 'completed', 'suspended', 'postponed', 'cancelled'
  )),
  CONSTRAINT case_hearings_completed_consistency_ck CHECK (
    state <> 'completed' OR (actual_at IS NOT NULL AND outcome_summary IS NOT NULL)
  ),
  CONSTRAINT case_hearings_video_url_ck CHECK (
    modality <> 'videoconferencia' OR meeting_url IS NOT NULL
  ),
  CONSTRAINT case_hearings_attendees_is_array_ck CHECK (
    jsonb_typeof(attendees) = 'array'
  ),
  CONSTRAINT case_hearings_no_self_next_ck CHECK (
    next_hearing_id IS NULL OR next_hearing_id <> id
  )
);

CREATE TRIGGER case_hearings_touch_updated_at
  BEFORE UPDATE ON case_hearings
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_case_hearings_case          ON case_hearings(case_id);
CREATE INDEX idx_case_hearings_type          ON case_hearings(hearing_type_code);
CREATE INDEX idx_case_hearings_scheduled     ON case_hearings(scheduled_at DESC);
CREATE INDEX idx_case_hearings_state         ON case_hearings(state);
CREATE INDEX idx_case_hearings_court         ON case_hearings(court_id) WHERE court_id IS NOT NULL;
CREATE INDEX idx_case_hearings_upcoming      ON case_hearings(scheduled_at) WHERE state = 'scheduled';

COMMENT ON TABLE case_hearings IS 'Audiencias como entidad de primera clase. Cuando state=completed, la app debe generar uno o más case_milestones derivados (ej. audiencia de formalización → hito FORMALIZATION).';


-- ----- Agregar FK case_milestones.hearing_id ahora que case_hearings existe -----
ALTER TABLE case_milestones
  ADD CONSTRAINT case_milestones_hearing_fk
  FOREIGN KEY (hearing_id) REFERENCES case_hearings(id) ON DELETE SET NULL;


-- =============================================================================
-- 3. case_resolutions
-- =============================================================================

CREATE TABLE case_resolutions (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                  BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  resolution_type_code     VARCHAR(40) NOT NULL REFERENCES case_resolution_types(code),

  issued_at                TIMESTAMPTZ NOT NULL,
  notified_at              TIMESTAMPTZ NULL,

  summary                  TEXT NOT NULL,

  -- Replicados del catálogo al momento de la resolución (snapshot — no se
  -- recalculan si el catálogo cambia después)
  is_appealable            BOOLEAN NOT NULL,
  is_subject_to_replevin   BOOLEAN NOT NULL,
  is_subject_to_nullity    BOOLEAN NOT NULL,

  hearing_id               BIGINT NULL REFERENCES case_hearings(id),
  document_id              BIGINT NULL,  -- FK agregada en Ola 4

  -- Auditoría
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_resolutions_notified_after_issued_ck CHECK (
    notified_at IS NULL OR notified_at >= issued_at
  )
);

CREATE TRIGGER case_resolutions_touch_updated_at
  BEFORE UPDATE ON case_resolutions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- Snapshot de flags de recurribilidad desde el catálogo al INSERT -----
CREATE OR REPLACE FUNCTION fn_case_resolutions_snapshot_flags()
RETURNS TRIGGER AS $$
BEGIN
  -- Si las flags vienen NULL, las completamos desde el catálogo
  IF NEW.is_appealable IS NULL OR NEW.is_subject_to_replevin IS NULL OR NEW.is_subject_to_nullity IS NULL THEN
    SELECT
      COALESCE(NEW.is_appealable,          rt.is_appealable),
      COALESCE(NEW.is_subject_to_replevin, rt.is_subject_to_replevin),
      COALESCE(NEW.is_subject_to_nullity,  rt.is_subject_to_nullity)
    INTO
      NEW.is_appealable,
      NEW.is_subject_to_replevin,
      NEW.is_subject_to_nullity
    FROM case_resolution_types rt
    WHERE rt.code = NEW.resolution_type_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_resolutions_snapshot_flags
  BEFORE INSERT ON case_resolutions
  FOR EACH ROW EXECUTE FUNCTION fn_case_resolutions_snapshot_flags();

CREATE INDEX idx_case_resolutions_case      ON case_resolutions(case_id);
CREATE INDEX idx_case_resolutions_type      ON case_resolutions(resolution_type_code);
CREATE INDEX idx_case_resolutions_issued    ON case_resolutions(issued_at DESC);
CREATE INDEX idx_case_resolutions_notified  ON case_resolutions(notified_at) WHERE notified_at IS NOT NULL;
CREATE INDEX idx_case_resolutions_hearing   ON case_resolutions(hearing_id) WHERE hearing_id IS NOT NULL;

COMMENT ON TABLE case_resolutions IS 'Resoluciones del tribunal. is_appealable / is_subject_to_replevin / is_subject_to_nullity son snapshot del catálogo al momento de la resolución (no se recalculan).';


-- =============================================================================
-- 4. case_appeals (recursos)
-- =============================================================================

CREATE TABLE case_appeals (
  id                              BIGSERIAL PRIMARY KEY,
  external_id                     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                         BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  appeal_type_code                VARCHAR(30) NOT NULL REFERENCES case_appeal_types(code),
  against_resolution_id           BIGINT NOT NULL REFERENCES case_resolutions(id),

  filed_at                        TIMESTAMPTZ NOT NULL,
  filed_by_attorney_user_id       BIGINT NOT NULL REFERENCES users(id),

  state                           VARCHAR(30) NOT NULL DEFAULT 'filed',
  decision_summary                TEXT NULL,
  decided_at                      TIMESTAMPTZ NULL,

  document_id                     BIGINT NULL,  -- FK agregada en Ola 4

  -- Auditoría
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                   BIGINT NULL REFERENCES users(id),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                   BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_appeals_state_ck CHECK (state IN (
    'filed', 'admitted', 'inadmissible', 'hearing_scheduled', 'decided'
  )),
  CONSTRAINT case_appeals_decision_consistency_ck CHECK (
    state <> 'decided' OR (decided_at IS NOT NULL AND decision_summary IS NOT NULL)
  ),
  CONSTRAINT case_appeals_decided_after_filed_ck CHECK (
    decided_at IS NULL OR decided_at >= filed_at
  )
);

CREATE TRIGGER case_appeals_touch_updated_at
  BEFORE UPDATE ON case_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- filed_by_attorney_user_id debe ser user de org principal (Arauco) -----
CREATE OR REPLACE FUNCTION fn_case_appeals_validate_attorney_org()
RETURNS TRIGGER AS $$
DECLARE
  v_org_type VARCHAR(30);
BEGIN
  SELECT o.type INTO v_org_type
  FROM users u
  JOIN organizations o ON o.id = u.organization_id
  WHERE u.id = NEW.filed_by_attorney_user_id;

  IF v_org_type IS NULL THEN
    RAISE EXCEPTION 'case_appeals: usuario % no existe', NEW.filed_by_attorney_user_id;
  END IF;
  IF v_org_type <> 'principal' THEN
    RAISE EXCEPTION 'case_appeals: filed_by_attorney_user_id debe ser de organization principal, no %', v_org_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_appeals_validate_attorney_org
  BEFORE INSERT OR UPDATE OF filed_by_attorney_user_id ON case_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_case_appeals_validate_attorney_org();

-- ----- against_resolution_id debe pertenecer a la misma causa -----
CREATE OR REPLACE FUNCTION fn_case_appeals_validate_resolution_case()
RETURNS TRIGGER AS $$
DECLARE
  v_resolution_case_id BIGINT;
BEGIN
  SELECT case_id INTO v_resolution_case_id
  FROM case_resolutions
  WHERE id = NEW.against_resolution_id;

  IF v_resolution_case_id <> NEW.case_id THEN
    RAISE EXCEPTION 'case_appeals: la resolución % pertenece a la causa %, no a %',
      NEW.against_resolution_id, v_resolution_case_id, NEW.case_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_appeals_validate_resolution_case
  BEFORE INSERT OR UPDATE OF case_id, against_resolution_id ON case_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_case_appeals_validate_resolution_case();

CREATE INDEX idx_case_appeals_case              ON case_appeals(case_id);
CREATE INDEX idx_case_appeals_type              ON case_appeals(appeal_type_code);
CREATE INDEX idx_case_appeals_resolution        ON case_appeals(against_resolution_id);
CREATE INDEX idx_case_appeals_state             ON case_appeals(state);
CREATE INDEX idx_case_appeals_filed_by          ON case_appeals(filed_by_attorney_user_id);

COMMENT ON TABLE case_appeals IS 'Recursos contra resoluciones. against_resolution_id debe pertenecer a la misma causa (validado por trigger).';


-- =============================================================================
-- 5. case_querellas
-- =============================================================================

CREATE TABLE case_querellas (
  id                             BIGSERIAL PRIMARY KEY,
  external_id                    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                        BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  querella_type                  VARCHAR(30) NOT NULL,

  filed_at                       TIMESTAMPTZ NOT NULL,
  filed_by_attorney_user_id      BIGINT NOT NULL REFERENCES users(id),

  requested_diligences_count     INT NULL,
  admitted                       BOOLEAN NULL,
  admitted_at                    TIMESTAMPTZ NULL,
  admission_notes                TEXT NULL,

  document_id                    BIGINT NULL,  -- FK agregada en Ola 4
  notes                          TEXT NULL,

  -- Auditoría
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                  BIGINT NULL REFERENCES users(id),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                  BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_querellas_type_ck CHECK (querella_type IN (
    'principal', 'ampliacion', 'adhesion'
  )),
  CONSTRAINT case_querellas_diligences_positive_ck CHECK (
    requested_diligences_count IS NULL OR requested_diligences_count >= 0
  ),
  CONSTRAINT case_querellas_admission_consistency_ck CHECK (
    (admitted IS NULL AND admitted_at IS NULL) OR
    (admitted IS NOT NULL AND admitted_at IS NOT NULL)
  ),
  CONSTRAINT case_querellas_admitted_after_filed_ck CHECK (
    admitted_at IS NULL OR admitted_at >= filed_at
  )
);

CREATE TRIGGER case_querellas_touch_updated_at
  BEFORE UPDATE ON case_querellas
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- filed_by_attorney_user_id debe ser user de org principal -----
CREATE OR REPLACE FUNCTION fn_case_querellas_validate_attorney_org()
RETURNS TRIGGER AS $$
DECLARE
  v_org_type VARCHAR(30);
BEGIN
  SELECT o.type INTO v_org_type
  FROM users u
  JOIN organizations o ON o.id = u.organization_id
  WHERE u.id = NEW.filed_by_attorney_user_id;

  IF v_org_type <> 'principal' THEN
    RAISE EXCEPTION 'case_querellas: filed_by_attorney_user_id debe ser de organization principal, no %', v_org_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_querellas_validate_attorney_org
  BEFORE INSERT OR UPDATE OF filed_by_attorney_user_id ON case_querellas
  FOR EACH ROW EXECUTE FUNCTION fn_case_querellas_validate_attorney_org();

CREATE INDEX idx_case_querellas_case      ON case_querellas(case_id);
CREATE INDEX idx_case_querellas_type      ON case_querellas(querella_type);
CREATE INDEX idx_case_querellas_filed     ON case_querellas(filed_at DESC);
CREATE INDEX idx_case_querellas_admitted  ON case_querellas(admitted) WHERE admitted IS NOT NULL;

COMMENT ON TABLE case_querellas IS 'Querellas presentadas por Arauco. principal = primera querella; ampliacion = ampliación; adhesion = adhesión a querella de tercero.';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('case_milestones');
SELECT fn_audit_attach('case_hearings');
SELECT fn_audit_attach('case_resolutions');
SELECT fn_audit_attach('case_appeals');
SELECT fn_audit_attach('case_querellas');
