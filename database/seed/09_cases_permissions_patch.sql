-- =============================================================================
-- SURP 2.0 — seed/09_cases_permissions_patch.sql
--
-- Permisos del módulo cases que faltan en seed/02 (escrito antes de cerrar
-- el modelo del módulo) + asignación a roles.
--
-- Idempotente: ON CONFLICT (code) DO NOTHING en permissions, y para
-- role_permissions usamos ON CONFLICT (user_id, role_id) DO NOTHING vía
-- la PK compuesta de la tabla.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos nuevos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- hearings
  ('cases.hearings.read',             'cases', 'hearings',     'read',          'Leer audiencias',                                   false),
  ('cases.hearings.manage',           'cases', 'hearings',     'manage',        'Crear/editar audiencias y registrar resultados',    false),

  -- deadlines
  ('cases.deadlines.read',            'cases', 'deadlines',    'read',          'Leer plazos de causa',                              false),
  ('cases.deadlines.waive',           'cases', 'deadlines',    'waive',         'Descartar plazos con razón (solo Abogado Admin)',   true),

  -- documents
  ('cases.documents.upload',          'cases', 'documents',    'upload',        'Subir documentos / nuevas versiones',               false),
  ('cases.documents.download',        'cases', 'documents',    'download',      'Descargar documentos (auditado)',                   true),

  -- notes
  ('cases.notes.read_private',        'cases', 'notes',        'read_private',  'Leer notas privadas (solo equipo asignado)',        true),
  ('cases.notes.manage',              'cases', 'notes',        'manage',        'Crear/editar notas propias',                        false),

  -- templates
  ('cases.templates.manage',          'cases', 'templates',    'manage',        'Editar plantillas de escritos (solo Abogado Admin)', false),

  -- tasks
  ('cases.tasks.create',              'cases', 'tasks',        'create',        'Crear tareas',                                      false),
  ('cases.tasks.assign',              'cases', 'tasks',        'assign',        'Asignar tareas a otros',                            false),
  ('cases.tasks.complete',            'cases', 'tasks',        'complete',      'Completar tareas asignadas',                        false),

  -- resolutions / appeals / querellas
  ('cases.resolutions.read',          'cases', 'resolutions',  'read',          'Leer resoluciones del tribunal',                    true),
  ('cases.resolutions.create',        'cases', 'resolutions',  'create',        'Registrar resoluciones',                            false),
  ('cases.appeals.read',              'cases', 'appeals',      'read',          'Leer recursos',                                     true),
  ('cases.appeals.create',            'cases', 'appeals',      'create',        'Presentar recursos',                                false),
  ('cases.querellas.read',            'cases', 'querellas',    'read',          'Leer querellas presentadas',                        false),
  ('cases.querellas.create',          'cases', 'querellas',    'create',        'Presentar querellas',                               false)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Asignación a roles
-- -----------------------------------------------------------------------------

-- 2.1 administrator recibe TODOS los permisos del módulo cases (CROSS JOIN).
-- Si seed/03 ya hizo este CROSS JOIN antes que existieran estos permisos,
-- agregamos los nuevos ahora.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrator'
  AND p.module = 'cases'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 lawyer (Abogado): todo excepto waive y templates.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'cases.cases.read', 'cases.cases.create', 'cases.cases.update',
    'cases.milestones.read', 'cases.milestones.create',
    'cases.hearings.read', 'cases.hearings.manage',
    'cases.deadlines.read',
    'cases.documents.upload', 'cases.documents.download',
    'cases.notes.read_private', 'cases.notes.manage',
    'cases.tasks.create', 'cases.tasks.assign', 'cases.tasks.complete',
    'cases.resolutions.read', 'cases.resolutions.create',
    'cases.appeals.read', 'cases.appeals.create',
    'cases.querellas.read', 'cases.querellas.create'
  )
WHERE r.name = 'lawyer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer_admin: lawyer + waive + templates.manage + cases.cases.assign_lawyer/reopen
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'cases.cases.read', 'cases.cases.create', 'cases.cases.update',
    'cases.cases.assign_lawyer', 'cases.cases.reopen',
    'cases.milestones.read', 'cases.milestones.create',
    'cases.hearings.read', 'cases.hearings.manage',
    'cases.deadlines.read', 'cases.deadlines.waive',
    'cases.documents.upload', 'cases.documents.download',
    'cases.notes.read_private', 'cases.notes.manage',
    'cases.templates.manage',
    'cases.tasks.create', 'cases.tasks.assign', 'cases.tasks.complete',
    'cases.resolutions.read', 'cases.resolutions.create',
    'cases.appeals.read', 'cases.appeals.create',
    'cases.querellas.read', 'cases.querellas.create'
  )
WHERE r.name = 'lawyer_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 field_lawyer (Abogado de Terreno): igual a lawyer (legacy "mantener legacy")
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'cases.cases.read', 'cases.cases.create', 'cases.cases.update',
    'cases.milestones.read', 'cases.milestones.create',
    'cases.hearings.read', 'cases.hearings.manage',
    'cases.deadlines.read',
    'cases.documents.upload', 'cases.documents.download',
    'cases.notes.read_private', 'cases.notes.manage',
    'cases.tasks.create', 'cases.tasks.assign', 'cases.tasks.complete',
    'cases.resolutions.read', 'cases.resolutions.create',
    'cases.appeals.read', 'cases.appeals.create',
    'cases.querellas.read', 'cases.querellas.create'
  )
WHERE r.name = 'field_lawyer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 external_lawyer (estudio jurídico externo): igual a lawyer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'cases.cases.read', 'cases.cases.create', 'cases.cases.update',
    'cases.milestones.read', 'cases.milestones.create',
    'cases.hearings.read', 'cases.hearings.manage',
    'cases.deadlines.read',
    'cases.documents.upload', 'cases.documents.download',
    'cases.notes.read_private', 'cases.notes.manage',
    'cases.tasks.create', 'cases.tasks.assign', 'cases.tasks.complete',
    'cases.resolutions.read', 'cases.resolutions.create',
    'cases.appeals.read', 'cases.appeals.create',
    'cases.querellas.read', 'cases.querellas.create'
  )
WHERE r.name = 'external_lawyer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- viewer NO recibe permisos del módulo cases (solo es viewer de incidents/etc).


-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_perms_cases INT;
  v_admin_perms_cases INT;
  v_lawyer_perms_cases INT;
  v_lawyer_admin_perms_cases INT;
BEGIN
  SELECT count(*) INTO v_perms_cases
  FROM permissions WHERE module = 'cases';

  SELECT count(*) INTO v_admin_perms_cases
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'cases';

  SELECT count(*) INTO v_lawyer_perms_cases
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer' AND p.module = 'cases';

  SELECT count(*) INTO v_lawyer_admin_perms_cases
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer_admin' AND p.module = 'cases';

  IF v_perms_cases < 25 THEN
    RAISE EXCEPTION 'seed/09: permissions cases incompleto (%)', v_perms_cases;
  END IF;
  IF v_admin_perms_cases <> v_perms_cases THEN
    RAISE EXCEPTION 'seed/09: administrator no tiene todos los permisos cases (admin=%, total=%)',
      v_admin_perms_cases, v_perms_cases;
  END IF;

  RAISE NOTICE 'seed/09 OK — cases permissions=% admin=% lawyer=% lawyer_admin=%',
    v_perms_cases, v_admin_perms_cases, v_lawyer_perms_cases, v_lawyer_admin_perms_cases;
END;
$$;
