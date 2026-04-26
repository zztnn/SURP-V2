-- =============================================================================
-- SURP 2.0 — schema/15_surveillance_operations.sql
--
-- Módulo surveillance — Ola 2: Operación
--
-- Operación diaria del personal de seguridad contratista:
--
--   1. security_shifts            Turno de un guardia (planificado + ejecutado)
--   2. patrols                    Rondín individual dentro de un turno
--   3. patrol_tracks              Breadcrumbs GPS particionados por mes
--   4. shift_reports              Parte diario que el guardia firma al cierre
--   5. security_critical_events   Eventos críticos (disparo, uso de fuerza,
--                                 detención por flagrancia, lesiones)
--
-- Invariantes (legal-armas-vigilantes + CC arts. 2314-2322):
--   - Estado del turno sigue máquina explícita (scheduled→in_progress→completed
--     ó scheduled→cancelled / in_progress→no_show).
--   - Track GPS es append-only (no UPDATE ni DELETE).
--   - shift_report al firmarse (locked=true) congela todos sus campos.
--   - critical_event guard_id coincide con shift.guard_id si shift no es NULL.
--   - Notificaciones policiales / Fiscalía / OS-10 con timestamp obligatorio.
--   - Suspensión preventiva del guardia tras evento crítico se modela aquí.
--   - Ubicación dentro de bbox de Chile.
--   - Hard delete prohibido en todas (registro regulatorio + cadena de
--     responsabilidad URP).
--
-- Engancha con:
--   - security_guards            ← guard_id en shifts y critical_events
--   - properties / zones         ← property_id, zone_id en shifts
--   - police_units / prosecutor_offices ← critical_events
--   - incidents                  ← critical_events.incident_id (vínculo opcional)
-- =============================================================================


-- =============================================================================
-- 1. security_shifts — turno planificado + ejecutado
-- =============================================================================

CREATE TABLE security_shifts (
  id                    BIGSERIAL PRIMARY KEY,
  external_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  guard_id              BIGINT NOT NULL REFERENCES security_guards(id) ON DELETE RESTRICT,
  -- Predio principal (puede ser NULL para turnos de zona/área).
  property_id           BIGINT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  -- Zona del turno (denormalizada — se valida vs. property.zone_id si property_id no es NULL).
  zone_id               BIGINT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,

  shift_type            VARCHAR(20) NOT NULL,
  planned_start_at      TIMESTAMPTZ NOT NULL,
  planned_end_at        TIMESTAMPTZ NOT NULL,
  actual_start_at       TIMESTAMPTZ NULL,
  actual_end_at         TIMESTAMPTZ NULL,

  status                VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  cancellation_reason   TEXT NULL,

  notes                 TEXT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id         BIGINT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id         BIGINT NULL REFERENCES users(id),
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by_id         BIGINT NULL REFERENCES users(id),

  CONSTRAINT ss_shift_type_ck CHECK (shift_type IN (
    'diurno', 'nocturno', 'extendido', 'extra'
  )),
  CONSTRAINT ss_status_ck CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'no_show', 'cancelled'
  )),
  CONSTRAINT ss_planned_range_ck CHECK (planned_end_at > planned_start_at),
  CONSTRAINT ss_actual_range_ck CHECK (
    actual_start_at IS NULL OR actual_end_at IS NULL
    OR actual_end_at >= actual_start_at
  ),
  CONSTRAINT ss_completed_consistency_ck CHECK (
    status <> 'completed'
    OR (actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL)
  ),
  CONSTRAINT ss_in_progress_consistency_ck CHECK (
    status <> 'in_progress' OR actual_start_at IS NOT NULL
  ),
  CONSTRAINT ss_cancellation_consistency_ck CHECK (
    (status = 'cancelled' AND cancellation_reason IS NOT NULL)
    OR (status <> 'cancelled')
  )
);

CREATE TRIGGER ss_touch_updated_at
  BEFORE UPDATE ON security_shifts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: guard pertenece a security_provider activo y no está terminado.
