-- =============================================================================
-- SURP 2.0 — seed/18_fires_seed.sql
--
-- Fires — permisos + 3 notification templates.
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Fires CRUD operativo
  ('fires.fires.read',    'fires', 'fires', 'read',    'Leer registros de incendios',                              false),
  ('fires.fires.create',  'fires', 'fires', 'create',  'Reportar nuevo incendio detectado',                         false),
  ('fires.fires.update',  'fires', 'fires', 'update',  'Actualizar metadata operativa (tiempos combate, recursos)', false),
  ('fires.fires.transition_state', 'fires', 'fires', 'transition_state', 'Avanzar estado del combate (despachado→arribado→controlado→extinguido)', false),
  ('fires.fires.close',   'fires', 'fires', 'close',   'Cerrar incendio administrativamente',                       false),
  ('fires.fires.void',    'fires', 'fires', 'void',    'Anular registro de incendio (falsa alarma)',                true),

  -- Determinación de causa de origen — sensible (afecta tipificación legal)
  ('fires.fires.determine_origin', 'fires', 'fires', 'determine_origin', 'Determinar causa de origen tras pericia (intencional/negligente/eléctrica/natural)', true),

  -- Calificación legal — sensible (decisión jurídica)
  ('fires.fires.qualify_legally', 'fires', 'fires', 'qualify_legally', 'Asignar calificación legal (CP 476 N°3, art. 490, etc.)', true),

  -- Atentado incendiario flag — sensible (workflow especial)
  ('fires.fires.flag_terrorism', 'fires', 'fires', 'flag_terrorism', 'Marcar/desmarcar flag de atentado incendiario', true),

  -- Sanción CONAF
  ('fires.fires.file_conaf_complaint', 'fires', 'fires', 'file_conaf_complaint', 'Registrar denuncia/sanción CONAF', false),

  -- Vinculación con incidents/cases
  ('fires.fires.link_incident', 'fires', 'fires', 'link_incident', 'Vincular incendio con un incident formal',  false),
  ('fires.fires.link_case',     'fires', 'fires', 'link_case',     'Vincular incendio con una causa penal',     false),

  -- Documentos
  ('fires.documents.read',     'fires', 'documents', 'read',     'Leer metadata de documentos',                   false),
  ('fires.documents.upload',   'fires', 'documents', 'upload',   'Subir reporte CONAF / Bomberos / pericia',      false),
  ('fires.documents.download', 'fires', 'documents', 'download', 'Descargar documento (acción auditada)',         true),
  ('fires.documents.update',   'fires', 'documents', 'update',   'Actualizar metadata del documento',              false),
  ('fires.documents.delete',   'fires', 'documents', 'delete',   'Marcar documento como eliminado (soft delete)', true)
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
  AND p.module = 'fires'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — todo el flujo operativo, NO determinar origin ni
-- qualify_legally (eso es decisión legal/pericial), NO flag terrorism.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.module = 'fires'
 AND p.code NOT IN (
    'fires.fires.determine_origin',
    'fires.fires.qualify_legally',
    'fires.fires.flag_terrorism',
    'fires.documents.delete'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer / lawyer_admin / field_lawyer / external_lawyer — leer todo +
-- determine_origin (basado en pericia técnica) + qualify_legally + link_case.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'fires.fires.read',
    'fires.fires.update',
    'fires.fires.determine_origin',
    'fires.fires.qualify_legally',
    'fires.fires.link_incident',
    'fires.fires.link_case',
    'fires.fires.file_conaf_complaint',
    'fires.documents.read',
    'fires.documents.upload',
    'fires.documents.download',
    'fires.documents.update'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- lawyer_admin además puede flag_terrorism (workflow especial Ley 12.927/18.314).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'fires.fires.flag_terrorism'
WHERE r.name = 'lawyer_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN ('fires.fires.read', 'fires.documents.read')
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — leer + crear (puede registrar
-- detección desde sus rondines), upload de documentos (foto en terreno).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'fires.fires.read',
    'fires.fires.create',
    'fires.fires.update',
    'fires.fires.transition_state',
    'fires.documents.read',
    'fires.documents.upload',
    'fires.documents.download'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard — read + create (reporte inicial desde terreno) + update operativo.
-- NO sube documentos (lo hace company_admin tras revisión).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'fires.fires.read',
    'fires.fires.create',
    'fires.fires.update',
    'fires.documents.read'
  )
