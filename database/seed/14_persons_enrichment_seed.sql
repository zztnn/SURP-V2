-- =============================================================================
-- SURP 2.0 — seed/14_persons_enrichment_seed.sql
--
-- Persons enrichment — permisos para addresses, documents, aliases, bands,
-- band_memberships + asignación a roles.
--
-- Idempotente. Sin notification templates en esta ola (los enrichment events
-- no disparan notificaciones por defecto; se evalúa caso a caso al integrar).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permisos
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- Addresses
  ('persons.addresses.read',   'persons', 'addresses', 'read',   'Leer direcciones del party',                                  true),
  ('persons.addresses.create', 'persons', 'addresses', 'create', 'Registrar nueva dirección del party',                          false),
  ('persons.addresses.update', 'persons', 'addresses', 'update', 'Actualizar dirección (vigencia, notas, confidence)',          false),
  ('persons.addresses.expire', 'persons', 'addresses', 'expire', 'Marcar dirección como vencida (valid_to)',                    false),

  -- Documents
  ('persons.documents.read',     'persons', 'documents', 'read',     'Leer metadata de documentos del party',                  true),
  ('persons.documents.upload',   'persons', 'documents', 'upload',   'Subir nuevo documento al party',                          false),
  ('persons.documents.download', 'persons', 'documents', 'download', 'Descargar documento (acción auditada)',                   true),
  ('persons.documents.update',   'persons', 'documents', 'update',   'Actualizar metadata del documento (no contenido)',        false),
  ('persons.documents.delete',   'persons', 'documents', 'delete',   'Marcar documento como eliminado (soft delete)',           true),

  -- Aliases
  ('persons.aliases.read',       'persons', 'aliases',   'read',       'Leer aliases del party',                                true),
  ('persons.aliases.create',     'persons', 'aliases',   'create',     'Registrar nuevo alias',                                  false),
  ('persons.aliases.update',     'persons', 'aliases',   'update',     'Actualizar alias (last_seen, confidence, notas)',        false),
  ('persons.aliases.deactivate', 'persons', 'aliases',   'deactivate', 'Desactivar alias (active=false)',                        false),

  -- Bands (catálogo)
  ('persons.bands.read',           'persons', 'bands', 'read',           'Leer catálogo de bandas',                              false),
  ('persons.bands.read_internal',  'persons', 'bands', 'read_internal',  'Leer notas internas operativas URP de la banda',       true),
  ('persons.bands.create',         'persons', 'bands', 'create',         'Crear nueva banda en el catálogo',                     false),
  ('persons.bands.update',         'persons', 'bands', 'update',         'Actualizar banda (descripción, área operativa, notas)', false),
  ('persons.bands.deactivate',     'persons', 'bands', 'deactivate',     'Desactivar banda',                                     false),

  -- Band memberships
  ('persons.band_memberships.read',   'persons', 'band_memberships', 'read',   'Leer membresías party↔band',         true),
  ('persons.band_memberships.assign', 'persons', 'band_memberships', 'assign', 'Asignar party a banda',              false),
  ('persons.band_memberships.update', 'persons', 'band_memberships', 'update', 'Actualizar membresía (rol, last_observed, confidence)', false),
  ('persons.band_memberships.end',    'persons', 'band_memberships', 'end',    'Cerrar membresía (active=false + ended_at)', false)
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
  AND p.module = 'persons'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.2 patrimonial — todo excepto delete documentos y read_internal de bandas
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.module = 'persons'
 AND p.code NOT IN ('persons.documents.delete', 'persons.bands.read_internal')
WHERE r.name = 'patrimonial'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.3 lawyer / lawyer_admin / field_lawyer / external_lawyer — read all + crear
-- aliases / addresses / documents (la defensa puede aportar antecedentes a
-- favor o en contra del imputado).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'persons.addresses.read',
    'persons.addresses.create',
    'persons.addresses.update',
    'persons.documents.read',
    'persons.documents.upload',
    'persons.documents.download',
    'persons.documents.update',
    'persons.aliases.read',
    'persons.aliases.create',
    'persons.aliases.update',
    'persons.bands.read',
    'persons.band_memberships.read'
  )
WHERE r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- lawyer_admin además recibe read_internal de bandas (visión completa para
-- estrategia procesal).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'persons.bands.read_internal'
WHERE r.name = 'lawyer_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.4 viewer — solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'persons.addresses.read',
    'persons.documents.read',
    'persons.aliases.read',
    'persons.bands.read',
    'persons.band_memberships.read'
  )
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.5 company_admin (security_provider) — read aliases + bands + memberships
-- (imputados frecuentes en sus zonas), read addresses (para contexto del
-- imputado capturado en flagrancia), upload de documents (foto al momento).
-- NO ven notas internas URP de bandas.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'persons.addresses.read',
    'persons.documents.read',
    'persons.documents.upload',
    'persons.aliases.read',
    'persons.aliases.create',
    'persons.bands.read',
    'persons.band_memberships.read'
  )
WHERE r.name = 'company_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2.6 guard — lo mismo que company_admin pero sin upload (que lo haga el
-- supervisor revisando) y sin update.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'persons.addresses.read',
    'persons.aliases.read',
    'persons.bands.read',
    'persons.band_memberships.read'
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
  v_lawyer_admin_perms INT;
  v_company_admin_perms INT;
  v_guard_perms INT;
  v_viewer_perms INT;
BEGIN
  SELECT count(*) INTO v_total_perms FROM permissions WHERE module = 'persons';

  SELECT count(*) INTO v_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'administrator' AND p.module = 'persons';

  SELECT count(*) INTO v_patrimonial_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial_admin' AND p.module = 'persons';

  SELECT count(*) INTO v_patrimonial_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'patrimonial' AND p.module = 'persons';

  SELECT count(*) INTO v_lawyer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer' AND p.module = 'persons';

  SELECT count(*) INTO v_lawyer_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'lawyer_admin' AND p.module = 'persons';

  SELECT count(*) INTO v_company_admin_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'company_admin' AND p.module = 'persons';

  SELECT count(*) INTO v_guard_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'guard' AND p.module = 'persons';

  SELECT count(*) INTO v_viewer_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.name = 'viewer' AND p.module = 'persons';

  IF v_total_perms < 22 THEN
    RAISE EXCEPTION 'seed/14: persons permisos incompleto (%)', v_total_perms;
  END IF;
  IF v_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/14: administrator no tiene todos (%/%)', v_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_admin_perms <> v_total_perms THEN
    RAISE EXCEPTION 'seed/14: patrimonial_admin no tiene todos (%/%)', v_patrimonial_admin_perms, v_total_perms;
  END IF;
  IF v_patrimonial_perms <> v_total_perms - 2 THEN
    RAISE EXCEPTION 'seed/14: patrimonial debe tener todos menos 2 (%/%)', v_patrimonial_perms, v_total_perms - 2;
  END IF;
  IF v_lawyer_admin_perms <> v_lawyer_perms + 1 THEN
    RAISE EXCEPTION 'seed/14: lawyer_admin debe tener exactamente 1 más que lawyer (lawyer=%, lawyer_admin=%)', v_lawyer_perms, v_lawyer_admin_perms;
  END IF;

  RAISE NOTICE 'seed/14 OK — persons total=% admin=% patrimonial_admin=% patrimonial=% lawyer=% lawyer_admin=% company_admin=% guard=% viewer=%',
    v_total_perms, v_admin_perms, v_patrimonial_admin_perms, v_patrimonial_perms,
    v_lawyer_perms, v_lawyer_admin_perms, v_company_admin_perms, v_guard_perms, v_viewer_perms;
END;
$$;
