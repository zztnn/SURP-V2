-- =============================================================================
-- SURP 2.0 — seed/16_statistics_seed.sql
--
-- Statistics — catálogo de reportes (19) + permisos + notification templates.
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Reports
  ('statistics.reports.read',        'statistics', 'reports', 'read',        'Leer catálogo de reportes',                                  false),
  ('statistics.reports.execute',     'statistics', 'reports', 'execute',     'Ejecutar reporte a demanda',                                  false),
  ('statistics.reports.view_results','statistics', 'reports', 'view_results','Ver resultados de ejecuciones (lista + metadata)',           false),
  ('statistics.reports.download',    'statistics', 'reports', 'download',    'Descargar archivo de reporte (acción auditada)',             true),
  ('statistics.reports.cancel',      'statistics', 'reports', 'cancel',      'Cancelar ejecución en curso',                                 false),
  -- Granular: reportes con datos sensibles (audit + data_protection)
  ('statistics.reports.execute_audit', 'statistics', 'reports', 'execute_audit', 'Ejecutar reportes de auditoría (accesos a datos sensibles)', true),
  ('statistics.reports.execute_data_protection', 'statistics', 'reports', 'execute_data_protection', 'Ejecutar reportes Ley 21.719 (ARCOPOL+, brechas)', true),

  -- Schedules
  ('statistics.schedules.read',   'statistics', 'schedules', 'read',   'Leer programación de reportes',          false),
  ('statistics.schedules.create', 'statistics', 'schedules', 'create', 'Crear nueva programación',                false),
  ('statistics.schedules.update', 'statistics', 'schedules', 'update', 'Actualizar programación',                 false),
  ('statistics.schedules.delete', 'statistics', 'schedules', 'delete', 'Eliminar programación (soft delete)',     false),

  -- Subscriptions
  ('statistics.subscriptions.read_own',   'statistics', 'subscriptions', 'read_own',   'Leer mis suscripciones',         false),
  ('statistics.subscriptions.manage_own', 'statistics', 'subscriptions', 'manage_own', 'Suscribirse/desuscribirse',     false),
  ('statistics.subscriptions.manage_any', 'statistics', 'subscriptions', 'manage_any', 'Gestionar suscripciones de cualquier usuario', true)
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
  AND p.module = 'statistics'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — ejecutar reportes operativos + ver resultados + suscripciones,
-- sin acceso a reportes de auditoría/data_protection.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'statistics.reports.read',
    'statistics.reports.execute',
    'statistics.reports.view_results',
    'statistics.reports.download',
    'statistics.reports.cancel',
    'statistics.schedules.read',
    'statistics.subscriptions.read_own',
    'statistics.subscriptions.manage_own'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer / lawyer_admin / field_lawyer / external_lawyer — reportes legales
-- (las 10 categorías 'cases' del legacy + 'complaints' + 'data_protection').
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'statistics.reports.read',
    'statistics.reports.execute',
    'statistics.reports.view_results',
    'statistics.reports.download',
    'statistics.reports.cancel',
    'statistics.schedules.read',
    'statistics.subscriptions.read_own',
    'statistics.subscriptions.manage_own'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- lawyer_admin además puede crear/gestionar schedules y ejecutar data_protection.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'statistics.schedules.create',
    'statistics.schedules.update',
    'statistics.reports.execute_data_protection'
  )
WHERE r.name = 'lawyer_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — read + view_results + download
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'statistics.reports.read',
    'statistics.reports.view_results',
    'statistics.reports.download',
    'statistics.subscriptions.read_own',
    'statistics.subscriptions.manage_own'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — ejecutar reportes operativos sobre
-- SU empresa (filtro app-layer) + ver resultados + descarga.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'statistics.reports.read',
    'statistics.reports.execute',
    'statistics.reports.view_results',
    'statistics.reports.download',
    'statistics.subscriptions.read_own',
    'statistics.subscriptions.manage_own'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard — sin acceso a statistics.


