-- =============================================================================
-- SURP 2.0 — seed/13_surveillance_operations_seed.sql
--
-- Surveillance Ola 2: permisos y plantillas de notificación.
--
--   - Permisos surveillance.shifts.*, surveillance.patrols.*,
--     surveillance.shift_reports.*, surveillance.critical_events.*
--   - Asignación a roles existentes.
--   - Plantillas:
--       * surveillance.shift_started            (opt-in, supervisor)
--       * surveillance.shift_no_show            (mandatorio)
--       * surveillance.shift_report_submitted   (opt-in)
--       * surveillance.critical_event           (mandatorio — alerta inmediata)
--       * surveillance.discharge_alert          (mandatorio — disparo)
--       * surveillance.flagrancy_arrest         (mandatorio)
--       * surveillance.guard_suspended          (mandatorio)
--
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Turnos
  ('surveillance.shifts.read',     'surveillance', 'shifts', 'read',     'Leer turnos planificados y ejecutados',                          false),
  ('surveillance.shifts.schedule', 'surveillance', 'shifts', 'schedule', 'Planificar turno (status=scheduled)',                            false),
  ('surveillance.shifts.start',    'surveillance', 'shifts', 'start',    'Iniciar turno (scheduled→in_progress)',                          false),
  ('surveillance.shifts.end',      'surveillance', 'shifts', 'end',      'Cerrar turno (in_progress→completed o no_show)',                 false),
  ('surveillance.shifts.cancel',   'surveillance', 'shifts', 'cancel',   'Cancelar turno antes de iniciar',                                false),

  -- Rondines + tracks
  ('surveillance.patrols.read',         'surveillance', 'patrols', 'read',         'Leer rondines y trayectos',           false),
  ('surveillance.patrols.start',        'surveillance', 'patrols', 'start',        'Iniciar rondín dentro del turno',     false),
  ('surveillance.patrols.end',          'surveillance', 'patrols', 'end',          'Cerrar rondín',                       false),
  ('surveillance.patrols.upload_track', 'surveillance', 'patrols', 'upload_track', 'Enviar breadcrumb GPS (mobile)',      false),

  -- Parte diario
  ('surveillance.shift_reports.read',   'surveillance', 'shift_reports', 'read',   'Leer parte diario',                            false),
  ('surveillance.shift_reports.submit', 'surveillance', 'shift_reports', 'submit', 'Redactar y enviar parte diario',                false),
  ('surveillance.shift_reports.lock',   'surveillance', 'shift_reports', 'lock',   'Firmar y cerrar parte diario (acción irreversible)', true),

  -- Eventos críticos
  ('surveillance.critical_events.read',    'surveillance', 'critical_events', 'read',    'Leer eventos críticos',                                false),
  ('surveillance.critical_events.create',  'surveillance', 'critical_events', 'create',  'Reportar evento crítico (disparo, uso de fuerza, etc.)', false),
  ('surveillance.critical_events.update',  'surveillance', 'critical_events', 'update',  'Actualizar evento crítico (notificaciones, suspensión)', false),
  ('surveillance.critical_events.notify',  'surveillance', 'critical_events', 'notify',  'Registrar notificación a Carabineros / Fiscalía / OS-10', true),
  ('surveillance.critical_events.suspend', 'surveillance', 'critical_events', 'suspend', 'Aplicar suspensión preventiva al guardia',              true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Asignación a roles
-- -----------------------------------------------------------------------------

-- 2.1 administrator + patrimonial_admin reciben todos los permisos surveillance
-- (incluye los de Ola 1 ya asignados; idempotente).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('administrator', 'patrimonial_admin')
  AND p.module = 'surveillance'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — todo de operación excepto suspender (acción crítica
-- reservada al jefe URP)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.shifts.read',
    'surveillance.patrols.read',
    'surveillance.shift_reports.read',
    'surveillance.critical_events.read',
    'surveillance.critical_events.update',
    'surveillance.critical_events.notify'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.shifts.read',
    'surveillance.patrols.read',
    'surveillance.shift_reports.read',
    'surveillance.critical_events.read'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 company_admin (security_provider) — gestiona SUS turnos, rondines,
-- partes diarios y eventos críticos. NO suspende al guardia (eso lo hace URP).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.shifts.read',
    'surveillance.shifts.schedule',
    'surveillance.shifts.start',
    'surveillance.shifts.end',
    'surveillance.shifts.cancel',
    'surveillance.patrols.read',
    'surveillance.patrols.start',
    'surveillance.patrols.end',
    'surveillance.patrols.upload_track',
    'surveillance.shift_reports.read',
    'surveillance.shift_reports.submit',
    'surveillance.shift_reports.lock',
    'surveillance.critical_events.read',
    'surveillance.critical_events.create',
    'surveillance.critical_events.update',
    'surveillance.critical_events.notify'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 guard (security_provider) — el guardia SÍ accede a operación: ve sus
-- propios turnos, inicia/cierra rondines, sube tracks, firma su parte y
-- reporta evento crítico. NO ve administración corporativa (Ola 1).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.shifts.read',
    'surveillance.shifts.start',
    'surveillance.shifts.end',
    'surveillance.patrols.read',
    'surveillance.patrols.start',
    'surveillance.patrols.end',
    'surveillance.patrols.upload_track',
    'surveillance.shift_reports.read',
    'surveillance.shift_reports.submit',
    'surveillance.shift_reports.lock',
    'surveillance.critical_events.read',
    'surveillance.critical_events.create'
  )
