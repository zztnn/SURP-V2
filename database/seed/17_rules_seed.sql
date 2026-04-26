-- =============================================================================
-- SURP 2.0 — seed/17_rules_seed.sql
--
-- Rules — permisos + 6 reglas semilla + 3 notification templates.
--
-- Reglas iniciales (is_system=true; admin puede toggle active pero no
-- borrar ni cambiar code/rule_type):
--
--   1. rule.fire.escalate_always               Todo incendio escala
--   2. rule.threats.escalate_always            Toda amenaza escala
--   3. rule.amount.timber_high_value           Robo madera > 1M CLP
--   4. rule.blocklist.party_blocked            Algún RUT del informe está bloqueado
--   5. rule.prescription.simple_delito_amber   Prescripción a < 12 meses (amarilla)
--   6. rule.prescription.simple_delito_red     Prescripción a < 90 días (roja)
--
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  ('rules.rules.read',       'rules', 'rules', 'read',       'Leer catálogo de reglas',                              false),
  ('rules.rules.create',     'rules', 'rules', 'create',     'Crear nueva regla',                                     false),
  ('rules.rules.update',     'rules', 'rules', 'update',     'Editar regla (criteria, mensaje, prioridad, active)',  false),
  ('rules.rules.deactivate', 'rules', 'rules', 'deactivate', 'Desactivar regla',                                      false),
  ('rules.rules.preview',    'rules', 'rules', 'preview',    'Simular impacto de regla antes de activar',             false),

  ('rules.suggestions.read',          'rules', 'suggestions', 'read',          'Leer sugerencias generadas',                       false),
  ('rules.suggestions.dismiss',       'rules', 'suggestions', 'dismiss',       'Descartar sugerencia con motivo',                  false),
  ('rules.suggestions.mark_followed', 'rules', 'suggestions', 'mark_followed', 'Marcar sugerencia como seguida (escalada o no)', false)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Asignación a roles
-- -----------------------------------------------------------------------------

-- 2.1 administrator + patrimonial_admin: TODO
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('administrator', 'patrimonial_admin')
  AND p.module = 'rules'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — leer reglas + actuar sobre sugerencias (NO crear/editar reglas).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'rules.rules.read',
    'rules.suggestions.read',
    'rules.suggestions.dismiss',
    'rules.suggestions.mark_followed'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer / lawyer_admin / field_lawyer / external_lawyer — actuar sobre
-- sugerencias (la decisión legal de escalar es de ellos).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'rules.rules.read',
    'rules.suggestions.read',
    'rules.suggestions.dismiss',
    'rules.suggestions.mark_followed'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- lawyer_admin además puede crear/editar/preview reglas (gestión legal estratégica).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN ('rules.rules.create', 'rules.rules.update', 'rules.rules.preview', 'rules.rules.deactivate')
WHERE r.name = 'lawyer_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN ('rules.rules.read', 'rules.suggestions.read')
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — sin acceso (decisión legal es URP).
-- 2.6 guard — sin acceso.


-- -----------------------------------------------------------------------------
-- 3. Reglas semilla (is_system=true)
-- -----------------------------------------------------------------------------
-- Insertadas con criteria conservador: códigos en strings (resueltos a IDs
-- en runtime por el use case TS). Los thresholds son **placeholders iniciales**;
-- se ajustan tras el workshop URP con data real.

