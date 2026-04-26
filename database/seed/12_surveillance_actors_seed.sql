-- =============================================================================
-- SURP 2.0 — seed/12_surveillance_actors_seed.sql
--
-- Surveillance Ola 1: permisos y plantillas de notificación.
--
--   - Permisos surveillance.contractors.* / .guards.* / .certifications.* /
--     .audits.* / .findings.*
--   - Asignación a roles: administrator / patrimonial_admin / patrimonial /
--     viewer / company_admin (security_provider) / guard (sin acceso).
--   - Plantillas:
--       * surveillance.os10_corp_expiring        (mandatorio)
--       * surveillance.armed_authorization_expiring (mandatorio)
--       * surveillance.insurance_expiring        (mandatorio)
--       * surveillance.guard_cert_expiring       (mandatorio)
--       * surveillance.audit_finding_assigned    (opt-in)
--       * surveillance.audit_finding_overdue     (mandatorio)
--       * surveillance.audit_closed              (opt-in)
--
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Compliance corporativo del contratista
  ('surveillance.contractors.read',   'surveillance', 'contractors',   'read',   'Leer compliance corporativo (OS-10, seguros, autorización personal armado)',     false),
  ('surveillance.contractors.update', 'surveillance', 'contractors',   'update', 'Actualizar compliance corporativo del contratista',                              true),

  -- Personal de seguridad
  ('surveillance.guards.read',        'surveillance', 'guards',        'read',      'Leer personal de seguridad',                                                  false),
  ('surveillance.guards.create',      'surveillance', 'guards',        'create',    'Registrar nuevo guardia/vigilante',                                           false),
  ('surveillance.guards.update',      'surveillance', 'guards',        'update',    'Actualizar datos del guardia (categoría, credencial interna, notas)',        false),
  ('surveillance.guards.terminate',   'surveillance', 'guards',        'terminate', 'Dar de baja a un guardia (termination_date + reason)',                       true),

  -- Certificaciones individuales
  ('surveillance.certifications.read',   'surveillance', 'certifications', 'read',   'Leer credenciales y certificaciones de guardias',                          false),
  ('surveillance.certifications.manage', 'surveillance', 'certifications', 'manage', 'Crear / actualizar credenciales (OS-10 individual, capacitaciones, etc.)', false),

  -- Auditorías URP
  ('surveillance.audits.read',   'surveillance', 'audits',  'read',   'Leer auditorías de compliance URP',                            false),
  ('surveillance.audits.create', 'surveillance', 'audits',  'create', 'Iniciar nueva auditoría URP a contratista',                    false),
  ('surveillance.audits.update', 'surveillance', 'audits',  'update', 'Actualizar auditoría en curso (alcance, hallazgos, notas)',    false),
  ('surveillance.audits.close',  'surveillance', 'audits',  'close',  'Cerrar auditoría con overall_result (acción irreversible)',    true),

  -- Hallazgos
  ('surveillance.findings.read',    'surveillance', 'findings', 'read',    'Leer hallazgos de auditoría',                                false),
  ('surveillance.findings.create',  'surveillance', 'findings', 'create',  'Registrar nuevo hallazgo en auditoría en curso',             false),
  ('surveillance.findings.update',  'surveillance', 'findings', 'update',  'Actualizar hallazgo (severidad, recomendación, plazo)',      false),
  ('surveillance.findings.resolve', 'surveillance', 'findings', 'resolve', 'Marcar hallazgo como resuelto / aceptado',                   false)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Asignación a roles
-- -----------------------------------------------------------------------------

-- 2.1 administrator — todo
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrator' AND p.module = 'surveillance'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial_admin (Jefe URP) — todo (incluye close auditoría)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module = 'surveillance'
WHERE r.name = 'patrimonial_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 patrimonial (URP regular) — todo excepto close auditoría y update contractor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.contractors.read',
    'surveillance.guards.read',
    'surveillance.certifications.read',
    'surveillance.audits.read',
    'surveillance.audits.create',
    'surveillance.audits.update',
    'surveillance.findings.read',
    'surveillance.findings.create',
    'surveillance.findings.update',
    'surveillance.findings.resolve'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.contractors.read',
    'surveillance.guards.read',
    'surveillance.certifications.read',
    'surveillance.audits.read',
    'surveillance.findings.read'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — gestiona SU contrato + SU personal +