WHERE r.name = 'guard'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Plantillas de notificación
-- -----------------------------------------------------------------------------

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('surveillance.shift_started',
   'Turno iniciado: {{guard.display_name}} en {{shift.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Turno iniciado</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Guardia: <strong>{{guard.display_name}}</strong> ({{guard.rut}})</mj-text><mj-text>Zona: {{shift.zone_name}}{{#if shift.property_name}} · Predio: {{shift.property_name}}{{/if}}</mj-text><mj-text>Tipo: {{shift.shift_type}}<br/>Inicio real: {{shift.actual_start_at}}<br/>Cierre planificado: {{shift.planned_end_at}}</mj-text><mj-button href="{{shift.url}}">Ver turno</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Turno iniciado: {{guard.display_name}} ({{guard.rut}}) en {{shift.zone_name}} ({{shift.shift_type}}). Ver: {{shift.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'surveillance', true,
   '["guard.display_name", "guard.rut", "shift.zone_name", "shift.property_name", "shift.shift_type", "shift.actual_start_at", "shift.planned_end_at", "shift.url"]'::jsonb, 1800),

  ('surveillance.shift_no_show',
   '[NO SHOW] Guardia {{guard.display_name}} no se presentó al turno',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Guardia ausente</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El guardia <strong>{{guard.display_name}}</strong> ({{guard.rut}}) no se presentó al turno planificado.</mj-text><mj-text>Empresa: {{contractor.name}}<br/>Zona: {{shift.zone_name}}<br/>Inicio planificado: {{shift.planned_start_at}}</mj-text><mj-text>El predio queda sin cobertura. Activar protocolo de reemplazo con el contratista.</mj-text><mj-button href="{{shift.url}}" background-color="#c62828">Ver turno</mj-button></mj-column></mj-section></mj-body></mjml>',
   'NO SHOW: {{guard.display_name}} ({{guard.rut}}) no se presentó al turno en {{shift.zone_name}}. Empresa: {{contractor.name}}. Inicio planificado: {{shift.planned_start_at}}.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["guard.display_name", "guard.rut", "contractor.name", "shift.zone_name", "shift.planned_start_at", "shift.url"]'::jsonb, 1810),

  ('surveillance.shift_report_submitted',
   'Parte diario enviado: {{guard.display_name}} — {{shift.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Parte diario</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El guardia <strong>{{guard.display_name}}</strong> firmó el parte diario del turno en {{shift.zone_name}}.</mj-text><mj-text>Resumen: {{report.summary_excerpt}}<br/>Incidentes reportados: {{report.incidents_count}}<br/>Rondines: {{report.patrols_count}}</mj-text><mj-button href="{{report.url}}">Ver parte completo</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Parte diario firmado por {{guard.display_name}} en {{shift.zone_name}}. {{report.incidents_count}} incidentes / {{report.patrols_count}} rondines. Ver: {{report.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'surveillance', true,
   '["guard.display_name", "shift.zone_name", "report.summary_excerpt", "report.incidents_count", "report.patrols_count", "report.url"]'::jsonb, 1820),

  ('surveillance.critical_event',
   '[CRÍTICO] {{event.event_type_label}} — {{guard.display_name}} en {{event.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ EVENTO CRÍTICO SURP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text font-size="16px" font-weight="bold">{{event.event_type_label}}</mj-text><mj-text>Guardia: <strong>{{guard.display_name}}</strong> ({{guard.rut}})<br/>Empresa: {{contractor.name}}<br/>Zona: {{event.zone_name}}{{#if event.property_name}} · Predio: {{event.property_name}}{{/if}}<br/>Hora: {{event.occurred_at}}</mj-text><mj-text>Terceros involucrados: {{event.third_parties_count}}{{#if event.third_parties_injured}} (con lesionados){{/if}}<br/>Guardia lesionado: {{event.guard_injured}}</mj-text><mj-text>{{event.description}}</mj-text><mj-button href="{{event.url}}" background-color="#c62828">Atender en SURP</mj-button></mj-column></mj-section></mj-body></mjml>',
   'EVENTO CRÍTICO {{event.event_type_label}}: guardia {{guard.display_name}} ({{guard.rut}}) en {{event.zone_name}} a las {{event.occurred_at}}. Empresa {{contractor.name}}. {{event.description}} Ver: {{event.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["event.event_type_label", "event.zone_name", "event.property_name", "event.occurred_at", "event.third_parties_count", "event.third_parties_injured", "event.guard_injured", "event.description", "event.url", "guard.display_name", "guard.rut", "contractor.name"]'::jsonb, 1830),

  ('surveillance.discharge_alert',
   '[DISPARO] Guardia {{guard.display_name}} efectuó disparo en {{event.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ DISPARO REPORTADO</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Guardia: <strong>{{guard.display_name}}</strong> ({{guard.rut}})<br/>Empresa: {{contractor.name}}<br/>Zona: {{event.zone_name}}<br/>Hora: {{event.occurred_at}}</mj-text><mj-text>Lesionados terceros: {{event.third_parties_injured}}<br/>Guardia lesionado: {{event.guard_injured}}</mj-text><mj-text>{{event.description}}</mj-text><mj-text font-weight="bold">Acciones obligatorias:</mj-text><mj-text>1. Notificar Carabineros + Ministerio Público inmediatamente<br/>2. Informar OS-10<br/>3. Suspensión preventiva del guardia mientras se investiga</mj-text><mj-button href="{{event.url}}" background-color="#c62828">Coordinar respuesta</mj-button></mj-column></mj-section></mj-body></mjml>',
   'DISPARO reportado: {{guard.display_name}} ({{guard.rut}}) en {{event.zone_name}} a las {{event.occurred_at}}. Lesionados: terceros={{event.third_parties_injured}} guardia={{event.guard_injured}}. Notificar Carabineros + MP + OS-10. Ver: {{event.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["guard.display_name", "guard.rut", "contractor.name", "event.zone_name", "event.occurred_at", "event.third_parties_injured", "event.guard_injured", "event.description", "event.url"]'::jsonb, 1840),

  ('surveillance.flagrancy_arrest',
   '[Flagrancia] Detención por {{guard.display_name}} en {{event.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#ef6c00" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Detención por flagrancia</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El guardia <strong>{{guard.display_name}}</strong> realizó una detención por flagrancia (CPP art. 129).</mj-text><mj-text>Zona: {{event.zone_name}}<br/>Hora: {{event.occurred_at}}<br/>Personas detenidas: {{event.third_parties_count}}</mj-text><mj-text>{{event.description}}</mj-text><mj-text font-weight="bold">Verificar entrega inmediata a Carabineros + acta.</mj-text><mj-button href="{{event.url}}" background-color="#ef6c00">Ver evento</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Detención por flagrancia: {{guard.display_name}} en {{event.zone_name}} a las {{event.occurred_at}}. {{event.third_parties_count}} detenidos. Verificar entrega Carabineros. Ver: {{event.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["guard.display_name", "event.zone_name", "event.occurred_at", "event.third_parties_count", "event.description", "event.url"]'::jsonb, 1850),

  ('surveillance.guard_suspended',
   '[Suspensión] Guardia {{guard.display_name}} suspendido preventivamente',
   '<mjml><mj-body><mj-section background-color="#ef6c00" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Suspensión preventiva</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El guardia <strong>{{guard.display_name}}</strong> ({{guard.rut}}) fue suspendido preventivamente.</mj-text><mj-text>Empresa: {{contractor.name}}<br/>Evento: {{event.event_type_label}}<br/>Desde: {{suspension.from}}{{#if suspension.until}}<br/>Hasta: {{suspension.until}}{{/if}}</mj-text><mj-text>Razón: {{suspension.reason}}</mj-text><mj-text>Sus turnos planificados deben ser reasignados por el contratista.</mj-text><mj-button href="{{event.url}}" background-color="#ef6c00">Ver evento</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Guardia {{guard.display_name}} ({{guard.rut}}) suspendido desde {{suspension.from}} por {{event.event_type_label}}. Empresa: {{contractor.name}}. Razón: {{suspension.reason}}. Ver: {{event.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["guard.display_name", "guard.rut", "contractor.name", "event.event_type_label", "event.url", "suspension.from", "suspension.until", "suspension.reason"]'::jsonb, 1860)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_patrimonial_admin_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
  v_templates INT;
  v_mandatory INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'surveillance';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'surveillance';

  SELECT count(*) INTO v_patrimonial_admin_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial_admin' AND p.module = 'surveillance';

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module = 'surveillance';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'surveillance';

  SELECT count(*) INTO v_templates FROM notification_templates WHERE category = 'surveillance';
  SELECT count(*) INTO v_mandatory FROM notification_templates WHERE category = 'surveillance' AND is_mandatory = true;

  IF v_total_perms < 33 THEN  -- 16 (Ola 1) + 17 (Ola 2)
    RAISE EXCEPTION 'seed/13: surveillance permisos incompleto (%)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/13: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/13: patrimonial_admin no tiene todos (%/%)', v_patrimonial_admin_perms, v_total_perms;
  END IF;
  IF v_guard_perms < 12 THEN
    RAISE EXCEPTION 'seed/13: guard debe tener permisos operacionales (got %)', v_guard_perms;
  END IF;
  IF v_templates < 14 THEN  -- 7 Ola 1 + 7 Ola 2
    RAISE EXCEPTION 'seed/13: faltan plantillas surveillance (%)', v_templates;
  END IF;
  IF v_mandatory < 10 THEN  -- 5 Ola 1 + 5 Ola 2 mandatorias
    RAISE EXCEPTION 'seed/13: faltan plantillas mandatorias surveillance (%)', v_mandatory;
  END IF;

  RAISE NOTICE 'seed/13 OK — surveillance total perms=% admin=% patrimonial_admin=% company_admin=% guard=% templates=% mandatory=%',
    v_total_perms, v_admin_perms, v_patrimonial_admin_perms,
    v_company_admin_perms, v_guard_perms, v_templates, v_mandatory;
END;
$$;
