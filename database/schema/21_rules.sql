-- =============================================================================
-- SURP 2.0 — schema/21_rules.sql
--
-- Módulo rules — motor de sugerencias de escalamiento admin-configurable.
--
-- El sistema NUNCA decide por sí solo. Codifica heurísticas (que hoy viven
-- en la cabeza del abogado URP) como sugerencias auditables; el humano
-- siempre tiene la decisión final.
--
--   1. suggestion_rules         Catálogo de reglas (admin-editable).
--   2. incident_suggestions     Sugerencias generadas por la evaluación
--                               de reglas sobre incidentes. Una fila por
--                               (incident, rule). Snapshot inmutable de la
--                               regla en el momento del trigger (la regla
--                               puede cambiar después; la sugerencia no).
--
-- Tipos de regla (rule_type):
--   amount          — threshold por monto de bienes afectados
--   incident_type   — escalar siempre por tipo (incendios, amenazas armadas)
--   reincidence     — patente/RUT recurrente en N informes en M días
--   blocklist       — entidad del informe está bloqueada (parties|vehicles)
--   prescription    — proximidad de prescripción penal
--   composite       — combinación AND/OR de las anteriores
--
-- Acciones sugeridas (suggestion_action):
--   escalate        — sugerir crear denuncia formal
--   alert_amber     — alerta amarilla (precaución)
--   alert_red       — alerta roja (acción urgente, ej. prescripción próxima)
--   flag_review     — marcar para revisión humana general
--
-- Engancha con:
--   - incidents     (FK target de la sugerencia)
--   - zones / incident_types (filtros de aplicabilidad)
--   - complaints / cases (FK opcional cuando followed=true)
--   - users (auditoría + dismissed_by + followed_by)
--   - audit_logs (vía fn_audit_attach)
--
-- Ver: apps/api/.ai-docs/standards/SUGGESTION-RULES.md
-- =============================================================================


-- =============================================================================
-- 1. suggestion_rules — catálogo de reglas
-- =============================================================================

CREATE TABLE suggestion_rules (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                        VARCHAR(80) NOT NULL UNIQUE,

  name                        VARCHAR(150) NOT NULL,
  description                 TEXT NULL,

  rule_type                   VARCHAR(30) NOT NULL,
  -- Orden de evaluación (menor = se evalúa primero). Permite priorizar reglas
  -- de prescripción sobre reglas de monto, por ejemplo.
  priority                    SMALLINT NOT NULL DEFAULT 100,

  -- Filtros de aplicabilidad. NULL = aplica a todas las zonas / todos los tipos.
  applies_to_zones            BIGINT[] NULL,
  applies_to_incident_types   BIGINT[] NULL,

  -- Parámetros específicos del rule_type. Ej. para 'amount':
  --   {"min_amount_clp": 1000000, "asset_type_codes": ["timber"]}
  -- Validación detallada en use case (no en SQL).
  criteria                    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Salida: qué se sugiere y con qué mensaje.
  suggestion_action           VARCHAR(30) NOT NULL,
  suggestion_message          TEXT NOT NULL,

  active                      BOOLEAN NOT NULL DEFAULT true,
  is_system                   BOOLEAN NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NULL REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT NULL REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ NULL,
  deleted_by_id               BIGINT NULL REFERENCES users(id),

  CONSTRAINT sr_code_format_ck CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT sr_name_not_empty_ck CHECK (length(trim(name)) > 0),
  CONSTRAINT sr_message_not_empty_ck CHECK (length(trim(suggestion_message)) > 0),
  CONSTRAINT sr_rule_type_ck CHECK (rule_type IN (
    'amount', 'incident_type', 'reincidence', 'blocklist', 'prescription', 'composite'
  )),
  CONSTRAINT sr_suggestion_action_ck CHECK (suggestion_action IN (
    'escalate', 'alert_amber', 'alert_red', 'flag_review'
  )),
  CONSTRAINT sr_priority_range_ck CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT sr_criteria_object_ck CHECK (jsonb_typeof(criteria) = 'object'),
  CONSTRAINT sr_zones_array_ck CHECK (
    applies_to_zones IS NULL OR array_length(applies_to_zones, 1) >= 1
  ),
  CONSTRAINT sr_incident_types_array_ck CHECK (
    applies_to_incident_types IS NULL OR array_length(applies_to_incident_types, 1) >= 1
  )
);

