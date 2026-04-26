-- =============================================================================
-- SURP 2.0 — seed/06_legal_deadlines.sql
--
-- Catálogo de los 10 plazos legales MVP del módulo cases.
-- Referencia: CASES-MODULE-VISION.md §5.1.
--
-- Idempotente: ON CONFLICT (code) DO NOTHING.
--
-- Convenciones:
--   - duration_unit: hours / days / weeks / months / years
--   - business_days=true sólo válido con duration_unit='days' (CHECK del schema)
--   - alert_thresholds: array JSONB, cada elemento es:
--       {"days_before": N, "severity": "low|medium|high|critical"} ó
--       {"hours_before": N, "severity": "..."}
--   - triggered_by_milestone_type_code: hito de case_milestone_types que dispara
--     el plazo (NULL = lo crea el use case desde evento externo).
--   - fulfilled_by_milestone_type_codes: array de codes que cumplen el plazo
--     (no es FK; validación en lógica de aplicación).
-- =============================================================================

INSERT INTO legal_deadline_catalog (
  code, description, duration_value, duration_unit, business_days,
  triggered_by_milestone_type_code, fulfilled_by_milestone_type_codes,
  alert_thresholds, legal_reference, applicable_to_matter, severity_default,
  is_system, order_index
) VALUES

  -- 1. Denuncia obligatoria del jefe de empresa (CPP arts. 175-176).
  -- Disparador: conocimiento del hecho (= creación del incidente; gatilla
  -- desde módulo incidents, no desde case_milestone_types).
  ('DENUNCIA_OBLIGATORIA_24H',
   'Denuncia obligatoria del jefe de empresa al tomar conocimiento del hecho',
   24, 'hours', false,
   NULL,
   ARRAY['DENUNCIA_PRESENTADA', 'DENUNCIA_DIRECTA', 'DENUNCIA_POLICIAL'],
   '[{"hours_before": 12, "severity": "critical"}]'::jsonb,
   'CPP arts. 175-176', 'PENAL', 'critical', true, 10),

  -- 2. Prescripción acción penal — falta (CP art. 94).
  ('PRESCRIPCION_FALTA',
   'Prescripción acción penal — falta',
   6, 'months', false,
   NULL,  -- disparado por incident.occurred_at desde el use case
   ARRAY['FORMALIZATION'],
   '[{"days_before": 30, "severity": "high"}]'::jsonb,
   'CP art. 94', 'PENAL', 'high', true, 20),

  -- 3. Prescripción acción penal — simple delito.
  ('PRESCRIPCION_SIMPLE_DELITO',
   'Prescripción acción penal — simple delito',
   5, 'years', false,
   NULL,
   ARRAY['FORMALIZATION'],
   '[{"days_before": 90, "severity": "medium"}]'::jsonb,
   'CP art. 94', 'PENAL', 'medium', true, 30),

  -- 4. Prescripción acción penal — crimen.
  ('PRESCRIPCION_CRIMEN',
   'Prescripción acción penal — crimen',
   10, 'years', false,
   NULL,
   ARRAY['FORMALIZATION'],
   '[{"days_before": 180, "severity": "medium"}]'::jsonb,
   'CP art. 94', 'PENAL', 'medium', true, 40),

  -- 5. Cierre máximo de investigación formalizada (CPP art. 234).
  ('CIERRE_INVESTIGACION_FORMALIZADA',
   'Cierre máximo de investigación formalizada',
   2, 'years', false,
   'FORMALIZATION',
   ARRAY['CIERRE_INVESTIGACION'],
   '[{"days_before": 90, "severity": "high"}]'::jsonb,
   'CPP art. 234', 'PENAL', 'high', true, 50),

  -- 6. Decisión fiscal post-cierre (CPP art. 248).
  ('DECISION_FISCAL_POST_CIERRE',
   'Decisión fiscal tras cierre de investigación (acusar / sobreseer / no perseverar)',
   10, 'days', false,
   'CIERRE_INVESTIGACION',
   ARRAY['ACUSACION', 'SOBRESEIMIENTO_DEFINITIVO', 'SOBRESEIMIENTO_TEMPORAL', 'NO_PERSEVERAR'],
   '[{"days_before": 3, "severity": "high"}]'::jsonb,
   'CPP art. 248', 'PENAL', 'high', true, 60),

  -- 7. Recurso de apelación (CPP art. 366) — 5 días HÁBILES.
  ('RECURSO_APELACION',
   'Plazo de apelación contra resolución del JG',
   5, 'days', true,
   'NOTIFICACION_RESOLUCION_APELABLE',
   ARRAY['RECURSO_APELACION'],
   '[{"days_before": 2, "severity": "critical"}]'::jsonb,
   'CPP art. 366', 'PENAL', 'critical', true, 70),

  -- 8. Recurso de nulidad (CPP art. 372) — 10 días corridos.
  ('RECURSO_NULIDAD',
   'Plazo de recurso de nulidad contra sentencia definitiva',
   10, 'days', false,
   'NOTIFICACION_SENTENCIA_DEFINITIVA',
   ARRAY['RECURSO_APELACION'],  -- hito genérico de recurso (TODO: agregar RECURSO_NULIDAD a milestone_types)
   '[{"days_before": 5, "severity": "high"}]'::jsonb,
   'CPP art. 372', 'PENAL', 'high', true, 80),

  -- 9. Acción civil en proceso penal (CPP art. 60) — 15 días HÁBILES antes APJO.
  -- Caso especial: el plazo se calcula como "antes de" un evento futuro, no
  -- "después de" un disparador. El use case computa el triggered_at como
  --   APJO.scheduled_at - (15 business days)
  -- y crea el deadline con due_at = APJO.scheduled_at. triggered_by NULL.
  ('ACCION_CIVIL_EN_PROCESO_PENAL',
   'Acción civil dentro del proceso penal — hasta 15 días hábiles antes de APJO',
   15, 'days', true,
   NULL,
   ARRAY['ACCION_CIVIL_PRESENTADA'],  -- TODO: agregar como milestone
   '[{"days_before": 30, "severity": "medium"}]'::jsonb,
   'CPP art. 60', 'PENAL', 'medium', true, 90),

  -- 10. Reclamación administrativa CONAF (Ley 20.283 art. 24) — 30 días HÁBILES.
  ('RECLAMACION_CONAF',
   'Reclamación administrativa CONAF',
   30, 'days', true,
   'NOTIFICACION_RESOLUCION_CONAF',
   ARRAY['RECLAMACION_CONAF_PRESENTADA'],
   '[{"days_before": 10, "severity": "medium"}]'::jsonb,
   'Ley 20.283 art. 24', 'ADMIN', 'medium', true, 100)

ON CONFLICT (code) DO NOTHING;


-- Verificación
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM legal_deadline_catalog WHERE is_system = true;
  IF v_count < 10 THEN
    RAISE EXCEPTION 'seed/06: legal_deadline_catalog incompleto (%)', v_count;
  END IF;
  RAISE NOTICE 'seed/06 OK — % plazos legales cargados', v_count;
END;
$$;