-- Validación: zone_id consistente con property.zone_id si property_id no es NULL.
CREATE OR REPLACE FUNCTION fn_ss_validate_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_guard_org BIGINT;
  v_guard_terminated DATE;
  v_property_zone BIGINT;
BEGIN
  SELECT organization_id, termination_date
    INTO v_guard_org, v_guard_terminated
    FROM security_guards WHERE id = NEW.guard_id;
  IF v_guard_org IS NULL THEN
    RAISE EXCEPTION 'security_shifts: guard % no existe', NEW.guard_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_guard_terminated IS NOT NULL AND v_guard_terminated < (NEW.planned_start_at AT TIME ZONE 'America/Santiago')::date THEN
    RAISE EXCEPTION 'security_shifts: guard % está terminado desde %; no puede tener turnos posteriores',
      NEW.guard_id, v_guard_terminated
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.property_id IS NOT NULL THEN
    SELECT zone_id INTO v_property_zone FROM properties WHERE id = NEW.property_id;
    IF v_property_zone IS NULL THEN
      RAISE EXCEPTION 'security_shifts: property % no existe', NEW.property_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_property_zone <> NEW.zone_id THEN
      RAISE EXCEPTION 'security_shifts: zone_id (%) inconsistente con property.zone_id (%) para property %',
        NEW.zone_id, v_property_zone, NEW.property_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_validate_consistency
  BEFORE INSERT OR UPDATE OF guard_id, property_id, zone_id, planned_start_at ON security_shifts
  FOR EACH ROW EXECUTE FUNCTION fn_ss_validate_consistency();