-- SUS credenciales. Puede ver auditorías que la URP le hizo y sus findings,
-- pero no crear ni cerrar auditorías. Filtro por organización en capa app.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'surveillance.contractors.read',
    'surveillance.contractors.update',
    'surveillance.guards.read',
    'surveillance.guards.create',
    'surveillance.guards.update',
    'surveillance.guards.terminate',
    'surveillance.certifications.read',
    'surveillance.certifications.manage',
    'surveillance.audits.read',
    'surveillance.findings.read'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard (security_provider) — sin acceso a surveillance.
-- (Intencionalmente no se asigna ningún permiso. El guardia no debe ver el
-- registro corporativo ni los hallazgos sobre su empresa.)


-- -----------------------------------------------------------------------------
-- 3. Plantillas de notificación (categoría 'surveillance')
-- -----------------------------------------------------------------------------

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('surveillance.os10_corp_expiring',
   '[OS-10] Autorización corporativa de {{contractor.name}} vence el {{os10.expires_at}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Compliance OS-10</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La autorización OS-10 corporativa de <strong>{{contractor.name}}</strong> (RUT {{contractor.rut}}) vence en <strong>{{days_to_expire}}</strong> días.</mj-text><mj-text>Número OS-10: {{os10.number}}<br/>Fecha vencimiento: {{os10.expires_at}}<br/>Autoridad: {{os10.authority}}</mj-text><mj-text>Sin OS-10 vigente, la empresa pierde habilitación para operar como vigilancia privada. Coordinar renovación con el contratista.</mj-text><mj-button href="{{contractor.url}}" background-color="#c62828">Ver compliance</mj-button></mj-column></mj-section></mj-body></mjml>',
   'OS-10 corporativo de {{contractor.name}} (RUT {{contractor.rut}}) vence el {{os10.expires_at}} ({{days_to_expire}} días). Coordinar renovación. Ver: {{contractor.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["contractor.name", "contractor.rut", "contractor.url", "os10.number", "os10.expires_at", "os10.authority", "days_to_expire"]'::jsonb, 1700),

  ('surveillance.armed_authorization_expiring',
   '[Personal armado] Autorización de {{contractor.name}} vence el {{armed.expires_at}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Personal armado</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La autorización de personal armado de <strong>{{contractor.name}}</strong> vence en <strong>{{days_to_expire}}</strong> días.</mj-text><mj-text>Número autorización: {{armed.number}}<br/>Fecha vencimiento: {{armed.expires_at}}</mj-text><mj-text>Vencida la autorización, ningún vigilante puede portar arma de fuego. El porte sin autorización configura delito Ley 17.798.</mj-text><mj-button href="{{contractor.url}}" background-color="#c62828">Ver compliance</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Autorización personal armado de {{contractor.name}} vence el {{armed.expires_at}} ({{days_to_expire}} días). Ver: {{contractor.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["contractor.name", "contractor.url", "armed.number", "armed.expires_at", "days_to_expire"]'::jsonb, 1710),

  ('surveillance.insurance_expiring',
   '[Pólizas] Seguro {{insurance.kind}} de {{contractor.name}} vence el {{insurance.expires_at}}',
   '<mjml><mj-body><mj-section background-color="#ef6c00" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Pólizas de seguro</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La póliza de <strong>{{insurance.kind}}</strong> de {{contractor.name}} vence en {{days_to_expire}} días.</mj-text><mj-text>Aseguradora: {{insurance.insurer}}<br/>Póliza: {{insurance.policy_number}}<br/>Vencimiento: {{insurance.expires_at}}</mj-text><mj-button href="{{contractor.url}}" background-color="#ef6c00">Ver compliance</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Póliza {{insurance.kind}} de {{contractor.name}} ({{insurance.insurer}} - {{insurance.policy_number}}) vence el {{insurance.expires_at}} ({{days_to_expire}} días). Ver: {{contractor.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["contractor.name", "contractor.url", "insurance.kind", "insurance.insurer", "insurance.policy_number", "insurance.expires_at", "days_to_expire"]'::jsonb, 1720),

  ('surveillance.guard_cert_expiring',
   '[Credencial] {{cert.type}} de {{guard.display_name}} vence el {{cert.expires_at}}',
   '<mjml><mj-body><mj-section background-color="#ef6c00" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Credencial por vencer</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La credencial <strong>{{cert.type}}</strong> de <strong>{{guard.display_name}}</strong> ({{guard.rut}}) vence en {{days_to_expire}} días.</mj-text><mj-text>Empresa: {{contractor.name}}<br/>Número: {{cert.number}}<br/>Entidad emisora: {{cert.issuing_entity}}</mj-text><mj-button href="{{guard.url}}" background-color="#ef6c00">Ver guardia</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Credencial {{cert.type}} de {{guard.display_name}} ({{guard.rut}}) vence el {{cert.expires_at}} ({{days_to_expire}} días). Empresa: {{contractor.name}}.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["guard.display_name", "guard.rut", "guard.url", "contractor.name", "cert.type", "cert.number", "cert.issuing_entity", "cert.expires_at", "days_to_expire"]'::jsonb, 1730),

  ('surveillance.audit_finding_assigned',
   '[Auditoría] Nuevo hallazgo {{finding.severity}} en auditoría {{audit.id}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Hallazgo de auditoría</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Se registró un hallazgo en la auditoría a <strong>{{contractor.name}}</strong>.</mj-text><mj-text>Severidad: <strong>{{finding.severity}}</strong><br/>Categoría: {{finding.category}}<br/>Plazo: {{finding.due_at}}</mj-text><mj-text>{{finding.description}}</mj-text><mj-button href="{{audit.url}}">Ver auditoría</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Nuevo hallazgo {{finding.severity}} ({{finding.category}}) en auditoría {{audit.id}} a {{contractor.name}}. Plazo {{finding.due_at}}. Ver: {{audit.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'surveillance', true,
   '["audit.id", "audit.url", "contractor.name", "finding.severity", "finding.category", "finding.description", "finding.due_at"]'::jsonb, 1740),

  ('surveillance.audit_finding_overdue',
   '[VENCIDO] Hallazgo {{finding.severity}} sin resolver en {{contractor.name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Hallazgo vencido</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El hallazgo <strong>{{finding.severity}}</strong> en {{contractor.name}} venció el {{finding.due_at}} sin ser resuelto.</mj-text><mj-text>Categoría: {{finding.category}}<br/>Días vencido: {{days_overdue}}</mj-text><mj-text>{{finding.description}}</mj-text><mj-button href="{{audit.url}}" background-color="#c62828">Revisar auditoría</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Hallazgo {{finding.severity}} ({{finding.category}}) en {{contractor.name}} vencido hace {{days_overdue}} días. Ver: {{audit.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'surveillance', true,
   '["audit.id", "audit.url", "contractor.name", "finding.severity", "finding.category", "finding.description", "finding.due_at", "days_overdue"]'::jsonb, 1750),

  ('surveillance.audit_closed',
   'Auditoría cerrada: {{contractor.name}} — resultado {{audit.overall_result}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Auditoría cerrada</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Se cerró la auditoría a <strong>{{contractor.name}}</strong>.</mj-text><mj-text>Tipo: {{audit.audit_type}}<br/>Fecha: {{audit.audit_date}}<br/>Resultado: <strong>{{audit.overall_result}}</strong><br/>Hallazgos: {{audit.findings_count}}</mj-text><mj-button href="{{audit.url}}">Ver auditoría</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Auditoría a {{contractor.name}} cerrada con resultado {{audit.overall_result}} ({{audit.findings_count}} hallazgos). Ver: {{audit.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'surveillance', true,
   '["audit.id", "audit.url", "audit.audit_type", "audit.audit_date", "audit.overall_result", "audit.findings_count", "contractor.name"]'::jsonb, 1760)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_patrimonial_admin_perms INT;
  v_patrimonial_perms INT;
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

  SELECT count(*) INTO v_patrimonial_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial' AND p.module = 'surveillance';

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

  SELECT count(*) INTO v_templates
  FROM notification_templates WHERE category = 'surveillance';

  SELECT count(*) INTO v_mandatory
  FROM notification_templates WHERE category = 'surveillance' AND is_mandatory = true;

  IF v_total_perms < 16 THEN
    RAISE EXCEPTION 'seed/12: surveillance permisos incompleto (%)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/12: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/12: patrimonial_admin no tiene todos (%/%)', v_patrimonial_admin_perms, v_total_perms;
  END IF;
  IF v_guard_perms <> 0 THEN
    RAISE EXCEPTION 'seed/12: guard NO debe tener permisos surveillance (got %)', v_guard_perms;
  END IF;
  IF v_templates < 7 THEN
    RAISE EXCEPTION 'seed/12: faltan plantillas surveillance (%)', v_templates;
  END IF;
  IF v_mandatory < 5 THEN
    RAISE EXCEPTION 'seed/12: faltan plantillas mandatorias surveillance (%)', v_mandatory;
  END IF;

  RAISE NOTICE 'seed/12 OK — surveillance permisos=% admin=% patrimonial_admin=% patrimonial=% company_admin=% guard=% templates=% mandatory=%',
    v_total_perms, v_admin_perms, v_patrimonial_admin_perms, v_patrimonial_perms,
    v_company_admin_perms, v_guard_perms, v_templates, v_mandatory;
END;
$$;