INSERT INTO suggestion_rules (
  code, name, description, rule_type,
  applies_to_incident_types, criteria,
  suggestion_action, suggestion_message,
  priority, active, is_system
) VALUES

  -- 1. Todo incendio escala
  ('rule.fire.escalate_always',
   'Incendios escalan siempre',
   'Cualquier incidente de tipo Incendio (FIRE) sugiere escalar a denuncia/CONAF. Por su gravedad y posible tipificación penal (CP arts. 474-481 + Ley 20.653), no se cierra sin denuncia.',
   'incident_type',
   NULL,
   '{"incident_type_codes":["FIRE"]}'::jsonb,
   'escalate',
   'Todo incendio se denuncia. Coordinar con CONAF (Ley 20.653) y, si hubo intencionalidad o lesiones, con Fiscalía.',
   10, true, true),

  -- 2. Toda amenaza escala
  ('rule.threats.escalate_always',
   'Amenazas escalan siempre',
   'Toda amenaza (THREATS) sugiere escalar a Carabineros + Fiscalía sin importar monto.',
   'incident_type',
   NULL,
   '{"incident_type_codes":["THREATS"]}'::jsonb,
   'escalate',
   'Las amenazas a personal Arauco / contratistas se denuncian. Posible tipificación penal según contenido (CP art. 296).',
   20, true, true),

  -- 3. Robo madera > 1M CLP
  ('rule.amount.timber_high_value',
   'Robo de madera de alto valor',
   'Si el avaluo de bienes afectados de tipo madera supera $1.000.000 CLP, sugerir escalar.',
   'amount',
   NULL,
   '{"min_amount_clp":1000000,"asset_type_codes":["WOOD","TIMBER"],"incident_type_codes":["THEFT_TIMBER","ILLEGAL_LOGGING"]}'::jsonb,
   'escalate',
   'Robo de madera con avaluo significativo. Considerar querella (no solo denuncia) por la entidad económica.',
   30, true, true),

  -- 4. Algún RUT bloqueado en el informe
  ('rule.blocklist.party_blocked',
   'Persona bloqueada en el informe',
   'Si algún party (persona o empresa) vinculado al informe tiene un block activo, sugerir escalar para revisión.',
   'blocklist',
   NULL,
   '{"target_types":["party"]}'::jsonb,
   'escalate',
   'El informe involucra a una persona/empresa con bloqueo activo en SURP. Revisar antecedentes antes de cerrar y considerar denuncia.',
   15, true, true),

  -- 5. Prescripción próxima — alerta amarilla
  ('rule.prescription.simple_delito_amber',
   'Prescripción de simple delito a < 12 meses',
   'Informes cuya fecha de ocurrencia se acerca al plazo de prescripción de simple delito (5 años) — alerta amarilla cuando faltan menos de 12 meses.',
   'prescription',
   NULL,
   '{"days_to_prescription_threshold":365,"applies_to_severity":"simple_delito","prescription_years":5}'::jsonb,
   'alert_amber',
   'Este informe se acerca a la prescripción de simple delito (5 años). Si va a denunciarse, hacerlo dentro de los próximos 12 meses.',
   40, true, true),

  -- 6. Prescripción muy próxima — alerta roja
  ('rule.prescription.simple_delito_red',
   'Prescripción de simple delito a < 90 días',
   'Informes a menos de 90 días de prescripción — alerta roja, requiere acción urgente.',
   'prescription',
   NULL,
   '{"days_to_prescription_threshold":90,"applies_to_severity":"simple_delito","prescription_years":5}'::jsonb,
   'alert_red',
   'URGENTE: este informe prescribe en menos de 90 días. Acción inmediata requerida — denunciar o documentar formalmente la decisión de no escalar.',
   5, true, true)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Notification templates