CREATE TRIGGER suggestion_rules_touch_updated_at
  BEFORE UPDATE ON suggestion_rules
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validar referencialmente que cada zone_id en applies_to_zones existe.
-- (PG no soporta FK de array; trigger compensa.)
CREATE OR REPLACE FUNCTION fn_suggestion_rules_validate_array_refs()
RETURNS TRIGGER AS $$
DECLARE
  v_zone_id BIGINT;
  v_type_id BIGINT;
  v_invalid INT;
BEGIN
  IF NEW.applies_to_zones IS NOT NULL THEN
    SELECT count(*) INTO v_invalid
    FROM unnest(NEW.applies_to_zones) AS z(id)
    LEFT JOIN zones zz ON zz.id = z.id AND zz.deleted_at IS NULL
    WHERE zz.id IS NULL;
    IF v_invalid > 0 THEN
      RAISE EXCEPTION 'suggestion_rules: applies_to_zones contiene % zone_ids inválidos', v_invalid
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  IF NEW.applies_to_incident_types IS NOT NULL THEN
    SELECT count(*) INTO v_invalid
    FROM unnest(NEW.applies_to_incident_types) AS t(id)
    LEFT JOIN incident_types it ON it.id = t.id
    WHERE it.id IS NULL;
    IF v_invalid > 0 THEN
      RAISE EXCEPTION 'suggestion_rules: applies_to_incident_types contiene % type_ids inválidos', v_invalid
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suggestion_rules_validate_array_refs
  BEFORE INSERT OR UPDATE OF applies_to_zones, applies_to_incident_types
    ON suggestion_rules
  FOR EACH ROW EXECUTE FUNCTION fn_suggestion_rules_validate_array_refs();

-- is_system protegido (mismo patrón que bands / report_definitions / catálogos).
CREATE OR REPLACE FUNCTION fn_suggestion_rules_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'suggestion_rules: no se puede borrar regla is_system=true (%)', OLD.code;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'suggestion_rules: code es inmutable cuando is_system=true (%)', OLD.code;
    END IF;
    IF NEW.rule_type IS DISTINCT FROM OLD.rule_type THEN
      RAISE EXCEPTION 'suggestion_rules: rule_type es inmutable cuando is_system=true (%)', OLD.code;
    END IF;
    IF NEW.is_system = false THEN
      RAISE EXCEPTION 'suggestion_rules: is_system no puede pasar de true a false (%)', OLD.code;
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suggestion_rules_protect_system
  BEFORE UPDATE OR DELETE ON suggestion_rules
  FOR EACH ROW EXECUTE FUNCTION fn_suggestion_rules_protect_system();

-- Hard delete prohibido en general (auditoría regulatoria).
CREATE OR REPLACE FUNCTION fn_suggestion_rules_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = false THEN
    RAISE EXCEPTION 'suggestion_rules: hard delete prohibido. Usar deleted_at o active=false.';
  END IF;
  -- Si es is_system, ya falló antes en fn_suggestion_rules_protect_system.
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suggestion_rules_no_hard_delete
  BEFORE DELETE ON suggestion_rules
  FOR EACH ROW EXECUTE FUNCTION fn_suggestion_rules_no_hard_delete();

CREATE INDEX suggestion_rules_active_ix
  ON suggestion_rules(active, priority) WHERE deleted_at IS NULL AND active = true;
CREATE INDEX suggestion_rules_rule_type_ix
  ON suggestion_rules(rule_type) WHERE deleted_at IS NULL;
