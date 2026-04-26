-- =============================================================================
-- SURP 2.0 — schema/10_cases_deadlines.sql
--
-- Módulo cases — plazos vivos:
--
--   - chilean_holidays         Feriados Chile (poblada por job sync-chilean-holidays
--                              desde feriados.io anualmente; bootstrap manual)
--   - legal_deadline_catalog   Catálogo de tipos de plazo legal con metadata
--   - case_deadlines           Instancias de plazo por causa (calculadas)
--
--   - fn_add_business_days(start, days)         Suma días hábiles
--   - fn_case_deadlines_compute_due_at()        Trigger BEFORE INSERT
--
-- Invariantes (CASES-MODULE-VISION.md §5):
--   - due_at calculado server-side en INSERT (días corridos vs hábiles según catálogo)
--   - state=fulfilled requiere fulfilled_at (y idealmente fulfilled_by_milestone_id)
--   - state=waived requiere waived_reason + waived_by_id + waived_at
--   - due_at >= triggered_at
--   - Columnas inmutables post-INSERT: case_id, deadline_catalog_id, triggered_at, due_at
-- =============================================================================


-- =============================================================================
-- 1. chilean_holidays — feriados Chile
-- =============================================================================

CREATE TABLE chilean_holidays (
  date            DATE PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  irrenunciable   BOOLEAN NOT NULL DEFAULT false,
  holiday_type    VARCHAR(20) NOT NULL DEFAULT 'national',
  source          VARCHAR(30) NOT NULL DEFAULT 'feriados.io',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chilean_holidays_type_ck CHECK (holiday_type IN ('national', 'regional')),
  CONSTRAINT chilean_holidays_year_ck CHECK (date >= '2000-01-01' AND date < '2100-01-01')
);

CREATE INDEX idx_chilean_holidays_year ON chilean_holidays (EXTRACT(YEAR FROM date));

COMMENT ON TABLE chilean_holidays IS 'Feriados Chile. Poblada por worker BullMQ sync-chilean-holidays una vez al año (1 noviembre) desde https://api.feriados.io/v1/CL/holidays/{year}. API key en Key Vault como FERIADOS_IO_API_KEY.';