-- -----------------------------------------------------------------------------

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('rules.suggestion_triggered',
   'Sugerencia para informe {{incident.code}}: {{rule.name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Sugerencia activada</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Se activó una sugerencia sobre el informe <strong>{{incident.code}}</strong>.</mj-text><mj-text>Regla: {{rule.name}}<br/>Acción sugerida: <strong>{{suggestion.action}}</strong></mj-text><mj-text>{{suggestion.message}}</mj-text><mj-button href="{{incident.url}}">Revisar informe</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Sugerencia sobre informe {{incident.code}} ({{rule.name}}, acción {{suggestion.action}}): {{suggestion.message}}. Ver: {{incident.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'rules', true,
   '["incident.code", "incident.url", "rule.name", "suggestion.action", "suggestion.message"]'::jsonb, 2100),

  ('rules.suggestion_alert_red',
   '[URGENTE] Alerta roja en informe {{incident.code}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ ALERTA ROJA SURP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text font-weight="bold">Informe {{incident.code}} requiere acción inmediata.</mj-text><mj-text>Regla: {{rule.name}}</mj-text><mj-text>{{suggestion.message}}</mj-text><mj-text>Zona: {{incident.zone_name}}<br/>Fecha hechos: {{incident.occurred_at}}</mj-text><mj-button href="{{incident.url}}" background-color="#c62828">Atender ahora</mj-button></mj-column></mj-section></mj-body></mjml>',
   'ALERTA ROJA en informe {{incident.code}} (zona {{incident.zone_name}}): {{rule.name}}. {{suggestion.message}}. Ver: {{incident.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'rules', true,
   '["incident.code", "incident.url", "incident.zone_name", "incident.occurred_at", "rule.name", "suggestion.message"]'::jsonb, 2110),

  ('rules.suggestion_overdue',
   '[Vencido] Sugerencia roja sin acción en {{days_overdue}} días',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Sugerencia vencida</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La sugerencia roja sobre el informe <strong>{{incident.code}}</strong> lleva {{days_overdue}} días sin acción.</mj-text><mj-text>Regla: {{rule.name}}<br/>Triggered: {{suggestion.triggered_at}}</mj-text><mj-text>{{suggestion.message}}</mj-text><mj-button href="{{incident.url}}" background-color="#c62828">Atender</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Sugerencia roja sobre {{incident.code}} sin acción hace {{days_overdue}} días. {{rule.name}}: {{suggestion.message}}. Ver: {{incident.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'rules', true,
   '["incident.code", "incident.url", "rule.name", "suggestion.message", "suggestion.triggered_at", "days_overdue"]'::jsonb, 2120)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_lawyer_perms INT;
  v_lawyer_admin_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
  v_rules INT;
  v_rules_system INT;
  v_rule_types INT;
  v_actions INT;
  v_templates INT;
  v_mandatory INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'rules';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'rules';

  SELECT count(*) INTO v_lawyer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer' AND p.module = 'rules';

  SELECT count(*) INTO v_lawyer_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer_admin' AND p.module = 'rules';

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module = 'rules';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'rules';

  SELECT count(*) INTO v_rules FROM suggestion_rules WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_rules_system FROM suggestion_rules WHERE deleted_at IS NULL AND is_system = true;
  SELECT count(DISTINCT rule_type) INTO v_rule_types FROM suggestion_rules WHERE deleted_at IS NULL;
  SELECT count(DISTINCT suggestion_action) INTO v_actions FROM suggestion_rules WHERE deleted_at IS NULL;

  SELECT count(*) INTO v_templates FROM notification_templates WHERE category = 'rules';
  SELECT count(*) INTO v_mandatory FROM notification_templates WHERE category = 'rules' AND is_mandatory = true;

  IF v_total_perms <> 8 THEN
    RAISE EXCEPTION 'seed/17: rules permisos = % (esperaba 8)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/17: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_company_admin_perms <> 0 OR v_guard_perms <> 0 THEN
    RAISE EXCEPTION 'seed/17: company_admin/guard no deben tener permisos rules (got % y %)', v_company_admin_perms, v_guard_perms;
  END IF;
  IF v_rules <> 6 THEN
    RAISE EXCEPTION 'seed/17: reglas seed = % (esperaba 6)', v_rules;
  END IF;
  IF v_rules_system <> v_rules THEN
    RAISE EXCEPTION 'seed/17: todas las reglas seed deben ser is_system (% / %)', v_rules_system, v_rules;
  END IF;
  IF v_rule_types < 4 THEN
    RAISE EXCEPTION 'seed/17: faltan rule_types representados (got %)', v_rule_types;
  END IF;
  IF v_actions < 2 THEN
    RAISE EXCEPTION 'seed/17: faltan suggestion_actions (got %)', v_actions;
  END IF;
  IF v_templates <> 3 THEN
    RAISE EXCEPTION 'seed/17: templates rules = % (esperaba 3)', v_templates;
  END IF;
  IF v_mandatory <> 2 THEN
    RAISE EXCEPTION 'seed/17: templates mandatorios = % (esperaba 2)', v_mandatory;
  END IF;

  RAISE NOTICE 'seed/17 OK — rules perms=% rules=% (system=%) types=% actions=% templates=% mandatory=%; admin=% lawyer=% lawyer_admin=% company_admin=% guard=%',
    v_total_perms, v_rules, v_rules_system, v_rule_types, v_actions, v_templates, v_mandatory,
    v_admin_perms, v_lawyer_perms, v_lawyer_admin_perms, v_company_admin_perms, v_guard_perms;
END;
$$;
