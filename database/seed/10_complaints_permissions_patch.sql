-- =============================================================================
-- SURP 2.0 — seed/10_complaints_permissions_patch.sql
--
-- Permisos del módulo complaints que faltan en seed/02 (escrito antes de
-- cerrar el modelo) + asignación a roles.
--
-- Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos nuevos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- complaint persons / vehicles
  ('complaints.persons.manage',         'complaints', 'persons',       'manage',    'Vincular personas (imputados/testigos/denunciante) a denuncia',  false),
  ('complaints.vehicles.manage',        'complaints', 'vehicles',      'manage',    'Vincular vehículos a denuncia (incautación / devolución)',       false),
  -- police_units catalog
  ('police_units.units.read',           'police_units', 'units',       'read',      'Leer unidades policiales',                                       false),
  ('police_units.units.normalize',      'police_units', 'units',       'normalize', 'Normalizar unidades policiales (Abogado Administrador)',         true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Asignación a roles
-- -----------------------------------------------------------------------------

-- 2.1 administrator recibe TODOS los permisos de complaints + police_units
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrator'
  AND p.module IN ('complaints', 'police_units')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial_admin (Jefe URP) — todo de complaints + normalizar police_units
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'complaints.complaints.create',
    'complaints.complaints.update',
    'complaints.persons.manage',
    'complaints.vehicles.manage',
    'police_units.units.read',
    'police_units.units.normalize'
  )
WHERE r.name = 'patrimonial_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 patrimonial (URP regular) — todo de complaints sin normalizar
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'complaints.complaints.create',
    'complaints.complaints.update',
    'complaints.persons.manage',
    'complaints.vehicles.manage',
    'police_units.units.read'
  )
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 lawyer / lawyer_admin / field_lawyer / external_lawyer — read/update con persons/vehicles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'complaints.complaints.create',
    'complaints.complaints.update',
    'complaints.persons.manage',
    'complaints.vehicles.manage',
    'police_units.units.read'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — crear y mantener sus denuncias
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'complaints.complaints.create',
    'complaints.complaints.update',
    'complaints.persons.manage',
    'complaints.vehicles.manage',
    'police_units.units.read'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard (security_provider) — solo lectura (la creación la hace el company_admin tras revisión)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'police_units.units.read'
  )
WHERE r.name = 'guard'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.7 viewer (URP visor) — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'complaints.complaints.read',
    'police_units.units.read'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_complaints_perms INT;
  v_admin_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
BEGIN
  SELECT count(*) INTO v_total_complaints_perms
  FROM permissions WHERE module IN ('complaints', 'police_units');

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module IN ('complaints', 'police_units');

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module IN ('complaints', 'police_units');

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module IN ('complaints', 'police_units');

  IF v_total_complaints_perms < 7 THEN
    RAISE EXCEPTION 'seed/10: complaints+police_units permisos incompleto (%)', v_total_complaints_perms;
  END IF;
  IF v_admin_perms <> v_total_complaints_perms THEN
    RAISE EXCEPTION 'seed/10: administrator no tiene todos (%/%)', v_admin_perms, v_total_complaints_perms;
  END IF;

  RAISE NOTICE 'seed/10 OK — complaints+police_units permisos=% admin=% company_admin=% guard=%',
    v_total_complaints_perms, v_admin_perms, v_company_admin_perms, v_guard_perms;
END;
$$;
