-- =============================================================================
-- SURP 2.0 — seed/04_bootstrap.sql
--
-- Bootstrap institucional inicial:
--
--   1. Forestal Arauco S.A. como party (legal_entity, RUT 85805200-9) +
--      organization principal.
--
--   2. Softe SpA como party (RUT 77033805-0). NO es una organization del
--      sistema (los 3 tipos son principal/security_provider/api_consumer).
--      Se crea como party de referencia para vincular a Juan vía
--      party_relationships.employer.
--
--   3. Juan Quiero — superadministrador del sistema (Softe), opera como user
--      de la organización principal (Arauco). RUT 15592475-6,
--      email jquiero@softe.cl. must_reset_password=true (recibe email para
--      setear password en primer login). Rol: administrator.
--
--   4. Iván Vuskovic — administrador Arauco (Jefe URP). Email
--      ivan.Vuskovic@arauco.com. Rol: patrimonial_admin.
--
--   5. Las 3 security_provider (Green America, Maxcon, Tralkan) NO se cargan
--      aquí — se migran via ETL del legacy con sus RUTs reales (open question
--      pendiente Azure CLI).
--
-- Idempotente: cada paso usa ON CONFLICT cuando aplica.
--
-- Política de credenciales (regla #5 CLAUDE.md):
--   - password_hash = NULL al crear; must_reset_password=true.
--   - El user recibe email con token de reset al primer login.
--   - mfa_required=true (default), mfa_enrolled=false → forzado al primer login.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Arauco (party + legal_entity + organization principal)
-- -----------------------------------------------------------------------------

WITH arauco_party AS (
  INSERT INTO parties (party_type, rut, display_name, migrated_from_legacy_id)
  VALUES ('legal_entity', '85805200-9', 'Forestal Arauco S.A.', NULL)
  ON CONFLICT (rut) WHERE rut IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
)
INSERT INTO legal_entities (party_id, legal_name, business_activity)
SELECT id, 'Forestal Arauco S.A.', 'Actividad forestal y elaboración de productos forestales'
FROM arauco_party
ON CONFLICT (party_id) DO NOTHING;

INSERT INTO organizations (type, name, party_id, is_system, active)
SELECT 'principal', 'Forestal Arauco S.A.', p.id, true, true
FROM parties p WHERE p.rut = '85805200-9'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Softe SpA (party de referencia — empleador externo del superadmin)
-- -----------------------------------------------------------------------------

WITH softe_party AS (
  INSERT INTO parties (party_type, rut, display_name)
  VALUES ('legal_entity', '77033805-0', 'Softe SpA')
  ON CONFLICT (rut) WHERE rut IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
)
INSERT INTO legal_entities (party_id, legal_name, business_activity)
SELECT id, 'Softe SpA', 'Desarrollo de software'
FROM softe_party
ON CONFLICT (party_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Juan Quiero — superadministrador (party + natural_person + user)
--
-- Es user de Arauco (organization principal) — el modelo no contempla un tipo
-- "vendor" para Softe; Juan opera funcionalmente para Arauco con rol
-- administrator system-wide. El vínculo laboral con Softe se modela en
-- party_relationships.
-- -----------------------------------------------------------------------------

WITH jq_party AS (
  INSERT INTO parties (party_type, rut, display_name)
  VALUES ('natural_person', '15592475-6', 'Juan Quiero')
  ON CONFLICT (rut) WHERE rut IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
)
INSERT INTO natural_persons (party_id, given_names, paternal_surname)
SELECT id, 'Juan', 'Quiero'
FROM jq_party
ON CONFLICT (party_id) DO NOTHING;

-- User Juan en Arauco con rol administrator. password_hash=NULL fuerza reset.
INSERT INTO users (
  organization_id, party_id, email, display_name,
  password_hash, must_reset_password,
  mfa_required, mfa_enrolled, active,
  created_by_id
)
SELECT
  o.id, p.id, 'jquiero@softe.cl', 'Juan Quiero',
  NULL, true,
  true, false, true,
  NULL
FROM organizations o
CROSS JOIN parties p
WHERE o.type = 'principal' AND p.rut = '15592475-6'
ON CONFLICT (email) DO NOTHING;

-- Vínculo Juan ↔ Softe como employer.
INSERT INTO party_relationships (
  party_a_id, party_b_id, relationship_type, source_description, valid_from
)
SELECT
  pa.id, pb.id, 'employer',
  'Softe SpA — empresa desarrolladora del SURP 2.0; vínculo declarado en seed',
  now()
FROM parties pa, parties pb
WHERE pa.rut = '15592475-6' AND pb.rut = '77033805-0'
  AND NOT EXISTS (
    SELECT 1 FROM party_relationships
    WHERE party_a_id = pa.id AND party_b_id = pb.id AND relationship_type = 'employer'
      AND deleted_at IS NULL AND valid_to IS NULL
  );

-- Asignación de rol administrator a Juan.
INSERT INTO user_roles (user_id, role_id, assigned_by_id)
SELECT u.id, r.id, NULL
FROM users u, roles r
WHERE u.email = 'jquiero@softe.cl' AND r.name = 'administrator'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Iván Vuskovic — administrador Arauco (Jefe URP)
-- -----------------------------------------------------------------------------

WITH iv_party AS (
  INSERT INTO parties (party_type, rut, display_name)
  VALUES ('natural_person', '11111111-1', 'Iván Vuskovic')
  ON CONFLICT (rut) WHERE rut IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING id
)
INSERT INTO natural_persons (party_id, given_names, paternal_surname)
SELECT id, 'Iván', 'Vuskovic'
FROM iv_party
ON CONFLICT (party_id) DO NOTHING;
-- ⚠ RUT placeholder 11111111-1 (válido módulo 11 pero ficticio). El RUT real
-- de Iván se actualiza en el primer onboarding o vía workshop URP.

INSERT INTO users (
  organization_id, party_id, email, display_name,
  password_hash, must_reset_password,
  mfa_required, mfa_enrolled, active,
  created_by_id
)
SELECT
  o.id, p.id, 'ivan.Vuskovic@arauco.com', 'Iván Vuskovic',
  NULL, true,
  true, false, true,
  (SELECT id FROM users WHERE email = 'jquiero@softe.cl')
FROM organizations o
CROSS JOIN parties p
WHERE o.type = 'principal' AND p.rut = '11111111-1'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, assigned_by_id)
SELECT u.id, r.id, (SELECT id FROM users WHERE email = 'jquiero@softe.cl')
FROM users u, roles r
WHERE u.email = 'ivan.Vuskovic@arauco.com' AND r.name = 'patrimonial_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Verificación final
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_juan BIGINT;
  v_ivan BIGINT;
  v_admin_perm_count INT;
BEGIN
  SELECT id INTO v_juan FROM users WHERE email = 'jquiero@softe.cl';
  SELECT id INTO v_ivan FROM users WHERE email = 'ivan.Vuskovic@arauco.com';

  IF v_juan IS NULL THEN
    RAISE EXCEPTION 'bootstrap: usuario Juan no existe tras seed';
  END IF;
  IF v_ivan IS NULL THEN
    RAISE EXCEPTION 'bootstrap: usuario Iván no existe tras seed';
  END IF;

  SELECT count(*) INTO v_admin_perm_count
  FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'administrator';

  RAISE NOTICE 'bootstrap OK — Juan id=%, Iván id=%, administrator tiene % permisos',
    v_juan, v_ivan, v_admin_perm_count;
END;
$$;
