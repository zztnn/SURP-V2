-- =============================================================================
-- SURP 2.0 — schema/19_statistics_core.sql
--
-- Módulo statistics — Ola 1: Foundation
--
-- Catálogo + ejecución + scheduling de reportes operativos / legales /
-- regulatorios. Los reportes están **hardcoded en código** (cada uno es
-- un use case TS testeable); este schema solo modela el catálogo (sync
-- desde código, no admin-editable), las ejecuciones (log con resultado),
-- el scheduling y las suscripciones.
--
--   1. report_definitions       Catálogo de reportes (codigo, categoría,
--                               filtros disponibles, formatos de salida).
--                               Sincronizado desde código al boot, similar
--                               al patrón de permissions.catalog.ts.
--   2. report_executions        Instancia de ejecución (a demanda o por
--                               schedule). Status state machine, output
--                               persistido en StorageService.
--   3. report_schedules         Programación de ejecución periódica
--                               (cron + params).
--   4. report_subscriptions     Usuarios suscritos a un schedule (notificados
--                               cuando completa).
--
-- Engancha con:
--   - users (auditoría + suscripciones)
--   - StorageService (output_storage_uri)
--   - notifications (envía link al output cuando completa)
--   - BullMQ queue `report-runner` (worker que ejecuta el use case TS)
--
-- Nota sobre rendering: el output PDF se genera con MJML→HTML→PDF (mismo
-- stack que notifications). El binario vive en StorageService; la metadata
-- (sha256, size) en report_executions.
-- =============================================================================


-- =============================================================================
-- 1. report_definitions — catálogo (NO admin-editable; sync desde código)
-- =============================================================================

