-- =============================================================================
-- SURP 2.0 — 01_organizations_users_roles.sql
--
-- Identidad, organizaciones, usuarios, autenticación, RBAC y bloqueos.
--
-- Grupos de tablas (en orden de creación):
--   1. parties (raíz de RUTs) + natural_persons + legal_entities
--   2. party_contacts + party_relationships
--   3. organizations
--   4. users + MFA + sessions + login_attempts
--   5. permissions + roles + role_permissions + user_roles
--   6. api_keys
--   7. blocks (polimórfica party | vehicle)
--
-- Decisiones de diseño referenciadas:
--   - ADR-B-003 (modelo multi-organización 3 tipos)
--   - ADR-B-007 (RBAC dinámico — roles editables, permisos catálogo)
--   - ADR-B-020 (use cases como fuente de verdad; schema aplica invariantes
--     mínimas, no reglas de negocio)
--   - LEGAL-INVARIANTS-INCIDENTS.md (roles procesales — no se modelan aquí
--     sino en el archivo de incidentes/causas)
--   - project_unified_rut_registry memory (tabla única de RUTs)
--   - project_auth_mfa_and_sso memory (MFA TOTP obligatorio humanos)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. parties — raíz única de identidades con RUT / documento extranjero.
-- -----------------------------------------------------------------------------

CREATE TABLE parties (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  -- Tipo discriminante. Determina qué extensión 1:1 aplica.
  party_type                  VARCHAR(20) NOT NULL
    CHECK (party_type IN ('natural_person', 'legal_entity')),

  -- RUT chileno (preferente). Nullable para soportar extranjeros sin RUT.
  rut                         d_rut,

  -- Documento alternativo para extranjeros cuando no hay RUT.
  foreign_document_type       VARCHAR(30),              -- pasaporte, DNI, cédula extranjera, etc.
  foreign_document_number     VARCHAR(50),
  foreign_document_country    CHAR(2),                  -- ISO 3166-1 alpha-2

  -- Nombre o razón social de presentación. Se calcula desde la extensión 1:1
  -- (natural_persons o legal_entities) y se denormaliza aquí para índices de
  -- búsqueda y para la API de bloqueos (respuesta rápida sin joins).
  display_name                VARCHAR(300) NOT NULL,

  -- Flag legacy `Empresa` → se mapea al party_type; no se mantiene aparte.
  -- Flag legacy `Bloqueado` → se expresa en tabla `blocks` (ver §7); NO como
  -- columna en parties. El estado de bloqueo se deriva del join con blocks.

  -- Merge de duplicados — solo Administrador puede ejecutar el merge. Cuando
  -- se consolidan dos filas A y B en favor de B, la fila A apunta a B aquí y
  -- las referencias de otros módulos (incidentes, denuncias, vehículos, etc.)
  -- se reasignan a B en la misma transacción.
  merged_into_party_id        BIGINT REFERENCES parties(id),
  merged_at                   TIMESTAMPTZ,
  merged_by_user_id           BIGINT,                   -- FK agregada al final del archivo
  merge_reason                TEXT,

  -- Trazabilidad ETL.
  migrated_from_legacy_id     INT,                      -- Persona.PersonaId legacy

  -- Auditoría estándar.
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ,

  -- Invariantes estructurales.
  CONSTRAINT parties_id_ck CHECK (
    -- Debe tener al menos una forma de identificación (RUT o documento extranjero).
    rut IS NOT NULL OR foreign_document_number IS NOT NULL
  ),
  CONSTRAINT parties_foreign_doc_consistency_ck CHECK (
    -- Si declara documento extranjero, debe traer tipo y país también.
    (foreign_document_number IS NULL AND foreign_document_type IS NULL AND foreign_document_country IS NULL)
    OR
    (foreign_document_number IS NOT NULL AND foreign_document_type IS NOT NULL AND foreign_document_country IS NOT NULL)
  ),
  CONSTRAINT parties_merge_consistency_ck CHECK (
    -- Si merged_into_party_id está seteado, merge_at y merge_by también.
    (merged_into_party_id IS NULL AND merged_at IS NULL AND merged_by_user_id IS NULL)
    OR
    (merged_into_party_id IS NOT NULL AND merged_at IS NOT NULL AND merged_by_user_id IS NOT NULL)
  ),
  CONSTRAINT parties_no_self_merge_ck CHECK (merged_into_party_id IS NULL OR merged_into_party_id <> id)
);