WHERE r.name = 'guard'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Notification templates
-- -----------------------------------------------------------------------------

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('fires.fire_detected',
   '[INCENDIO] {{fire.zone_name}} — {{fire.detected_at}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ INCENDIO DETECTADO</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Zona: <strong>{{fire.zone_name}}</strong>{{#if fire.property_name}} · Predio: {{fire.property_name}}{{/if}}{{#if fire.sector}} · Sector: {{fire.sector}}{{/if}}</mj-text><mj-text>Detectado: {{fire.detected_at}}<br/>Detector: {{fire.detector_name}}<br/>Focos: {{fire.focal_points_count}}</mj-text>{{#if fire.weather_summary}}<mj-text>Meteorología: {{fire.weather_summary}}</mj-text>{{/if}}<mj-button href="{{fire.url}}" background-color="#c62828">Coordinar respuesta</mj-button></mj-column></mj-section></mj-body></mjml>',
   'INCENDIO en {{fire.zone_name}} detectado a las {{fire.detected_at}}. Detector: {{fire.detector_name}}. Focos: {{fire.focal_points_count}}. Ver: {{fire.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'fires', true,
   '["fire.zone_name","fire.property_name","fire.sector","fire.detected_at","fire.detector_name","fire.focal_points_count","fire.weather_summary","fire.url"]'::jsonb, 2200),

  ('fires.fire_controlled',
   'Incendio controlado: {{fire.zone_name}} ({{fire.total_affected_ha}} ha)',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Incendio controlado</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El incendio en <strong>{{fire.zone_name}}</strong> fue controlado.</mj-text><mj-text>Detectado: {{fire.detected_at}}<br/>Controlado: {{fire.controlled_at}}<br/>Tiempo total: {{fire.control_minutes}} min<br/>Superficie afectada: {{fire.total_affected_ha}} ha</mj-text><mj-text>Próximos pasos: pericia de origen + evaluación de calificación legal.</mj-text><mj-button href="{{fire.url}}">Ver detalle</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Incendio en {{fire.zone_name}} controlado a las {{fire.controlled_at}} ({{fire.control_minutes}} min, {{fire.total_affected_ha}} ha). Ver: {{fire.url}}',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'fires', true,
   '["fire.zone_name","fire.detected_at","fire.controlled_at","fire.control_minutes","fire.total_affected_ha","fire.url"]'::jsonb, 2210),

  ('fires.fire_during_occupation',
   '[CRÍTICO] Incendio durante toma activa — {{fire.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ INCENDIO + TOMA</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text font-weight="bold">El incendio en {{fire.zone_name}} ocurrió durante una toma activa del predio.</mj-text><mj-text>Predio: {{fire.property_name}}<br/>Detectado: {{fire.detected_at}}<br/>Notas: {{fire.occupation_notes}}</mj-text><mj-text>Esta coincidencia multiplica la gravedad legal (CP arts. 457-462 + CP 476 N°3 + Ley 20.653). Evaluar querella conjunta y preservar evidencia.</mj-text><mj-button href="{{fire.url}}" background-color="#c62828">Coordinar URP + abogados</mj-button></mj-column></mj-section></mj-body></mjml>',
   'CRÍTICO: incendio en {{fire.zone_name}} (predio {{fire.property_name}}) durante toma activa. Evaluar querella conjunta. Ver: {{fire.url}}',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'fires', true,
   '["fire.zone_name","fire.property_name","fire.detected_at","fire.occupation_notes","fire.url"]'::jsonb, 2220)

ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_patrimonial_perms INT;
  v_lawyer_perms INT;
  v_lawyer_admin_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
  v_viewer_perms INT;
  v_templates INT;
  v_mandatory INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'fires';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'fires';

  SELECT count(*) INTO v_patrimonial_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial' AND p.module = 'fires';

  SELECT count(*) INTO v_lawyer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer' AND p.module = 'fires';

  SELECT count(*) INTO v_lawyer_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer_admin' AND p.module = 'fires';

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module = 'fires';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'fires';

  SELECT count(*) INTO v_viewer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'viewer' AND p.module = 'fires';

  SELECT count(*) INTO v_templates FROM notification_templates WHERE category = 'fires';
  SELECT count(*) INTO v_mandatory FROM notification_templates WHERE category = 'fires' AND is_mandatory = true;

  IF v_total_perms < 17 THEN
    RAISE EXCEPTION 'seed/18: fires permisos = % (esperaba 17)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/18: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_lawyer_admin_perms <> v_lawyer_perms + 1 THEN
    RAISE EXCEPTION 'seed/18: lawyer_admin debe tener 1 permiso más que lawyer (lawyer=%, lawyer_admin=%)', v_lawyer_perms, v_lawyer_admin_perms;
  END IF;
  IF v_templates <> 3 THEN
    RAISE EXCEPTION 'seed/18: templates fires = % (esperaba 3)', v_templates;
  END IF;
  IF v_mandatory <> 2 THEN
    RAISE EXCEPTION 'seed/18: templates mandatorios = % (esperaba 2)', v_mandatory;
  END IF;

  RAISE NOTICE 'seed/18 OK — fires perms=% admin=% patrimonial=% lawyer=% lawyer_admin=% company_admin=% guard=% viewer=% templates=% mandatory=%',
    v_total_perms, v_admin_perms, v_patrimonial_perms, v_lawyer_perms, v_lawyer_admin_perms,
    v_company_admin_perms, v_guard_perms, v_viewer_perms, v_templates, v_mandatory;
END;
$$;
