-- =============================================================================
-- SURP 2.0 — seed/15_vehicles_enrichment_seed.sql
--
-- Vehicles enrichment — permisos para documents, associated_parties y
-- sightings + asignación a roles.
--
-- Idempotente. Sin notification templates en esta ola.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Documents
  ('vehicles.documents.read',     'vehicles', 'documents', 'read',     'Leer metadata de documentos del vehículo',           false),
  ('vehicles.documents.upload',   'vehicles', 'documents', 'upload',   'Subir nuevo documento al vehículo',                  false),
  ('vehicles.documents.download', 'vehicles', 'documents', 'download', 'Descargar documento (acción auditada)',              true),
  ('vehicles.documents.update',   'vehicles', 'documents', 'update',   'Actualizar metadata del documento (no contenido)',   false),
  ('vehicles.documents.delete',   'vehicles', 'documents', 'delete',   'Marcar documento como eliminado (soft delete)',      true),

  -- Associated parties
  ('vehicles.associations.read',   'vehicles', 'associations', 'read',   'Leer asociaciones party↔vehicle',           true),
  ('vehicles.associations.create', 'vehicles', 'associations', 'create', 'Registrar nueva asociación',                false),
  ('vehicles.associations.update', 'vehicles', 'associations', 'update', 'Actualizar asociación (notas, confidence)', false),
  ('vehicles.associations.end',    'vehicles', 'associations', 'end',    'Cerrar asociación (valid_to)',              false),

  -- Sightings
  ('vehicles.sightings.read',   'vehicles', 'sightings', 'read',   'Leer avistamientos del vehículo',                false),
  ('vehicles.sightings.create', 'vehicles', 'sightings', 'create', 'Registrar nuevo avistamiento',                    false),
  ('vehicles.sightings.update', 'vehicles', 'sightings', 'update', 'Actualizar metadata del avistamiento',            false),
  ('vehicles.sightings.delete', 'vehicles', 'sightings', 'delete', 'Marcar avistamiento como eliminado (soft delete)', true)
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
  AND p.module = 'vehicles'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — todo excepto delete (documents y sightings)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.module = 'vehicles'
 AND p.code NOT IN ('vehicles.documents.delete', 'vehicles.sightings.delete')
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer / lawyer_admin / field_lawyer / external_lawyer — read all
-- (documents + associations + sightings) y subida de documentos para defensa.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'vehicles.documents.read',
    'vehicles.documents.upload',
    'vehicles.documents.download',
    'vehicles.documents.update',
    'vehicles.associations.read',
    'vehicles.associations.create',
    'vehicles.associations.update',
    'vehicles.sightings.read'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'vehicles.documents.read',
    'vehicles.associations.read',
    'vehicles.sightings.read'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — read documents/associations + crear
-- avistamientos (operación de patrullaje del contratista). NO ve metadata
-- judicial.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'vehicles.documents.read',
    'vehicles.associations.read',
    'vehicles.sightings.read',
    'vehicles.sightings.create',
    'vehicles.sightings.update'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard — crea avistamientos en terreno (operación primaria de patrullaje).
-- Lee asociaciones para identificar dueño cuando captura un vehículo sospechoso.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'vehicles.associations.read',
    'vehicles.sightings.read',
    'vehicles.sightings.create'
  )
WHERE r.name = 'guard'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_perms INT;
  v_admin_perms INT;
  v_patrimonial_admin_perms INT;
  v_patrimonial_perms INT;
  v_lawyer_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
  v_viewer_perms INT;
  v_new_perms INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'vehicles';
  SELECT count(*) INTO v_new_perms
  FROM permissions
  WHERE code LIKE 'vehicles.documents.%'
     OR code LIKE 'vehicles.associations.%'
     OR code LIKE 'vehicles.sightings.%';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'vehicles';

  SELECT count(*) INTO v_patrimonial_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial_admin' AND p.module = 'vehicles';

  SELECT count(*) INTO v_patrimonial_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial' AND p.module = 'vehicles';

  SELECT count(*) INTO v_lawyer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer' AND p.module = 'vehicles';

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module = 'vehicles';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'vehicles';

  SELECT count(*) INTO v_viewer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'viewer' AND p.module = 'vehicles';

  IF v_new_perms <> 13 THEN
    RAISE EXCEPTION 'seed/15: faltan permisos enrichment (got %, esperaba 13)', v_new_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/15: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/15: patrimonial_admin no tiene todos (%/%)', v_patrimonial_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_perms <> v_total_perms - 2 THEN
    RAISE EXCEPTION 'seed/15: patrimonial debe tener todos menos 2 (%/%)', v_patrimonial_perms, v_total_perms - 2;
  END IF;

  RAISE NOTICE 'seed/15 OK — vehicles total=% nuevos=% admin=% patrimonial_admin=% patrimonial=% lawyer=% company_admin=% guard=% viewer=%',
    v_total_perms, v_new_perms, v_admin_perms, v_patrimonial_admin_perms, v_patrimonial_perms,
    v_lawyer_perms, v_company_admin_perms, v_guard_perms, v_viewer_perms;
END;
$$;