-- -----------------------------------------------------------------------------
-- 3. Catálogo de reportes (19 reports)
-- -----------------------------------------------------------------------------

INSERT INTO report_definitions (
  code, category, display_name, description,
  available_filters, available_outputs,
  required_permission_code, expected_runtime_seconds,
  enabled, is_system, order_index
) VALUES

  -- ========== Cases (10 del legacy) ==========
  ('cases.causas_por_zona',
   'cases', 'Causas por zona',
   'Distribución de causas judiciales por zona Arauco en un rango de fechas.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true},{"name":"zone_ids","type":"int[]","required":false}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 8, true, true, 100),

  ('cases.causas_por_abogado',
   'cases', 'Causas por abogado',
   'Distribución de causas activas por abogado (titular + apoyo) en un rango de fechas.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true},{"name":"attorney_ids","type":"int[]","required":false}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 10, true, true, 110),

  ('cases.causa_abogado_zona',
   'cases', 'Causa-abogado-zona',
   'Cruce 3D causas × abogados × zonas. Útil para ver concentración de cargas.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 15, true, true, 120),

  ('cases.causas_terminadas',
   'cases', 'Causas terminadas',
   'Causas cerradas (sentencia, sobreseimiento, archivo, salida alternativa) en un rango.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 8, true, true, 130),

  ('cases.causas_terminadas_por_estado',
   'cases', 'Causas terminadas por estado',
   'Causas cerradas agrupadas por tipo de cierre (condena, absolución, archivo, etc.).',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","csv"]'::jsonb,
   NULL, 8, true, true, 140),

  ('cases.causas_terminadas_por_abogado',
   'cases', 'Causas terminadas por abogado',
   'Cierre de causas atribuidas a cada abogado (productividad).',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 10, true, true, 150),

  ('cases.abogados_ultimos_6_meses',
   'cases', 'Abogados — últimos 6 meses',
   'Actividad reciente de abogados: causas asignadas, cerradas, audiencias, plazos cumplidos.',
   '[{"name":"reference_date","type":"date","required":false}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 12, true, true, 160),

  ('cases.abogados_causa_imputados',
   'cases', 'Abogados / causa / imputados',
   'Snapshot de abogados con sus causas activas y los imputados de cada causa.',
   '[{"name":"reference_date","type":"date","required":false}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 15, true, true, 170),

  ('cases.numero_imputados',
   'cases', 'Número de imputados',
   'Total de imputados (formalizados, acusados, condenados) en periodo.',
   '[{"name":"reference_date","type":"date","required":false}]'::jsonb,
   '["html","pdf","csv"]'::jsonb,
   NULL, 5, true, true, 180),

  ('cases.gestion_legal',
   'cases', 'Gestión legal global',
   'Vista global de la gestión legal: causas activas, terminadas, cargas por abogado, plazos.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 20, true, true, 190),

  -- ========== Incidents (operativos, 2 del legacy) ==========
  ('incidents.hallazgos_por_zona',
   'incidents', 'Hallazgos por zona',
   'Incidentes detectados por zona en un rango de fechas, con tipo de incidente.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true},{"name":"incident_type_ids","type":"int[]","required":false}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 6, true, true, 200),

  ('incidents.avaluo_por_zona',
   'incidents', 'Avaluo por zona',
   'Avaluo monetario de bienes afectados (madera, infraestructura) por zona y rango.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 8, true, true, 210),

  -- ========== General (1 del legacy) ==========
  ('general.estadistica_mensual',
   'general', 'Estadística mensual',
   'Resumen mensual transversal: incidentes, denuncias, causas activas, avaluo recuperado.',
   '[{"name":"reference_date","type":"date","required":false}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 18, true, true, 300),

  -- ========== Surveillance (nuevos SURP 2.0) ==========
  ('surveillance.shift_completion',
   'surveillance', 'Cumplimiento de turnos',
   'Turnos planificados vs ejecutados por contratista y zona, con tasa de no-shows.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true},{"name":"organization_ids","type":"int[]","required":false}]'::jsonb,
   '["html","pdf","csv","xlsx"]'::jsonb,
   NULL, 10, true, true, 400),

  ('surveillance.critical_events_summary',
   'surveillance', 'Resumen eventos críticos',
   'Eventos críticos (disparo, uso de fuerza, flagrancia) por contratista, tipo y zona.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 8, true, true, 410),

  -- ========== Complaints (nuevo) ==========
  ('complaints.followup_status',
   'complaints', 'Seguimiento de denuncias',
   'Denuncias activas con status de seguimiento penal, plazos próximos a prescripción.',
   '[{"name":"date_from","type":"date","required":false},{"name":"institution","type":"string","required":false}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 10, true, true, 500),

  -- ========== Compliance (nuevo) ==========
  ('compliance.expiring_credentials',
   'compliance', 'Credenciales por vencer',
   'OS-10 corp, autorización armada, pólizas y certificaciones individuales con vencimiento próximo.',
   '[{"name":"days_ahead","type":"int","required":false,"default":90}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   NULL, 5, true, true, 600),

  -- ========== Audit (nuevo) ==========
  ('audit.sensitive_data_access',
   'audit', 'Accesos a datos sensibles',
   'Auditoría de accesos a documentos sensibles (Ley 21.719 art. 16): documentos personas, evidencia.',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   'statistics.reports.execute_audit', 12, true, true, 700),

  -- ========== Data protection / Ley 21.719 (nuevo) ==========
  ('data_protection.arcopol_requests',
   'data_protection', 'Solicitudes ARCOPOL+',
   'Resumen de solicitudes ARCOPOL+ recibidas, evaluadas y respondidas (Ley 21.719).',
   '[{"name":"date_from","type":"date","required":true},{"name":"date_to","type":"date","required":true}]'::jsonb,
   '["html","pdf","xlsx"]'::jsonb,
   'statistics.reports.execute_data_protection', 8, true, true, 800)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Notification template — reporte completado
-- -----------------------------------------------------------------------------

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('statistics.report_ready',
   'Tu reporte SURP está listo: {{report.display_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Reporte listo</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El reporte <strong>{{report.display_name}}</strong> que solicitaste está listo.</mj-text><mj-text>Categoría: {{report.category}}<br/>Formato: {{execution.output_format}}<br/>Filas: {{execution.rows_count}}<br/>Generado: {{execution.completed_at}}</mj-text><mj-button href="{{execution.download_url}}">Descargar reporte</mj-button><mj-text font-size="12px" color="#666">El enlace requiere autenticación SURP.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tu reporte {{report.display_name}} está listo. Descargar: {{execution.download_url}}. Generado {{execution.completed_at}} ({{execution.rows_count}} filas).',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'statistics', true,
   '["report.display_name", "report.category", "execution.output_format", "execution.rows_count", "execution.completed_at", "execution.download_url"]'::jsonb, 2000),

  ('statistics.report_failed',
   '[Falló] Reporte {{report.display_name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Reporte falló</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El reporte <strong>{{report.display_name}}</strong> no pudo generarse.</mj-text><mj-text>Error: {{execution.error_message}}<br/>Código: {{execution.error_code}}</mj-text><mj-text>Si el error persiste, contacta al administrador del sistema.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'El reporte {{report.display_name}} falló. Error: {{execution.error_message}} ({{execution.error_code}}).',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'statistics', true,
   '["report.display_name", "execution.error_message", "execution.error_code"]'::jsonb, 2010),

  ('statistics.scheduled_report_ready',
   '[Programado] {{schedule.name}} — {{report.display_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Reporte programado</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El reporte programado <strong>{{schedule.name}}</strong> está listo.</mj-text><mj-text>{{report.display_name}}<br/>Generado: {{execution.completed_at}}</mj-text><mj-button href="{{execution.download_url}}">Descargar</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Reporte programado {{schedule.name}} ({{report.display_name}}) listo. Descargar: {{execution.download_url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'statistics', true,
   '["schedule.name", "report.display_name", "execution.completed_at", "execution.download_url"]'::jsonb, 2020),

  ('statistics.schedule_consecutive_failures',
   '[Alerta] Programación {{schedule.name}} con {{schedule.consecutive_failures}} fallas seguidas',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Schedule con fallas</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La programación <strong>{{schedule.name}}</strong> tuvo {{schedule.consecutive_failures}} fallas consecutivas.</mj-text><mj-text>Reporte: {{report.display_name}}<br/>Última falla: {{execution.completed_at}}<br/>Error: {{execution.error_message}}</mj-text><mj-text>Revisar configuración o pausar el schedule.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Schedule {{schedule.name}} con {{schedule.consecutive_failures}} fallas seguidas. Último error: {{execution.error_message}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'statistics', true,
   '["schedule.name", "schedule.consecutive_failures", "report.display_name", "execution.completed_at", "execution.error_message"]'::jsonb, 2030)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_patrimonial_admin_perms INT;
  v_patrimonial_perms INT;
  v_lawyer_admin_perms INT;
  v_guard_perms INT;
  v_definitions INT;
  v_definitions_system INT;
  v_categories INT;
  v_templates INT;
  v_mandatory INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'statistics';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'statistics';

  SELECT count(*) INTO v_patrimonial_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial_admin' AND p.module = 'statistics';

  SELECT count(*) INTO v_patrimonial_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial' AND p.module = 'statistics';

  SELECT count(*) INTO v_lawyer_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer_admin' AND p.module = 'statistics';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'statistics';

  SELECT count(*) INTO v_definitions FROM report_definitions WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_definitions_system FROM report_definitions WHERE deleted_at IS NULL AND is_system = true;
  SELECT count(DISTINCT category) INTO v_categories FROM report_definitions WHERE deleted_at IS NULL;

  SELECT count(*) INTO v_templates FROM notification_templates WHERE category = 'statistics';
  SELECT count(*) INTO v_mandatory FROM notification_templates WHERE category = 'statistics' AND is_mandatory = true;

  IF v_total_perms < 14 THEN
    RAISE EXCEPTION 'seed/16: statistics permisos incompleto (%)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/16: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/16: patrimonial_admin no tiene todos (%/%)', v_patrimonial_admin_perms, v_total_perms;
  END IF;
  IF v_guard_perms <> 0 THEN
    RAISE EXCEPTION 'seed/16: guard NO debe tener permisos statistics (got %)', v_guard_perms;
  END IF;
  IF v_definitions < 19 THEN
    RAISE EXCEPTION 'seed/16: report_definitions incompleto (%)', v_definitions;
  END IF;
  IF v_definitions_system <> v_definitions THEN
    RAISE EXCEPTION 'seed/16: todos los reportes deben ser is_system (%/%)', v_definitions_system, v_definitions;
  END IF;
  IF v_categories < 7 THEN
    RAISE EXCEPTION 'seed/16: faltan categorías (got %, esperaba >=7)', v_categories;
  END IF;
  IF v_templates < 4 THEN
    RAISE EXCEPTION 'seed/16: faltan plantillas statistics (%)', v_templates;
  END IF;

  RAISE NOTICE 'seed/16 OK — statistics perms=% definitions=% categories=% templates=% mandatory=%; admin=% patrimonial_admin=% patrimonial=% lawyer_admin=% guard=%',
    v_total_perms, v_definitions, v_categories, v_templates, v_mandatory,
    v_admin_perms, v_patrimonial_admin_perms, v_patrimonial_perms, v_lawyer_admin_perms, v_guard_perms;
END;
$$;