-- Máquina de estados: transiciones permitidas
--   scheduled  → in_progress | cancelled
--   in_progress → completed | no_show
--   completed / no_show / cancelled → terminales (sin transición)
CREATE OR REPLACE FUNCTION fn_ss_validate_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'scheduled' AND NEW.status IN ('in_progress', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'in_progress' AND NEW.status IN ('completed', 'no_show') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'security_shifts: transición inválida % → %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_validate_state_transition
  BEFORE UPDATE OF status ON security_shifts
  FOR EACH ROW EXECUTE FUNCTION fn_ss_validate_state_transition();

-- Hard delete prohibido (registro regulatorio).
CREATE OR REPLACE FUNCTION fn_ss_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_shifts: hard delete prohibido. Usar status=cancelled o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_no_hard_delete
  BEFORE DELETE ON security_shifts
  FOR EACH ROW EXECUTE FUNCTION fn_ss_no_hard_delete();

CREATE INDEX idx_ss_guard               ON security_shifts(guard_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_ss_zone                ON security_shifts(zone_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_ss_property            ON security_shifts(property_id)     WHERE deleted_at IS NULL AND property_id IS NOT NULL;
CREATE INDEX idx_ss_status              ON security_shifts(status)          WHERE deleted_at IS NULL;
CREATE INDEX idx_ss_planned_start_desc  ON security_shifts(planned_start_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ss_active_in_progress  ON security_shifts(guard_id, planned_start_at) WHERE deleted_at IS NULL AND status = 'in_progress';

COMMENT ON TABLE security_shifts IS
  'Turno de un guardia. Estados: scheduled → in_progress → completed (o no_show) | scheduled → cancelled. Zona obligatoria (denormalizada desde property cuando aplica). Hard delete prohibido.';


-- =============================================================================
-- 2. patrols — rondín dentro de un turno
-- =============================================================================

CREATE TABLE patrols (
  id              BIGSERIAL PRIMARY KEY,
  external_id     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  shift_id        BIGINT NOT NULL REFERENCES security_shifts(id) ON DELETE RESTRICT,

  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ NULL,

  planned_route   geometry(LineString, 4326) NULL,
  actual_route    geometry(LineString, 4326) NULL,    -- agregado de patrol_tracks por job
  distance_m      NUMERIC(12, 2) NULL,                -- ST_Length(actual_route::geography)

  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  notes           TEXT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id   BIGINT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id   BIGINT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by_id   BIGINT NULL REFERENCES users(id),

  CONSTRAINT patrols_status_ck CHECK (status IN (
    'in_progress', 'completed', 'aborted'
  )),
  CONSTRAINT patrols_range_ck CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT patrols_completed_consistency_ck CHECK (
    status <> 'completed' OR ended_at IS NOT NULL
  )
);

CREATE TRIGGER patrols_touch_updated_at
  BEFORE UPDATE ON patrols
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_patrols_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'patrols: hard delete prohibido. Usar status=aborted o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patrols_no_hard_delete
  BEFORE DELETE ON patrols
  FOR EACH ROW EXECUTE FUNCTION fn_patrols_no_hard_delete();

-- shift_id es inmutable (un rondín no se traspasa de un turno a otro).
CREATE OR REPLACE FUNCTION fn_patrols_shift_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shift_id IS DISTINCT FROM OLD.shift_id THEN
    RAISE EXCEPTION 'patrols: shift_id es inmutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patrols_shift_immutable
  BEFORE UPDATE ON patrols
  FOR EACH ROW EXECUTE FUNCTION fn_patrols_shift_immutable();

CREATE INDEX idx_patrols_shift        ON patrols(shift_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_patrols_status       ON patrols(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_patrols_started_desc ON patrols(started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_patrols_actual_route_gix ON patrols USING GIST (actual_route);

COMMENT ON TABLE patrols IS
  'Rondín dentro de un turno. actual_route se agrega desde patrol_tracks por job nightly. distance_m calculado en geografía (metros).';


-- =============================================================================
-- 3. patrol_tracks — breadcrumbs GPS particionado por mes (RANGE recorded_at)
-- =============================================================================

CREATE TABLE patrol_tracks (
  id            BIGSERIAL,
  patrol_id     BIGINT NOT NULL REFERENCES patrols(id) ON DELETE RESTRICT,
  recorded_at   TIMESTAMPTZ NOT NULL,
  location      geometry(Point, 4326) NOT NULL,
  speed_kmh     NUMERIC(6, 2) NULL,
  heading_deg   INT NULL,
  accuracy_m    NUMERIC(8, 2) NULL,
  battery_pct   INT NULL,
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (recorded_at, id),

  CONSTRAINT pt_chile_bbox_ck CHECK (
    ST_X(location) BETWEEN -110 AND -66
    AND ST_Y(location) BETWEEN -90 AND -17
  ),
  CONSTRAINT pt_heading_range_ck CHECK (heading_deg IS NULL OR heading_deg BETWEEN 0 AND 359),
  CONSTRAINT pt_battery_range_ck CHECK (battery_pct IS NULL OR battery_pct BETWEEN 0 AND 100),
  CONSTRAINT pt_speed_nonneg_ck   CHECK (speed_kmh IS NULL OR speed_kmh >= 0)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX patrol_tracks_patrol_ix    ON patrol_tracks (patrol_id, recorded_at);
CREATE INDEX patrol_tracks_location_gix ON patrol_tracks USING GIST (location);

-- patrol_tracks es append-only: nada de UPDATE ni DELETE (la corrección viene
-- de un track nuevo, no de modificar el histórico).
CREATE OR REPLACE FUNCTION fn_patrol_tracks_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'patrol_tracks: append-only. UPDATE/DELETE prohibido (crear track nuevo).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patrol_tracks_no_update
  BEFORE UPDATE ON patrol_tracks
  FOR EACH ROW EXECUTE FUNCTION fn_patrol_tracks_append_only();

CREATE TRIGGER patrol_tracks_no_delete
  BEFORE DELETE ON patrol_tracks
  FOR EACH ROW EXECUTE FUNCTION fn_patrol_tracks_append_only();

-- Particiones mensuales 2026 (cubrir el año en el seed). El worker crea
-- particiones futuras vía pg_partman o función ad-hoc.
CREATE TABLE patrol_tracks_2026_01 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE patrol_tracks_2026_02 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE patrol_tracks_2026_03 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE patrol_tracks_2026_04 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE patrol_tracks_2026_05 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE patrol_tracks_2026_06 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE patrol_tracks_2026_07 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE patrol_tracks_2026_08 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE patrol_tracks_2026_09 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE patrol_tracks_2026_10 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE patrol_tracks_2026_11 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE patrol_tracks_2026_12 PARTITION OF patrol_tracks FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

COMMENT ON TABLE patrol_tracks IS
  'Breadcrumbs GPS del rondín. Particionado por mes (RANGE recorded_at). Append-only. Worker agrega geometrías en patrols.actual_route nightly.';


-- =============================================================================
-- 4. shift_reports — parte diario que firma el guardia al cierre del turno
-- =============================================================================

CREATE TABLE shift_reports (
  id                 BIGSERIAL PRIMARY KEY,
  external_id        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  shift_id           BIGINT NOT NULL UNIQUE REFERENCES security_shifts(id) ON DELETE RESTRICT,

  submitted_at       TIMESTAMPTZ NULL,
  submitted_by_id    BIGINT NULL REFERENCES users(id),

  summary            TEXT NOT NULL,
  novelties          TEXT NULL,
  weather            TEXT NULL,
  incidents_count    INT NOT NULL DEFAULT 0,
  patrols_count      INT NOT NULL DEFAULT 0,

  -- Firma / cierre. Una vez locked=true, todo el resto de columnas es inmutable.
  locked             BOOLEAN NOT NULL DEFAULT false,
  locked_at          TIMESTAMPTZ NULL,
  locked_by_id       BIGINT NULL REFERENCES users(id),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id      BIGINT NULL REFERENCES users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id      BIGINT NULL REFERENCES users(id),
  deleted_at         TIMESTAMPTZ NULL,
  deleted_by_id      BIGINT NULL REFERENCES users(id),

  CONSTRAINT sr_summary_not_empty_ck CHECK (length(trim(summary)) > 0),
  CONSTRAINT sr_locked_consistency_ck CHECK (
    (locked = false AND locked_at IS NULL AND locked_by_id IS NULL)
    OR (locked = true AND locked_at IS NOT NULL AND locked_by_id IS NOT NULL)
  ),
  CONSTRAINT sr_counts_nonneg_ck CHECK (incidents_count >= 0 AND patrols_count >= 0)
);

CREATE TRIGGER sr_touch_updated_at
  BEFORE UPDATE ON shift_reports
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Inmutabilidad post-firma: una vez locked=true, ningún campo del cuerpo
-- puede cambiar. Solo se pueden agregar enmiendas vía un report nuevo o
-- nota separada. shift_id es inmutable siempre.
CREATE OR REPLACE FUNCTION fn_sr_immutable_when_locked()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shift_id IS DISTINCT FROM OLD.shift_id THEN
    RAISE EXCEPTION 'shift_reports: shift_id es inmutable.';
  END IF;
  IF OLD.locked = true THEN
    IF NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.novelties IS DISTINCT FROM OLD.novelties
       OR NEW.weather IS DISTINCT FROM OLD.weather
       OR NEW.incidents_count IS DISTINCT FROM OLD.incidents_count
       OR NEW.patrols_count IS DISTINCT FROM OLD.patrols_count
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
       OR NEW.locked IS DISTINCT FROM OLD.locked
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_by_id IS DISTINCT FROM OLD.locked_by_id THEN
      RAISE EXCEPTION 'shift_reports: parte firmado (locked=true) es inmutable.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sr_immutable_when_locked
  BEFORE UPDATE ON shift_reports
  FOR EACH ROW EXECUTE FUNCTION fn_sr_immutable_when_locked();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_sr_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'shift_reports: hard delete prohibido. Usar deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sr_no_hard_delete
  BEFORE DELETE ON shift_reports
  FOR EACH ROW EXECUTE FUNCTION fn_sr_no_hard_delete();

CREATE INDEX idx_sr_locked         ON shift_reports(locked)       WHERE deleted_at IS NULL;
CREATE INDEX idx_sr_submitted      ON shift_reports(submitted_at) WHERE deleted_at IS NULL AND submitted_at IS NOT NULL;

COMMENT ON TABLE shift_reports IS
  'Parte diario del turno. Uno por turno (UNIQUE shift_id). Al firmar (locked=true), todo el cuerpo queda inmutable. Hard delete prohibido.';


-- =============================================================================
-- 5. security_critical_events — eventos críticos del personal de seguridad
-- =============================================================================
-- Disparo, uso de fuerza, detención por flagrancia, lesiones, pérdida de arma,
-- amenaza con arma. Cada evento exige notificación a Carabineros (siempre),
-- a Fiscalía (cuando hay disparo o lesiones a tercero) y a OS-10 (siempre que
-- haya uso de arma o irregularidad). Suspensión preventiva del guardia es
-- obligatoria para discharge / injury_to_third_party / arm_loss.

CREATE TABLE security_critical_events (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  shift_id                    BIGINT NULL REFERENCES security_shifts(id) ON DELETE RESTRICT,
  guard_id                    BIGINT NOT NULL REFERENCES security_guards(id) ON DELETE RESTRICT,
  -- Vinculación opcional con incidente formal. Cuando el evento crítico
  -- escala a denuncia/causa, queda enganchado al incidente que lo registra.
  incident_id                 BIGINT NULL REFERENCES incidents(id) ON DELETE RESTRICT,

  event_type                  VARCHAR(40) NOT NULL,
  occurred_at                 TIMESTAMPTZ NOT NULL,
  location                    geometry(Point, 4326) NOT NULL,
  description                 TEXT NOT NULL,

  -- Personas involucradas
  third_parties_count         INT NOT NULL DEFAULT 0,
  third_parties_injured       BOOLEAN NOT NULL DEFAULT false,
  guard_injured               BOOLEAN NOT NULL DEFAULT false,

  -- Notificación a Carabineros (CPP art. 129 — entrega del aprehendido)
  police_unit_notified        BOOLEAN NOT NULL DEFAULT false,
  police_unit_id              BIGINT NULL REFERENCES police_units(id),
  police_notified_at          TIMESTAMPTZ NULL,

  -- Notificación a Fiscalía (cuando hay disparo o lesiones)
  prosecutor_office_notified  BOOLEAN NOT NULL DEFAULT false,
  prosecutor_office_id        BIGINT NULL REFERENCES prosecutor_offices(id),
  prosecutor_notified_at      TIMESTAMPTZ NULL,

  -- Notificación a OS-10 Carabineros (uso de arma / irregularidad)
  os10_notified               BOOLEAN NOT NULL DEFAULT false,
  os10_notified_at            TIMESTAMPTZ NULL,

  -- Suspensión preventiva del guardia (mientras se investiga)
  guard_suspended             BOOLEAN NOT NULL DEFAULT false,
  guard_suspended_at          TIMESTAMPTZ NULL,
  guard_suspended_until       TIMESTAMPTZ NULL,
  suspension_reason           TEXT NULL,

  notes                       TEXT NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NULL REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT NULL REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ NULL,
  deleted_by_id               BIGINT NULL REFERENCES users(id),

  CONSTRAINT sce_event_type_ck CHECK (event_type IN (
    'discharge',                 -- disparo (justificado o no)
    'use_of_force',              -- uso de fuerza física
    'flagrancy_arrest',          -- detención por flagrancia (CPP art. 129)
    'injury_to_third_party',     -- lesiones a tercero por guardia
    'injury_to_guard',           -- lesiones al propio guardia
    'arm_loss',                  -- pérdida o sustracción de arma
    'arm_use_threat',            -- amenaza con arma sin disparo
    'unauthorized_arm',          -- guardia portó arma sin autorización
    'other_critical'
  )),
  CONSTRAINT sce_chile_bbox_ck CHECK (
    ST_X(location) BETWEEN -110 AND -66
    AND ST_Y(location) BETWEEN -90 AND -17
  ),
  CONSTRAINT sce_third_parties_consistency_ck CHECK (
    third_parties_count >= 0
    AND (third_parties_injured = false OR third_parties_count >= 1)
  ),
  CONSTRAINT sce_police_consistency_ck CHECK (
    (police_unit_notified = false AND police_notified_at IS NULL)
    OR (police_unit_notified = true AND police_notified_at IS NOT NULL)
  ),
  CONSTRAINT sce_prosecutor_consistency_ck CHECK (
    (prosecutor_office_notified = false AND prosecutor_notified_at IS NULL)
    OR (prosecutor_office_notified = true AND prosecutor_notified_at IS NOT NULL)
  ),
  CONSTRAINT sce_os10_consistency_ck CHECK (
    (os10_notified = false AND os10_notified_at IS NULL)
    OR (os10_notified = true AND os10_notified_at IS NOT NULL)
  ),
  CONSTRAINT sce_suspension_consistency_ck CHECK (
    (guard_suspended = false AND guard_suspended_at IS NULL AND guard_suspended_until IS NULL AND suspension_reason IS NULL)
    OR (guard_suspended = true AND guard_suspended_at IS NOT NULL AND suspension_reason IS NOT NULL
        AND (guard_suspended_until IS NULL OR guard_suspended_until > guard_suspended_at))
  )
);

CREATE TRIGGER sce_touch_updated_at
  BEFORE UPDATE ON security_critical_events
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: si shift_id no es NULL, guard_id debe coincidir con shift.guard_id.
CREATE OR REPLACE FUNCTION fn_sce_validate_guard_shift()
RETURNS TRIGGER AS $$
DECLARE
  v_shift_guard BIGINT;
BEGIN
  IF NEW.shift_id IS NOT NULL THEN
    SELECT guard_id INTO v_shift_guard FROM security_shifts WHERE id = NEW.shift_id;
    IF v_shift_guard IS NULL THEN
      RAISE EXCEPTION 'security_critical_events: shift % no existe', NEW.shift_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_shift_guard <> NEW.guard_id THEN
      RAISE EXCEPTION 'security_critical_events: guard_id (%) inconsistente con shift.guard_id (%) para shift %',
        NEW.guard_id, v_shift_guard, NEW.shift_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sce_validate_guard_shift
  BEFORE INSERT OR UPDATE OF shift_id, guard_id ON security_critical_events
  FOR EACH ROW EXECUTE FUNCTION fn_sce_validate_guard_shift();

-- Hard delete prohibido (cadena de evidencia / responsabilidad URP).
CREATE OR REPLACE FUNCTION fn_sce_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_critical_events: hard delete prohibido. Usar deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sce_no_hard_delete
  BEFORE DELETE ON security_critical_events
  FOR EACH ROW EXECUTE FUNCTION fn_sce_no_hard_delete();

CREATE INDEX idx_sce_guard            ON security_critical_events(guard_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_sce_shift            ON security_critical_events(shift_id)        WHERE deleted_at IS NULL AND shift_id IS NOT NULL;
CREATE INDEX idx_sce_incident         ON security_critical_events(incident_id)     WHERE deleted_at IS NULL AND incident_id IS NOT NULL;
CREATE INDEX idx_sce_event_type       ON security_critical_events(event_type)      WHERE deleted_at IS NULL;
CREATE INDEX idx_sce_occurred_desc    ON security_critical_events(occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_sce_location_gix     ON security_critical_events USING GIST (location);
CREATE INDEX idx_sce_pending_notify   ON security_critical_events(occurred_at)
  WHERE deleted_at IS NULL
    AND (police_unit_notified = false OR os10_notified = false);
CREATE INDEX idx_sce_active_suspension ON security_critical_events(guard_id, guard_suspended_until)
  WHERE deleted_at IS NULL AND guard_suspended = true;

COMMENT ON TABLE security_critical_events IS
  'Eventos críticos del personal de seguridad: disparo, uso de fuerza, detención por flagrancia, lesiones, pérdida de arma. Cada evento exige notificación a Carabineros y registro de OS-10. Hard delete prohibido.';
COMMENT ON COLUMN security_critical_events.guard_suspended IS
  'Suspensión preventiva del guardia mientras se investiga. Workflow URP: disparo/lesiones-tercero/arm_loss → suspensión inmediata por defecto.';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('security_shifts');
SELECT fn_audit_attach('patrols');
-- patrol_tracks NO se enchufa: ya es append-only y el volumen sería prohibitivo
-- para audit_logs. La trazabilidad GPS ya queda en la propia tabla particionada.
SELECT fn_audit_attach('shift_reports');
SELECT fn_audit_attach('security_critical_events');