-- =============================================================================
-- 2. fn_add_business_days(start, days) — suma días hábiles
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_add_business_days(
  p_start TIMESTAMPTZ,
  p_days  INT
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_result    TIMESTAMPTZ := p_start;
  v_added     INT := 0;
  v_dow       INT;
  v_is_holiday BOOLEAN;
BEGIN
  IF p_days < 0 THEN
    RAISE EXCEPTION 'fn_add_business_days: p_days debe ser >= 0';
  END IF;

  WHILE v_added < p_days LOOP
    v_result := v_result + INTERVAL '1 day';
    v_dow := EXTRACT(DOW FROM v_result);  -- 0=domingo, 6=sábado
    IF v_dow = 0 OR v_dow = 6 THEN
      CONTINUE;
    END IF;
    SELECT EXISTS (SELECT 1 FROM chilean_holidays WHERE date = v_result::DATE)
    INTO v_is_holiday;
    IF v_is_holiday THEN
      CONTINUE;
    END IF;
    v_added := v_added + 1;
  END LOOP;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_add_business_days IS 'Suma días hábiles a una fecha. Considera sábados, domingos y chilean_holidays como NO hábiles (CPP art. 14 inc. 2).';


-- =============================================================================
-- 3. legal_deadline_catalog
-- =============================================================================

CREATE TABLE legal_deadline_catalog (
  id                                 BIGSERIAL PRIMARY KEY,
  external_id                        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                               VARCHAR(60) NOT NULL UNIQUE,
  description                        TEXT NOT NULL,

  duration_value                     INT NOT NULL,
  duration_unit                      VARCHAR(20) NOT NULL,
  business_days                      BOOLEAN NOT NULL DEFAULT false,

  -- Hito de case_milestone_types que dispara el plazo (NULL = disparado por
  -- evento externo del incidente o por la app).
  triggered_by_milestone_type_code   VARCHAR(60) NULL REFERENCES case_milestone_types(code),

  -- Lista de codes de case_milestone_types que cumplen el plazo. No es FK
  -- (PG no soporta FK arrays); validación informativa, lógica en use case.
  fulfilled_by_milestone_type_codes  TEXT[] NOT NULL DEFAULT '{}',

  -- Alertas: array de objetos {days_before|hours_before, severity}
  alert_thresholds                   JSONB NOT NULL DEFAULT '[]'::jsonb,

  legal_reference                    TEXT NULL,
  applicable_to_matter               VARCHAR(30) NULL,
  severity_default                   VARCHAR(10) NOT NULL DEFAULT 'medium',
  is_system                          BOOLEAN NOT NULL DEFAULT false,
  active                             BOOLEAN NOT NULL DEFAULT true,
  order_index                        INT NOT NULL DEFAULT 0,

  created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ldc_duration_unit_ck CHECK (duration_unit IN (
    'hours', 'days', 'weeks', 'months', 'years'
  )),
  CONSTRAINT ldc_duration_positive_ck CHECK (duration_value > 0),
  CONSTRAINT ldc_business_days_only_with_days_ck CHECK (
    business_days = false OR duration_unit = 'days'
  ),
  CONSTRAINT ldc_severity_ck CHECK (severity_default IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ldc_alert_thresholds_array_ck CHECK (jsonb_typeof(alert_thresholds) = 'array'),
  CONSTRAINT ldc_matter_ck CHECK (
    applicable_to_matter IS NULL OR applicable_to_matter IN ('PENAL', 'CIVIL', 'ADMIN', 'CONST')
  )
);

CREATE TRIGGER ldc_touch_updated_at
  BEFORE UPDATE ON legal_deadline_catalog
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER ldc_protect_system
  BEFORE UPDATE OR DELETE ON legal_deadline_catalog
  FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();

CREATE INDEX idx_ldc_triggered_by  ON legal_deadline_catalog(triggered_by_milestone_type_code);
CREATE INDEX idx_ldc_matter        ON legal_deadline_catalog(applicable_to_matter);

COMMENT ON TABLE legal_deadline_catalog IS 'Catálogo de tipos de plazo legal aplicables a causas. Extensible — Abogado Administrador puede agregar plazos custom URP. Los is_system son los plazos legales del CPP/CP/Ley 20.283.';


-- =============================================================================
-- 4. case_deadlines — instancias por causa
-- =============================================================================

CREATE TABLE case_deadlines (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                     BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  deadline_catalog_id         BIGINT NOT NULL REFERENCES legal_deadline_catalog(id),

  triggered_by_milestone_id   BIGINT NULL REFERENCES case_milestones(id),
  triggered_at                TIMESTAMPTZ NOT NULL,
  due_at                      TIMESTAMPTZ NOT NULL,  -- calculado por trigger

  state                       VARCHAR(20) NOT NULL DEFAULT 'pending',

  fulfilled_by_milestone_id   BIGINT NULL REFERENCES case_milestones(id),
  fulfilled_at                TIMESTAMPTZ NULL,

  waived_reason               TEXT NULL,
  waived_by_id                BIGINT NULL REFERENCES users(id),
  waived_at                   TIMESTAMPTZ NULL,

  last_alert_sent_at          TIMESTAMPTZ NULL,
  notes                       TEXT NULL,

  -- Auditoría
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NULL REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_deadlines_state_ck CHECK (state IN (
    'pending', 'fulfilled', 'overdue', 'waived', 'suspended'
  )),
  CONSTRAINT case_deadlines_fulfilled_consistency_ck CHECK (
    state <> 'fulfilled' OR fulfilled_at IS NOT NULL
  ),
  CONSTRAINT case_deadlines_waived_consistency_ck CHECK (
    state <> 'waived' OR (
      waived_reason IS NOT NULL
      AND waived_by_id IS NOT NULL
      AND waived_at   IS NOT NULL
    )
  ),
  CONSTRAINT case_deadlines_due_after_triggered_ck CHECK (due_at >= triggered_at)
);

CREATE TRIGGER case_deadlines_touch_updated_at
  BEFORE UPDATE ON case_deadlines
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----- Auto-cálculo de due_at en INSERT -----
CREATE OR REPLACE FUNCTION fn_case_deadlines_compute_due_at()
RETURNS TRIGGER AS $$
DECLARE
  v_unit         VARCHAR(20);
  v_value        INT;
  v_business     BOOLEAN;
BEGIN
  -- Si el caller proveyó due_at explícito (caso especial / migración), respetar.
  IF NEW.due_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT duration_unit, duration_value, business_days
    INTO v_unit, v_value, v_business
  FROM legal_deadline_catalog
  WHERE id = NEW.deadline_catalog_id;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'case_deadlines: deadline_catalog_id % no existe', NEW.deadline_catalog_id;
  END IF;

  IF v_business THEN
    -- business_days solo válido con duration_unit = 'days' (CHECK del catálogo)
    NEW.due_at := fn_add_business_days(NEW.triggered_at, v_value);
  ELSE
    NEW.due_at := NEW.triggered_at + (
      CASE v_unit
        WHEN 'hours'  THEN make_interval(hours  => v_value)
        WHEN 'days'   THEN make_interval(days   => v_value)
        WHEN 'weeks'  THEN make_interval(weeks  => v_value)
        WHEN 'months' THEN make_interval(months => v_value)
        WHEN 'years'  THEN make_interval(years  => v_value)
      END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_deadlines_compute_due_at
  BEFORE INSERT ON case_deadlines
  FOR EACH ROW EXECUTE FUNCTION fn_case_deadlines_compute_due_at();

-- ----- Inmutabilidad de columnas críticas post-INSERT -----
CREATE OR REPLACE FUNCTION fn_case_deadlines_immutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'case_deadlines: case_id es inmutable';
  END IF;
  IF NEW.deadline_catalog_id IS DISTINCT FROM OLD.deadline_catalog_id THEN
    RAISE EXCEPTION 'case_deadlines: deadline_catalog_id es inmutable';
  END IF;
  IF NEW.triggered_at IS DISTINCT FROM OLD.triggered_at THEN
    RAISE EXCEPTION 'case_deadlines: triggered_at es inmutable';
  END IF;
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    RAISE EXCEPTION 'case_deadlines: due_at es inmutable (sólo se actualiza vía recreación)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_deadlines_immutable_columns
  BEFORE UPDATE ON case_deadlines
  FOR EACH ROW EXECUTE FUNCTION fn_case_deadlines_immutable_columns();

-- ----- Hard delete prohibido -----
CREATE OR REPLACE FUNCTION fn_case_deadlines_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'case_deadlines: hard delete prohibido. Usar state=waived con waived_reason.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_deadlines_no_hard_delete
  BEFORE DELETE ON case_deadlines
  FOR EACH ROW EXECUTE FUNCTION fn_case_deadlines_no_hard_delete();

CREATE INDEX idx_case_deadlines_case            ON case_deadlines(case_id);
CREATE INDEX idx_case_deadlines_catalog         ON case_deadlines(deadline_catalog_id);
CREATE INDEX idx_case_deadlines_state           ON case_deadlines(state);
CREATE INDEX idx_case_deadlines_due_pending
  ON case_deadlines(due_at)
  WHERE state = 'pending';
CREATE INDEX idx_case_deadlines_overdue_active
  ON case_deadlines(case_id, due_at)
  WHERE state IN ('pending', 'overdue');
CREATE INDEX idx_case_deadlines_triggered_milestone
  ON case_deadlines(triggered_by_milestone_id)
  WHERE triggered_by_milestone_id IS NOT NULL;

COMMENT ON TABLE case_deadlines IS 'Plazos vivos por causa. due_at se calcula server-side en INSERT desde legal_deadline_catalog. Worker case-deadlines-monitor (BullMQ) marca overdue y dispara alertas según alert_thresholds.';


-- =============================================================================
-- 5. Auditoría
-- =============================================================================

-- chilean_holidays NO se audita individualmente (poblada por worker, sin
-- mutaciones manuales relevantes; entity_id en audit_logs es BIGINT y la PK
-- de chilean_holidays es DATE).
SELECT fn_audit_attach('legal_deadline_catalog');
SELECT fn_audit_attach('case_deadlines');