CREATE TABLE report_definitions (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                     VARCHAR(100) NOT NULL UNIQUE,

  category                 VARCHAR(40) NOT NULL,
  display_name             VARCHAR(200) NOT NULL,
  description              TEXT NULL,

  -- Filtros disponibles por reporte. Schema flexible JSONB ([{name, type, required, default}]).
  available_filters        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Formatos de salida soportados (html, pdf, csv, xlsx).
  available_outputs        JSONB NOT NULL DEFAULT '["html","pdf"]'::jsonb,

  -- Permiso requerido para ejecutar este reporte específico (granular).
  -- NULL = solo statistics.reports.execute (genérico).
  required_permission_code VARCHAR(100) NULL REFERENCES permissions(code),

  -- Estimación de tiempo de ejecución (segundos). Usado por UI para warnings.
  expected_runtime_seconds INT NULL,

  enabled                  BOOLEAN NOT NULL DEFAULT true,
  is_system                BOOLEAN NOT NULL DEFAULT true,   -- catálogo = sync desde código

  order_index              INT NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT rd_code_format_ck CHECK (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  CONSTRAINT rd_category_ck CHECK (category IN (
    'cases',                  -- gestión legal (10 del legacy)
    'incidents',              -- operativos (hallazgos, avaluo)
    'complaints',             -- follow-up de denuncias
    'surveillance',           -- shifts, patrols, eventos críticos
    'compliance',             -- OS-10, seguros, certificados próximos a vencer
    'audit',                  -- accesos a datos sensibles, brechas
    'data_protection',        -- ARCOPOL+, brechas Ley 21.719
    'general'                 -- transversales (estadística mensual)
  )),
  CONSTRAINT rd_filters_array_ck CHECK (jsonb_typeof(available_filters) = 'array'),
  CONSTRAINT rd_outputs_array_ck CHECK (jsonb_typeof(available_outputs) = 'array'),
  CONSTRAINT rd_outputs_not_empty_ck CHECK (jsonb_array_length(available_outputs) > 0),
  CONSTRAINT rd_runtime_positive_ck CHECK (expected_runtime_seconds IS NULL OR expected_runtime_seconds > 0)
);

CREATE TRIGGER rd_touch_updated_at
  BEFORE UPDATE ON report_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- is_system protegido (los del seed/sync no se pueden borrar ni renombrar code).
CREATE OR REPLACE FUNCTION fn_rd_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'report_definitions: no se puede borrar reporte is_system=true (%)', OLD.code;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'report_definitions: code es inmutable cuando is_system=true (%)', OLD.code;
    END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN
      RAISE EXCEPTION 'report_definitions: category es inmutable cuando is_system=true (%)', OLD.code;
    END IF;
    IF NEW.is_system = false THEN
      RAISE EXCEPTION 'report_definitions: is_system no puede pasar de true a false (%)', OLD.code;
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rd_protect_system
  BEFORE UPDATE OR DELETE ON report_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_rd_protect_system();

CREATE INDEX rd_category_ix ON report_definitions(category) WHERE deleted_at IS NULL;
CREATE INDEX rd_enabled_ix  ON report_definitions(enabled)  WHERE deleted_at IS NULL;

COMMENT ON TABLE report_definitions IS
  'Catálogo de reportes del sistema. Sincronizado desde código (similar a permissions). is_system protege code/category. Admin solo puede toggle enabled y editar order_index/description.';
COMMENT ON COLUMN report_definitions.required_permission_code IS
  'Permiso adicional requerido para ejecutar este reporte (granular). Si NULL, basta statistics.reports.execute.';


-- =============================================================================
-- 2. report_executions — instancia de ejecución
-- =============================================================================

CREATE TABLE report_executions (
  id                    BIGSERIAL PRIMARY KEY,
  external_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  report_definition_id  BIGINT NOT NULL REFERENCES report_definitions(id) ON DELETE RESTRICT,

  -- Trigger source
  triggered_by          VARCHAR(20) NOT NULL,
  -- Si triggered_by='schedule', schedule_id es el FK; si 'manual', user.
  schedule_id           BIGINT NULL,                   -- FK añadido tras crear schedules
  requested_by_user_id  BIGINT NULL REFERENCES users(id),

  -- Parámetros de ejecución (filtros aplicados).
  params                JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_format         VARCHAR(10) NOT NULL,

  -- Estado y temporización
  status                VARCHAR(20) NOT NULL DEFAULT 'queued',
  queued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ NULL,
  completed_at          TIMESTAMPTZ NULL,
  duration_ms           INT NULL,

  -- Output (cuando completed)
  output_storage_uri    TEXT NULL,
  output_mime_type      VARCHAR(100) NULL,
  output_size_bytes     BIGINT NULL,
  output_sha256_hash    CHAR(64) NULL,
  rows_count            INT NULL,                      -- métrica útil para reportes tabulares

  -- Error (cuando failed)
  error_code            VARCHAR(80) NULL,
  error_message         TEXT NULL,

  -- Cancelación (cuando cancelled)
  cancelled_by_user_id  BIGINT NULL REFERENCES users(id),
  cancellation_reason   TEXT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT re_triggered_by_ck CHECK (triggered_by IN ('manual', 'schedule', 'api')),
  CONSTRAINT re_status_ck CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  CONSTRAINT re_output_format_ck CHECK (output_format IN (
    'html', 'pdf', 'csv', 'xlsx', 'json'
  )),
  CONSTRAINT re_params_object_ck CHECK (jsonb_typeof(params) = 'object'),
  -- Trigger source consistency
  CONSTRAINT re_trigger_consistency_ck CHECK (
    (triggered_by = 'manual'   AND requested_by_user_id IS NOT NULL AND schedule_id IS NULL)
    OR (triggered_by = 'schedule' AND schedule_id IS NOT NULL)
    OR (triggered_by = 'api'      AND requested_by_user_id IS NULL  AND schedule_id IS NULL)
  ),
  -- Status consistency
  CONSTRAINT re_running_consistency_ck CHECK (
    status <> 'running' OR started_at IS NOT NULL
  ),
  CONSTRAINT re_completed_consistency_ck CHECK (
    status <> 'completed' OR (
      started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND output_storage_uri IS NOT NULL
      AND output_size_bytes IS NOT NULL
      AND output_size_bytes > 0
      AND output_sha256_hash IS NOT NULL
      AND output_sha256_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT re_failed_consistency_ck CHECK (
    status <> 'failed' OR (started_at IS NOT NULL AND completed_at IS NOT NULL AND error_message IS NOT NULL)
  ),
  CONSTRAINT re_cancelled_consistency_ck CHECK (
    status <> 'cancelled' OR (cancelled_by_user_id IS NOT NULL AND cancellation_reason IS NOT NULL)
  ),
  CONSTRAINT re_duration_nonneg_ck CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE TRIGGER re_touch_updated_at
  BEFORE UPDATE ON report_executions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Máquina de estados: queued → running → completed/failed; cualquiera → cancelled.
CREATE OR REPLACE FUNCTION fn_re_validate_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- queued → running | cancelled
  IF OLD.status = 'queued' AND NEW.status IN ('running', 'cancelled') THEN
    RETURN NEW;
  END IF;
  -- running → completed | failed | cancelled
  IF OLD.status = 'running' AND NEW.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN NEW;
  END IF;
  -- terminales (completed/failed/cancelled) no transicionan
  RAISE EXCEPTION 'report_executions: transición inválida % → %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER re_validate_state_transition
  BEFORE UPDATE OF status ON report_executions
  FOR EACH ROW EXECUTE FUNCTION fn_re_validate_state_transition();

-- Output inmutable post-completed (cadena de evidencia).
CREATE OR REPLACE FUNCTION fn_re_immutable_when_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    IF NEW.output_storage_uri IS DISTINCT FROM OLD.output_storage_uri
       OR NEW.output_size_bytes IS DISTINCT FROM OLD.output_size_bytes
       OR NEW.output_sha256_hash IS DISTINCT FROM OLD.output_sha256_hash
       OR NEW.output_format IS DISTINCT FROM OLD.output_format
       OR NEW.params IS DISTINCT FROM OLD.params
       OR NEW.report_definition_id IS DISTINCT FROM OLD.report_definition_id
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'report_executions: output y campos clave son inmutables tras completed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER re_immutable_when_completed
  BEFORE UPDATE ON report_executions
  FOR EACH ROW EXECUTE FUNCTION fn_re_immutable_when_completed();

-- Hard delete prohibido (trazabilidad de qué se generó y para quién).
CREATE OR REPLACE FUNCTION fn_re_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'report_executions: hard delete prohibido. Política de retención por aplicación.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER re_no_hard_delete
  BEFORE DELETE ON report_executions
  FOR EACH ROW EXECUTE FUNCTION fn_re_no_hard_delete();

CREATE INDEX re_definition_ix      ON report_executions(report_definition_id);
CREATE INDEX re_status_ix          ON report_executions(status);
CREATE INDEX re_queued_ix          ON report_executions(queued_at) WHERE status = 'queued';
CREATE INDEX re_requested_by_ix    ON report_executions(requested_by_user_id) WHERE requested_by_user_id IS NOT NULL;
CREATE INDEX re_schedule_ix        ON report_executions(schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX re_completed_at_desc  ON report_executions(completed_at DESC) WHERE status = 'completed';

COMMENT ON TABLE report_executions IS
  'Instancia de ejecución de un report_definition. Status máquina: queued→running→completed/failed/cancelled. Output inmutable tras completed. Hard delete prohibido.';


-- =============================================================================
-- 3. report_schedules — programación periódica
-- =============================================================================

CREATE TABLE report_schedules (
  id                    BIGSERIAL PRIMARY KEY,
  external_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  report_definition_id  BIGINT NOT NULL REFERENCES report_definitions(id) ON DELETE RESTRICT,

  name                  VARCHAR(200) NOT NULL,
  description           TEXT NULL,

  cron_expression       VARCHAR(100) NOT NULL,
  cron_timezone         VARCHAR(60) NOT NULL DEFAULT 'America/Santiago',

  params                JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_format         VARCHAR(10) NOT NULL DEFAULT 'pdf',

  enabled               BOOLEAN NOT NULL DEFAULT true,
  last_run_at           TIMESTAMPTZ NULL,
  next_run_at           TIMESTAMPTZ NULL,
  last_execution_id     BIGINT NULL REFERENCES report_executions(id),
  consecutive_failures  INT NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id         BIGINT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id         BIGINT NULL REFERENCES users(id),
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by_id         BIGINT NULL REFERENCES users(id),

  CONSTRAINT rs_output_format_ck CHECK (output_format IN ('html', 'pdf', 'csv', 'xlsx')),
  CONSTRAINT rs_params_object_ck CHECK (jsonb_typeof(params) = 'object'),
  CONSTRAINT rs_consecutive_failures_nonneg_ck CHECK (consecutive_failures >= 0),
  CONSTRAINT rs_name_not_empty_ck CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER rs_touch_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido (trazabilidad).
CREATE OR REPLACE FUNCTION fn_rs_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'report_schedules: hard delete prohibido. Usar deleted_at o enabled=false.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rs_no_hard_delete
  BEFORE DELETE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_rs_no_hard_delete();

CREATE INDEX rs_definition_ix       ON report_schedules(report_definition_id) WHERE deleted_at IS NULL;
CREATE INDEX rs_enabled_next_ix     ON report_schedules(next_run_at) WHERE deleted_at IS NULL AND enabled = true;
CREATE INDEX rs_consecutive_fail_ix ON report_schedules(consecutive_failures) WHERE deleted_at IS NULL AND consecutive_failures >= 3;

COMMENT ON TABLE report_schedules IS
  'Programación periódica de un reporte. cron_expression validado app-layer (no en SQL). consecutive_failures gatilla notificación al admin tras 3 fallos seguidos.';

-- FK diferida en report_executions.schedule_id (creada después de schedules).
ALTER TABLE report_executions
  ADD CONSTRAINT re_schedule_fk
  FOREIGN KEY (schedule_id) REFERENCES report_schedules(id);


-- =============================================================================
-- 4. report_subscriptions — usuarios suscritos a un schedule
-- =============================================================================

CREATE TABLE report_subscriptions (
  schedule_id    BIGINT NOT NULL REFERENCES report_schedules(id) ON DELETE RESTRICT,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Si el usuario quiere recibir el archivo adjunto o solo link a descarga.
  delivery_mode  VARCHAR(20) NOT NULL DEFAULT 'link',

  active         BOOLEAN NOT NULL DEFAULT true,
  subscribed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ NULL,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id  BIGINT NULL REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id  BIGINT NULL REFERENCES users(id),

  PRIMARY KEY (schedule_id, user_id),

  CONSTRAINT rsub_delivery_mode_ck CHECK (delivery_mode IN ('link', 'attachment')),
  CONSTRAINT rsub_active_consistency_ck CHECK (
    (active = true  AND unsubscribed_at IS NULL)
    OR (active = false AND unsubscribed_at IS NOT NULL)
  )
);

CREATE TRIGGER rsub_touch_updated_at
  BEFORE UPDATE ON report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX rsub_user_ix     ON report_subscriptions(user_id) WHERE active = true;
CREATE INDEX rsub_schedule_ix ON report_subscriptions(schedule_id) WHERE active = true;

COMMENT ON TABLE report_subscriptions IS
  'Suscripción de usuario a un schedule. Cuando completed, el worker dispara notificación al user con link o attachment según delivery_mode.';


-- =============================================================================
-- 5. Auditoría
-- =============================================================================

SELECT fn_audit_attach('report_definitions');
SELECT fn_audit_attach('report_executions');
SELECT fn_audit_attach('report_schedules');
SELECT fn_audit_attach('report_subscriptions', 'schedule_id');


-- La categoría 'statistics' para notification_templates está declarada
-- centralmente en 13_notifications.sql. No reaplicar el CHECK aquí.