CREATE INDEX suggestion_rules_zones_gin_ix
  ON suggestion_rules USING GIN (applies_to_zones)
  WHERE applies_to_zones IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX suggestion_rules_types_gin_ix
  ON suggestion_rules USING GIN (applies_to_incident_types)
  WHERE applies_to_incident_types IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE suggestion_rules IS
  'Reglas configurables que generan sugerencias de escalamiento sobre incidentes. NUNCA automatizan; siempre proponen. is_system protege code/rule_type para reglas seed.';
COMMENT ON COLUMN suggestion_rules.criteria IS
  'Parámetros del rule_type. Validación de schema en use case (TS), no en SQL. Ej. amount: {"min_amount_clp":1000000,"asset_type_codes":["timber"]}.';


-- =============================================================================
-- 2. incident_suggestions — sugerencias generadas
-- =============================================================================

CREATE TABLE incident_suggestions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  rule_id                     BIGINT NOT NULL REFERENCES suggestion_rules(id) ON DELETE RESTRICT,

  triggered_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Snapshot inmutable de la regla en el momento del trigger. Si la regla
  -- cambia (ej. admin edita threshold), la sugerencia conserva el contexto
  -- original. Patrón consistente con incident_party_links.snapshot_*.
  snapshot_rule_name          VARCHAR(150) NOT NULL,
  snapshot_rule_type          VARCHAR(30) NOT NULL,
  snapshot_suggestion_action  VARCHAR(30) NOT NULL,
  snapshot_suggestion_message TEXT NOT NULL,
  snapshot_priority           SMALLINT NOT NULL,

  -- Diagnóstico: qué valores del incidente cumplieron criteria. Útil para UI
  -- que explica al abogado por qué se gatilló.
  match_details               JSONB NULL,

  -- Estado: dismissed (descartada con motivo) y followed (seguida o no).
  -- Son ortogonales: una sugerencia se puede descartar antes de seguir, o
  -- seguir sin descartar. Hard delete prohibido.
  dismissed_at                TIMESTAMPTZ NULL,
  dismissed_by_user_id        BIGINT NULL REFERENCES users(id),
  dismiss_reason              TEXT NULL,

  followed                    BOOLEAN NULL,
  followed_at                 TIMESTAMPTZ NULL,
  followed_by_user_id         BIGINT NULL REFERENCES users(id),
  -- FK opcional si el seguimiento generó una denuncia o causa.
  followed_complaint_id       BIGINT NULL REFERENCES complaints(id),
  followed_case_id            BIGINT NULL REFERENCES cases(id),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT is_unique_per_incident_rule UNIQUE (incident_id, rule_id),
  CONSTRAINT is_snapshot_action_ck CHECK (snapshot_suggestion_action IN (
    'escalate', 'alert_amber', 'alert_red', 'flag_review'
  )),
  CONSTRAINT is_dismissed_consistency_ck CHECK (
    (dismissed_at IS NULL AND dismissed_by_user_id IS NULL AND dismiss_reason IS NULL)
    OR (dismissed_at IS NOT NULL AND dismissed_by_user_id IS NOT NULL AND dismiss_reason IS NOT NULL)
  ),
  CONSTRAINT is_followed_consistency_ck CHECK (
    (followed IS NULL AND followed_at IS NULL AND followed_by_user_id IS NULL)
    OR (followed IS NOT NULL AND followed_at IS NOT NULL AND followed_by_user_id IS NOT NULL)
  ),
  CONSTRAINT is_match_details_object_ck CHECK (
    match_details IS NULL OR jsonb_typeof(match_details) = 'object'
  )
);

CREATE TRIGGER incident_suggestions_touch_updated_at
  BEFORE UPDATE ON incident_suggestions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Snapshot inmutable post-INSERT (conserva contexto de la regla original).