-- RUT único sobre filas activas no mergeadas. Permite que un party "mergeado"
-- conserve su RUT histórico mientras el activo lo toma como canónico.
CREATE UNIQUE INDEX parties_rut_unique_active_ux
  ON parties(rut)
  WHERE rut IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL;

-- Documento extranjero único por (tipo, país, número) sobre activos.
CREATE UNIQUE INDEX parties_foreign_doc_unique_active_ux
  ON parties(foreign_document_type, foreign_document_country, foreign_document_number)
  WHERE foreign_document_number IS NOT NULL AND deleted_at IS NULL AND merged_into_party_id IS NULL;

CREATE INDEX parties_party_type_ix        ON parties(party_type)        WHERE deleted_at IS NULL;
CREATE INDEX parties_merged_into_ix       ON parties(merged_into_party_id) WHERE merged_into_party_id IS NOT NULL;
CREATE INDEX parties_display_name_trgm_ix ON parties USING gin (display_name gin_trgm_ops);
CREATE INDEX parties_legacy_id_ix         ON parties(migrated_from_legacy_id) WHERE migrated_from_legacy_id IS NOT NULL;

CREATE TRIGGER parties_touch_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE parties IS
  'Tabla raíz de identidades (personas naturales y jurídicas). Fuente única de verdad para RUTs consultados por la API externa de bloqueos.';
COMMENT ON COLUMN parties.merged_into_party_id IS
  'Si no es NULL, esta fila fue mergeada en la fila apuntada. Solo Administrador puede ejecutar merge. Las referencias de otros módulos se reasignan a la fila destino durante el merge.';

-- -----------------------------------------------------------------------------
-- 2. natural_persons — extensión 1:1 de parties cuando party_type='natural_person'.
-- -----------------------------------------------------------------------------

CREATE TABLE natural_persons (
  party_id                    BIGINT PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,

  -- Datos nominales. Nombre y al menos un apellido son obligatorios.
  given_names                 VARCHAR(150) NOT NULL,    -- nombres
  paternal_surname            VARCHAR(100) NOT NULL,    -- apellido paterno
  maternal_surname            VARCHAR(100),             -- apellido materno (opcional, ej. extranjeros)

  -- Atributos opcionales (editables por URP / admin).
  gender                      VARCHAR(20)               -- 'male', 'female', 'other', 'not_reported'
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'not_reported')),
  birth_date                  DATE,
  nationality                 CHAR(2),                  -- ISO 3166-1 alpha-2

  -- Inteligencia operativa (mutables — el snapshot por incidente se congela
  -- en incident_party_links.snapshot_*).
  current_alias               VARCHAR(200),
  current_band                VARCHAR(200),             -- banda criminal asociada
  current_armed               BOOLEAN,                  -- indicio de portar armas (mutable; el hecho puntual va en el informe)

  -- Marcador legacy agravante interno URP (se conserva tal cual).
  timber_donation             BOOLEAN NOT NULL DEFAULT false,

  -- Observación libre de la URP.
  observation                 TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX natural_persons_paternal_trgm_ix
  ON natural_persons USING gin (fn_immutable_unaccent(lower(paternal_surname)) gin_trgm_ops);
CREATE INDEX natural_persons_given_names_trgm_ix
  ON natural_persons USING gin (fn_immutable_unaccent(lower(given_names)) gin_trgm_ops);
CREATE INDEX natural_persons_alias_ix
  ON natural_persons(current_alias) WHERE current_alias IS NOT NULL;
CREATE INDEX natural_persons_band_ix
  ON natural_persons(current_band) WHERE current_band IS NOT NULL;

CREATE TRIGGER natural_persons_touch_updated_at
  BEFORE UPDATE ON natural_persons
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE natural_persons IS
  'Extensión 1:1 de parties para personas naturales. party_id = PK y FK; al hacer DELETE de la parte raíz se cascada.';
COMMENT ON COLUMN natural_persons.timber_donation IS
  'Marcador legacy heredado del campo Persona.DonacionMadera. Agravante interno URP, no es tipificación penal oficial.';

-- -----------------------------------------------------------------------------
-- 3. legal_entities — extensión 1:1 de parties cuando party_type='legal_entity'.
-- -----------------------------------------------------------------------------

CREATE TABLE legal_entities (
  party_id                    BIGINT PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,

  legal_name                  VARCHAR(300) NOT NULL,    -- razón social
  trade_name                  VARCHAR(300),             -- nombre de fantasía
  business_activity           VARCHAR(300),             -- giro

  incorporation_date          DATE,
  observation                 TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX legal_entities_legal_name_trgm_ix
  ON legal_entities USING gin (fn_immutable_unaccent(lower(legal_name)) gin_trgm_ops);

CREATE TRIGGER legal_entities_touch_updated_at
  BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE legal_entities IS
  'Extensión 1:1 de parties para personas jurídicas (empresas). Incluye Arauco, empresas de seguridad, api_consumers, empresas forestales externas.';

-- -----------------------------------------------------------------------------
-- 4. party_contacts — multi-contacto con historia vigente/caducada.
-- -----------------------------------------------------------------------------

CREATE TABLE party_contacts (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,

  contact_type                VARCHAR(20) NOT NULL
    CHECK (contact_type IN ('phone', 'email', 'address', 'other')),
  value                       TEXT NOT NULL,            -- el formato se valida en la app (d_email / d_phone_cl / libre)
  label                       VARCHAR(80),              -- 'celular personal', 'trabajo', 'casa', 'oficina', etc.
  is_primary                  BOOLEAN NOT NULL DEFAULT false,

  valid_from                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to                    TIMESTAMPTZ,              -- NULL = vigente

  source_description          TEXT,                     -- origen del dato (legacy, declarado por el titular, etc.)

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT party_contacts_valid_range_ck CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX party_contacts_party_current_ix
  ON party_contacts(party_id)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

-- Solo un contacto primario por party+tipo entre los vigentes.
CREATE UNIQUE INDEX party_contacts_primary_per_type_ux
  ON party_contacts(party_id, contact_type)
  WHERE is_primary = true AND valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER party_contacts_touch_updated_at
  BEFORE UPDATE ON party_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5. party_relationships — red societaria + red personal/familiar/criminal.
-- -----------------------------------------------------------------------------

CREATE TABLE party_relationships (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  party_a_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  party_b_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,

  -- Catálogo inicial. Editable por admin en el módulo `catalog` cuando exista.
  relationship_type           VARCHAR(40) NOT NULL
    CHECK (relationship_type IN (
      -- Societaria (ambos party_type pueden variar)
      'legal_representative', 'director', 'shareholder', 'attorney_in_fact',
      -- Familiar / personal (aplica natural_person ↔ natural_person)
      'spouse', 'partner', 'parent', 'child', 'sibling',
      'friend', 'neighbor',
      -- Operativa
      'criminal_associate', 'employer', 'employee', 'other'
    )),

  valid_from                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to                    TIMESTAMPTZ,              -- NULL = vigente

  source_description          TEXT,                     -- ej. 'Certificado de vigencia CBR', 'declarado en informe #42-2026-ZVA'

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT party_relationships_distinct_parties_ck CHECK (party_a_id <> party_b_id),
  CONSTRAINT party_relationships_valid_range_ck       CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX party_relationships_party_a_current_ix
  ON party_relationships(party_a_id)
  WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX party_relationships_party_b_current_ix
  ON party_relationships(party_b_id)
  WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX party_relationships_type_current_ix
  ON party_relationships(relationship_type)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER party_relationships_touch_updated_at
  BEFORE UPDATE ON party_relationships
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE party_relationships IS
  'Red de vínculos entre parties: societarios (rep legal, director, socio), familiares, personales y criminales. Sustituye el enum legacy Persona.Vinculacion (texto sin FK).';

-- -----------------------------------------------------------------------------
-- 6. organizations — tres tipos: principal / security_provider / api_consumer.
-- -----------------------------------------------------------------------------

CREATE TABLE organizations (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  type                        VARCHAR(30) NOT NULL
    CHECK (type IN ('principal', 'security_provider', 'api_consumer')),
  name                        VARCHAR(200) NOT NULL,

  -- Organizaciones con RUT se vinculan a un party_id (tipo legal_entity) para
  -- centralizar la identidad. `party_id` puede ser NULL solo cuando la
  -- organización no tiene RUT (caso atípico — la mayoría tiene).
  party_id                    BIGINT UNIQUE REFERENCES parties(id),

  is_system                   BOOLEAN NOT NULL DEFAULT false,  -- seed Arauco = true
  active                      BOOLEAN NOT NULL DEFAULT true,

  -- Configuración específica de api_consumer (null para otros tipos).
  api_rate_limit_per_minute   INT,                      -- default en auth-layer si NULL

  migrated_from_legacy_id     VARCHAR(20),              -- Empresa.EmpresaId legacy

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT organizations_rate_limit_scope_ck CHECK (
    api_rate_limit_per_minute IS NULL OR type = 'api_consumer'
  )
);

-- Una sola organización tipo principal (Arauco) activa.
CREATE UNIQUE INDEX organizations_unique_principal_ux
  ON organizations(type)
  WHERE type = 'principal' AND deleted_at IS NULL;

CREATE INDEX organizations_type_ix   ON organizations(type)   WHERE deleted_at IS NULL;
CREATE INDEX organizations_active_ix ON organizations(active) WHERE deleted_at IS NULL;

CREATE TRIGGER organizations_touch_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE organizations IS
  'Organizaciones del sistema. Tres tipos: principal (Arauco, única), security_provider (empresas de seguridad contratistas), api_consumer (forestales que consultan la API externa).';

-- -----------------------------------------------------------------------------
-- 7. users — usuarios humanos. Se vinculan a una organization y opcionalmente
-- a un party (para usuarios con RUT chileno, que es la mayoría).
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  organization_id             BIGINT NOT NULL REFERENCES organizations(id),
  party_id                    BIGINT UNIQUE REFERENCES parties(id),  -- NULL solo para cuentas de servicio humanas excepcionales

  email                       d_email UNIQUE NOT NULL,
  phone                       d_phone_cl,

  -- Credencial. NULL hasta que el usuario termina onboarding (set password + MFA).
  password_hash               VARCHAR(255),                   -- argon2id
  password_updated_at         TIMESTAMPTZ,
  must_reset_password         BOOLEAN NOT NULL DEFAULT false,

  -- MFA TOTP obligatorio para humanos. Se activa en primer login.
  mfa_required                BOOLEAN NOT NULL DEFAULT true,
  mfa_enrolled                BOOLEAN NOT NULL DEFAULT false,

  -- Estado de cuenta.
  active                      BOOLEAN NOT NULL DEFAULT true,
  locked_until                TIMESTAMPTZ,                    -- bloqueo temporal por intentos fallidos
  last_login_at               TIMESTAMPTZ,
  last_login_ip               INET,

  -- Display — denormalizado desde natural_persons vía el party_id para evitar
  -- el join en cada request (el interceptor de auditoría necesita el nombre).
  display_name                VARCHAR(200) NOT NULL,

  migrated_from_legacy_id     INT,                            -- Usuario.UsuarioId legacy

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX users_organization_ix ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX users_active_ix       ON users(active)          WHERE deleted_at IS NULL;
CREATE INDEX users_locked_until_ix ON users(locked_until)    WHERE locked_until IS NOT NULL;

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE users IS
  'Usuarios humanos del sistema. MFA TOTP obligatorio. Los api_consumer se autentican con API keys (ver tabla api_keys), no con users.';
COMMENT ON COLUMN users.party_id IS
  'Vínculo al party raíz del usuario (su RUT). UNIQUE: un party puede ser usuario al máximo una vez.';

-- -----------------------------------------------------------------------------
-- 8. user_mfa_totp_secrets — secreto TOTP cifrado por usuario.
-- Tabla separada para aislar el secreto del resto de users (permisos SQL más
-- restrictivos y rotación sin tocar users).
-- -----------------------------------------------------------------------------

CREATE TABLE user_mfa_totp_secrets (
  user_id                     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Secreto cifrado con clave de Azure Key Vault. El schema NO lo descifra;
  -- la aplicación hace rotate/verify.
  encrypted_secret            BYTEA NOT NULL,
  key_version                 VARCHAR(50) NOT NULL,           -- referencia a la versión de la clave en Key Vault
  algorithm                   VARCHAR(10) NOT NULL DEFAULT 'SHA1',
  digits                      SMALLINT NOT NULL DEFAULT 6 CHECK (digits IN (6, 8)),
  period_seconds              SMALLINT NOT NULL DEFAULT 30,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at                TIMESTAMPTZ,
  reset_count                 INT NOT NULL DEFAULT 0,         -- cuántas veces se ha reenrolado (admin resets)
  last_reset_at               TIMESTAMPTZ,
  last_reset_by_user_id       BIGINT REFERENCES users(id),
  last_reset_reason           TEXT
);

COMMENT ON TABLE user_mfa_totp_secrets IS
  'Secretos TOTP cifrados. El descifrado ocurre solo en la aplicación con clave de Key Vault. Admin puede resetear (requiere motivo auditado).';

-- -----------------------------------------------------------------------------
-- 9. user_sessions — sesiones activas con refresh tokens rotables.
-- -----------------------------------------------------------------------------

CREATE TABLE user_sessions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  user_id                     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  refresh_token_hash          VARCHAR(255) NOT NULL UNIQUE,   -- hash del refresh token opaco
  ip                          INET NOT NULL,
  user_agent                  TEXT,

  -- Etiqueta auto-generada al login para mostrar en /settings/seguridad.
  -- Computada por UaParserDeviceDetector desde user_agent + ip (geoip-lite).
  -- Ejemplo: "Chrome en Mac · Concepción, Chile". Ver ADR-B-022.
  device_label                TEXT,
  device_type                 VARCHAR(20)
    CHECK (device_type IS NULL OR device_type IN ('desktop','mobile','tablet','bot','unknown')),
  location_label              TEXT,

  issued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                  TIMESTAMPTZ NOT NULL,
  revoked_at                  TIMESTAMPTZ,
  revoke_reason               VARCHAR(50)                     -- 'logout', 'admin', 'password_change', 'suspicious'
);

CREATE INDEX user_sessions_user_active_ix
  ON user_sessions(user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX user_sessions_expiring_ix
  ON user_sessions(expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE user_sessions IS
  'Sesiones de usuario con refresh tokens. Rotación en cada refresh; admin puede revocar todas las sesiones de un usuario.';

-- -----------------------------------------------------------------------------
-- 10. user_login_attempts — intentos de login (éxito y fallo) para detección
-- de abuso y bloqueo de cuenta.
-- -----------------------------------------------------------------------------

CREATE TABLE user_login_attempts (
  id                          BIGSERIAL PRIMARY KEY,
  user_id                     BIGINT REFERENCES users(id),   -- NULL cuando el email no existe
  email_attempted             d_email NOT NULL,
  ip                          INET NOT NULL,
  user_agent                  TEXT,

  outcome                     VARCHAR(30) NOT NULL
    CHECK (outcome IN ('success', 'bad_password', 'unknown_email', 'locked', 'mfa_failed', 'mfa_required', 'inactive')),
  mfa_used                    BOOLEAN NOT NULL DEFAULT false,

  attempted_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_login_attempts_recent_fails_ix
  ON user_login_attempts(user_id, attempted_at DESC)
  WHERE outcome IN ('bad_password', 'mfa_failed');

CREATE INDEX user_login_attempts_by_ip_ix
  ON user_login_attempts(ip, attempted_at DESC);

COMMENT ON TABLE user_login_attempts IS
  'Registro append-only de intentos de login. Usado para bloqueo por 5 fallos en 10 minutos y análisis forense.';

-- -----------------------------------------------------------------------------
-- 11. permissions — catálogo fijo (sincronizado desde código en arranque).
-- -----------------------------------------------------------------------------

CREATE TABLE permissions (
  id                          BIGSERIAL PRIMARY KEY,
  code                        VARCHAR(100) UNIQUE NOT NULL,   -- 'incidents.incidents.create'
  module                      VARCHAR(50) NOT NULL,
  resource                    VARCHAR(50) NOT NULL,
  action                      VARCHAR(50) NOT NULL,
  description                 TEXT,
  is_sensitive                BOOLEAN NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX permissions_module_ix ON permissions(module);

COMMENT ON TABLE permissions IS
  'Catálogo de permisos del sistema. Sincronizado automáticamente desde `src/auth/permissions.catalog.ts` al arranque. El admin NO puede editar permisos vía UI; solo los puede asignar a roles.';

-- -----------------------------------------------------------------------------
-- 12. roles — RBAC dinámico. Admin puede crear/editar roles en runtime.
-- -----------------------------------------------------------------------------

CREATE TABLE roles (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name                        VARCHAR(100) UNIQUE NOT NULL,
  description                 TEXT,

  scope                       VARCHAR(30) NOT NULL
    CHECK (scope IN ('principal_only', 'security_provider_only', 'api_consumer_only')),
  is_system                   BOOLEAN NOT NULL DEFAULT false,  -- roles seed no se borran/renombran
  active                      BOOLEAN NOT NULL DEFAULT true,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX roles_scope_ix  ON roles(scope)  WHERE deleted_at IS NULL;
CREATE INDEX roles_active_ix ON roles(active) WHERE deleted_at IS NULL;

CREATE TRIGGER roles_touch_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 13. role_permissions — N:M role ↔ permission.
-- -----------------------------------------------------------------------------

CREATE TABLE role_permissions (
  role_id                     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id               BIGINT NOT NULL REFERENCES permissions(id),
  granted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_id               BIGINT,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX role_permissions_permission_ix ON role_permissions(permission_id);

-- -----------------------------------------------------------------------------
-- 14. user_roles — N:M user ↔ role (permisos efectivos = UNIÓN de todos los roles).
-- -----------------------------------------------------------------------------

CREATE TABLE user_roles (
  user_id                     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id                     BIGINT NOT NULL REFERENCES roles(id),
  assigned_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by_id              BIGINT,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX user_roles_role_ix ON user_roles(role_id);

COMMENT ON TABLE user_roles IS
  'Un usuario puede tener múltiples roles. Permisos efectivos = UNIÓN de los permisos de todos sus roles. Validación de scope vs organization.type se hace en la aplicación al asignar.';

-- -----------------------------------------------------------------------------
-- 15. api_keys — autenticación de api_consumers.
-- -----------------------------------------------------------------------------

CREATE TABLE api_keys (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  organization_id             BIGINT NOT NULL REFERENCES organizations(id),

  name                        VARCHAR(100) NOT NULL,           -- etiqueta humana ('prod', 'integración X', etc.)
  prefix                      VARCHAR(12) NOT NULL,            -- primeros 8 chars visibles, para identificar la key sin revelar el secret
  key_hash                    VARCHAR(255) NOT NULL,           -- argon2 del secret

  rate_limit_per_minute       INT,                             -- override al default de la organización

  expires_at                  TIMESTAMPTZ,
  revoked_at                  TIMESTAMPTZ,
  revoke_reason               TEXT,
  last_used_at                TIMESTAMPTZ,
  last_used_ip                INET,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NOT NULL
);

CREATE INDEX api_keys_org_active_ix
  ON api_keys(organization_id)
  WHERE revoked_at IS NULL;

CREATE INDEX api_keys_prefix_ix
  ON api_keys(prefix)
  WHERE revoked_at IS NULL;

CREATE INDEX api_keys_expiring_ix
  ON api_keys(expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- Una organización solo puede tener api_keys si es api_consumer — enforcement
-- débil en SQL (trigger defensivo) y fuerte en la aplicación.
CREATE OR REPLACE FUNCTION fn_api_keys_require_api_consumer_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_type VARCHAR(30);
BEGIN
  SELECT type INTO v_type FROM organizations WHERE id = NEW.organization_id;
  IF v_type <> 'api_consumer' THEN
    RAISE EXCEPTION 'api_keys.organization_id must reference an api_consumer organization (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER api_keys_require_api_consumer_org_ck
  BEFORE INSERT OR UPDATE OF organization_id ON api_keys
  FOR EACH ROW EXECUTE FUNCTION fn_api_keys_require_api_consumer_org();

COMMENT ON TABLE api_keys IS
  'API keys de api_consumers. Hashed (argon2); el secreto completo se muestra una sola vez al crear. Rate limit configurable por key (default en organizations.api_rate_limit_per_minute).';

-- -----------------------------------------------------------------------------
-- 16. blocks — bloqueos polimórficos (party | vehicle).
-- Fuente única de verdad consultada por la API externa `/blocks/check`.
-- -----------------------------------------------------------------------------

CREATE TABLE blocks (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  target_type                 VARCHAR(20) NOT NULL
    CHECK (target_type IN ('party', 'vehicle')),
  target_id                   BIGINT NOT NULL,                 -- FK polimórfica (ver trigger de integridad)

  reason                      TEXT NOT NULL,
  active                      BOOLEAN NOT NULL DEFAULT true,

  granted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_user_id          BIGINT NOT NULL REFERENCES users(id),
  revoked_at                  TIMESTAMPTZ,
  revoked_by_user_id          BIGINT REFERENCES users(id),
  revoke_reason               TEXT,

  -- Trazabilidad opcional al incidente que originó el bloqueo. La FK se
  -- agregará cuando exista la tabla `incidents` (archivo 03+). Por ahora es
  -- BIGINT sin FK.
  linked_incident_id          BIGINT,

  migrated_from_legacy_id     INT,                             -- Persona.PersonaId cuando Bloqueado=true (legacy)

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT,

  CONSTRAINT blocks_active_consistency_ck CHECK (
    (active = true  AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR
    (active = false AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  )
);

-- Un mismo target (party/vehicle) solo puede tener un bloqueo activo.
CREATE UNIQUE INDEX blocks_one_active_per_target_ux
  ON blocks(target_type, target_id)
  WHERE active = true;

CREATE INDEX blocks_target_ix ON blocks(target_type, target_id);
CREATE INDEX blocks_active_ix ON blocks(active) WHERE active = true;

CREATE TRIGGER blocks_touch_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Integridad polimórfica: si target_type='party', target_id debe existir en
-- parties. Cuando exista la tabla `vehicles`, se extiende este trigger. Se
-- mantiene en PL/pgSQL (no como FK) por la naturaleza polimórfica.
CREATE OR REPLACE FUNCTION fn_blocks_check_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_type = 'party' THEN
    IF NOT EXISTS (SELECT 1 FROM parties WHERE id = NEW.target_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'blocks.target_id % no existe en parties (activa)', NEW.target_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.target_type = 'vehicle' THEN
    -- La tabla vehicles se crea en un archivo posterior. Hasta entonces,
    -- los inserts con target_type='vehicle' fallan aquí.
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicles') THEN
      RAISE EXCEPTION 'blocks.target_type=vehicle requiere la tabla vehicles (aún no creada)'
        USING ERRCODE = 'undefined_table';
    END IF;

    -- Cuando vehicles exista, esta verificación se activa automáticamente.
    -- (Se deja el EXECUTE dinámico comentado; al crear vehicles se reemplaza
    -- esta función con la verificación completa.)
    -- IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = NEW.target_id AND deleted_at IS NULL) THEN
    --   RAISE EXCEPTION 'blocks.target_id % no existe en vehicles (activa)', NEW.target_id
    --     USING ERRCODE = 'foreign_key_violation';
    -- END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocks_check_target_exists_ck
  BEFORE INSERT OR UPDATE OF target_type, target_id ON blocks
  FOR EACH ROW EXECUTE FUNCTION fn_blocks_check_target_exists();

COMMENT ON TABLE blocks IS
  'Bloqueos polimórficos (party | vehicle). Fuente única de verdad para la API externa `/api/v1/blocks/check`. Índice parcial garantiza un solo bloqueo activo por target.';

-- -----------------------------------------------------------------------------
-- 17. FK diferidas que cierran ciclos created_by_id / updated_by_id / merge.
--
-- Las columnas `created_by_id`, `updated_by_id`, `merged_by_user_id` referencian
-- `users(id)`. Se agregan las FK aquí (al final) para evitar el problema del
-- huevo y la gallina: users también tiene created_by_id, así que el primer
-- usuario bootstrap se inserta con created_by_id = NULL o apuntándose a sí
-- mismo.
-- -----------------------------------------------------------------------------

ALTER TABLE parties
  ADD CONSTRAINT parties_created_by_fk     FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT parties_updated_by_fk     FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT parties_merged_by_fk      FOREIGN KEY (merged_by_user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE natural_persons
  ADD CONSTRAINT natural_persons_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT natural_persons_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE legal_entities
  ADD CONSTRAINT legal_entities_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT legal_entities_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE party_contacts
  ADD CONSTRAINT party_contacts_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT party_contacts_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE party_relationships
  ADD CONSTRAINT party_relationships_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT party_relationships_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT organizations_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE users
  ADD CONSTRAINT users_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT users_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE roles
  ADD CONSTRAINT roles_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT roles_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_granted_by_fk FOREIGN KEY (granted_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_assigned_by_fk FOREIGN KEY (assigned_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE blocks
  ADD CONSTRAINT blocks_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT blocks_updated_by_fk FOREIGN KEY (updated_by_id) REFERENCES users(id)  DEFERRABLE INITIALLY DEFERRED;