-- triggered_at, incident_id, rule_id también inmutables.
CREATE OR REPLACE FUNCTION fn_incident_suggestions_snapshot_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.rule_id IS DISTINCT FROM OLD.rule_id
     OR NEW.triggered_at IS DISTINCT FROM OLD.triggered_at
     OR NEW.snapshot_rule_name IS DISTINCT FROM OLD.snapshot_rule_name
     OR NEW.snapshot_rule_type IS DISTINCT FROM OLD.snapshot_rule_type
     OR NEW.snapshot_suggestion_action IS DISTINCT FROM OLD.snapshot_suggestion_action
     OR NEW.snapshot_suggestion_message IS DISTINCT FROM OLD.snapshot_suggestion_message
     OR NEW.snapshot_priority IS DISTINCT FROM OLD.snapshot_priority THEN
    RAISE EXCEPTION 'incident_suggestions: snapshot y referencias son inmutables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_suggestions_snapshot_immutable
  BEFORE UPDATE ON incident_suggestions
  FOR EACH ROW EXECUTE FUNCTION fn_incident_suggestions_snapshot_immutable();

-- followed transición monótona: NULL → true/false (no se puede revertir el
-- valor una vez seteado, pero sí se pueden actualizar followed_complaint_id
-- y followed_case_id para vincular a la denuncia/causa creada).
CREATE OR REPLACE FUNCTION fn_incident_suggestions_followed_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.followed IS NOT NULL AND NEW.followed IS DISTINCT FROM OLD.followed THEN
    RAISE EXCEPTION 'incident_suggestions: followed no se puede revertir (% → %)', OLD.followed, NEW.followed;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_suggestions_followed_monotonic
  BEFORE UPDATE ON incident_suggestions
  FOR EACH ROW EXECUTE FUNCTION fn_incident_suggestions_followed_monotonic();

-- Hard delete prohibido (cadena de evidencia + auditoría).
CREATE OR REPLACE FUNCTION fn_incident_suggestions_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'incident_suggestions: hard delete prohibido. Usar dismissed_at o followed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_suggestions_no_hard_delete
  BEFORE DELETE ON incident_suggestions
  FOR EACH ROW EXECUTE FUNCTION fn_incident_suggestions_no_hard_delete();

CREATE INDEX incident_suggestions_incident_ix
  ON incident_suggestions(incident_id);
CREATE INDEX incident_suggestions_rule_ix
  ON incident_suggestions(rule_id);
CREATE INDEX incident_suggestions_pending_ix
  ON incident_suggestions(triggered_at DESC)
  WHERE dismissed_at IS NULL AND followed IS NULL;
CREATE INDEX incident_suggestions_active_action_ix
  ON incident_suggestions(snapshot_suggestion_action, triggered_at DESC)
  WHERE dismissed_at IS NULL AND followed IS NULL;
CREATE INDEX incident_suggestions_complaint_ix
  ON incident_suggestions(followed_complaint_id)
  WHERE followed_complaint_id IS NOT NULL;
CREATE INDEX incident_suggestions_case_ix
  ON incident_suggestions(followed_case_id)
  WHERE followed_case_id IS NOT NULL;

COMMENT ON TABLE incident_suggestions IS
  'Sugerencias generadas por evaluación de reglas sobre incidentes. Snapshot inmutable de la regla. dismissed/followed son ortogonales y monotónicos. Hard delete prohibido.';
COMMENT ON COLUMN incident_suggestions.match_details IS
  'JSONB diagnóstico de por qué gatilló la regla. Ej. {"matched_amount_clp":1500000,"threshold":1000000} para amount; {"matched_party_id":42,"matched_rut":"12345678-9"} para blocklist.';


-- =============================================================================
-- 3. Auditoría
-- =============================================================================

SELECT fn_audit_attach('suggestion_rules');
SELECT fn_audit_attach('incident_suggestions');


-- La categoría 'rules' para notification_templates está declarada
-- centralmente en 13_notifications.sql. No reaplicar el CHECK aquí.
