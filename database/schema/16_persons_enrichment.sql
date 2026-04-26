-- =============================================================================
-- SURP 2.0 — schema/16_persons_enrichment.sql
--
-- Persons enrichment — eleva los campos planos del legacy `Persona` a tablas
-- normalizadas con histórico, source, confidence y vinculación catalogada.
--
--   1. bands                        Catálogo de bandas criminales / grupos de
--                                   interés URP (admin-editable).
--   2. party_addresses              Direcciones físicas con commune + Point opc.
--                                   (legacy `Persona.Direccion` era string).
--   3. party_documents              Adjuntos del party (cédula, antecedentes,
--                                   foto, evidencia de bloqueo/desbloqueo).
--                                   Reemplaza `ArchivoPersona` legacy + los
--                                   campos `Persona.ArchivoFile`/`Archivo
--                                   Desbloqueo`.
--   4. party_aliases                Histórico de aliases (legacy solo guarda
--                                   alias actual en natural_persons.current_alias).
--   5. party_band_memberships       N:N party↔band con vigencia, rol y confianza.
--                                   Reemplaza el string natural_persons.current_band.
--
-- Marco legal — /legal-datos (Ley 21.719):
--   - Direcciones, documentos, aliases y bandas vinculados a procesos penales
--     son **datos sensibles** (art. 16). Acceso restringido a personal URP
--     autorizado, con logs de auditoría inmutables.
--   - Privacy by design: source y confidence explícitos para evitar inferencia
--     basada en datos imprecisos.
--   - Foto de persona NO se marca como dato biométrico mientras el sistema no
--     aplique reconocimiento facial. Si en el futuro se aplica, requiere DPIA.
--   - Hard delete prohibido en todas (cadena de evidencia + posibilidad de
--     anonimización futura por política de retención).
--   - Base de licitud: obligación legal de denuncia (CPP art. 175 letra e) +
--     interés legítimo de Arauco (defensa del patrimonio).
--
-- Engancha con:
--   - parties / natural_persons / legal_entities
--   - users (auditoría)
--   - communes (party_addresses)
--   - StorageService (party_documents.storage_uri)
-- =============================================================================


-- =============================================================================
-- 1. bands — catálogo de bandas criminales / grupos URP
-- =============================================================================
-- Catálogo abierto: el admin URP agrega bandas conforme las identifica la
-- inteligencia operativa. is_system para las que se cargan del legacy.

CREATE TABLE bands (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                VARCHAR(60) NOT NULL UNIQUE,
  name                VARCHAR(200) NOT NULL,
  description         TEXT NULL,
  -- Zonas / áreas / regiones donde la banda opera (texto libre por flexibilidad).
  operational_area    TEXT NULL,
  -- Notas operativas URP (modus operandi, líderes conocidos, etc.). Sensible.
  internal_notes      TEXT NULL,

  active              BOOLEAN NOT NULL DEFAULT true,
  is_system           BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT bands_code_format_ck CHECK (code ~ '^[a-z0-9_-]+$'),
  CONSTRAINT bands_name_not_empty_ck CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER bands_touch_updated_at
  BEFORE UPDATE ON bands
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Protección is_system (mismo patrón que catálogos de schema/04).
CREATE OR REPLACE FUNCTION fn_bands_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'bands: no se puede eliminar banda is_system=true (%)', OLD.code;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'bands: is_system no puede pasar de true a false (%)', OLD.code;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'bands: code es inmutable cuando is_system=true (%)', OLD.code;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bands_protect_system
  BEFORE UPDATE OR DELETE ON bands
  FOR EACH ROW EXECUTE FUNCTION fn_bands_protect_system();

CREATE INDEX bands_active_ix    ON bands(active) WHERE deleted_at IS NULL;
CREATE INDEX bands_name_trgm_ix ON bands USING gin (fn_immutable_unaccent(lower(name)) gin_trgm_ops);

COMMENT ON TABLE bands IS
  'Catálogo de bandas criminales / grupos de interés URP. Editable por admin. internal_notes es sensible (Ley 21.719 art. 16).';
COMMENT ON COLUMN bands.internal_notes IS
  'Notas operativas URP. Acceso restringido a roles con permiso persons.bands.read_internal.';


-- =============================================================================
-- 2. party_addresses — direcciones físicas de la persona
-- =============================================================================

CREATE TABLE party_addresses (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,

  address_type        VARCHAR(20) NOT NULL,
  -- Dirección como texto estructurado.
  street              VARCHAR(200) NOT NULL,
  number              VARCHAR(20) NULL,
  unit                VARCHAR(40) NULL,           -- depto, casa, oficina
  neighborhood        VARCHAR(120) NULL,
  postal_code         VARCHAR(20) NULL,
  commune_id          BIGINT NULL REFERENCES communes(id),
  region_code         VARCHAR(10) NULL,           -- ISO-3166-2 (autoresolver desde commune)
  country_code        CHAR(2) NOT NULL DEFAULT 'CL',

  -- Coordenada opcional (catastro, Google geocoding, observación en terreno).
  location            geometry(Point, 4326) NULL,

  -- Procedencia y confianza del dato (Ley 21.719 calidad + accountability).
  source              VARCHAR(40) NOT NULL,
  source_description  TEXT NULL,                  -- detalle (ej. "informe #19-2026-ZVA")
  confidence          VARCHAR(20) NOT NULL DEFAULT 'declared',

  -- Vigencia (histórico de direcciones).
  valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE NULL,

  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT pa_address_type_ck CHECK (address_type IN (
    'residence', 'work', 'last_seen', 'other'
  )),
  CONSTRAINT pa_source_ck CHECK (source IN (
    'declared',         -- declarado por el titular o por terceros confiables
    'observed',         -- observado por personal URP (informe, patrullaje)
    'official_registry', -- catastro, registro civil, RVM, etc.
    'inferred',         -- inferido (dirección probable por contexto)
    'legacy'            -- migrado del SURP legacy
  )),
  CONSTRAINT pa_confidence_ck CHECK (confidence IN (
    'verified', 'declared', 'observed', 'inferred'
  )),
  CONSTRAINT pa_validity_ck CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT pa_country_format_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT pa_street_not_empty_ck CHECK (length(trim(street)) > 0),
  CONSTRAINT pa_chile_bbox_ck CHECK (
    location IS NULL
    OR (ST_X(location) BETWEEN -110 AND -66 AND ST_Y(location) BETWEEN -90 AND -17)
    OR country_code <> 'CL'
  )
);

CREATE TRIGGER party_addresses_touch_updated_at
  BEFORE UPDATE ON party_addresses
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Auto-resolver region_code desde commune.
CREATE OR REPLACE FUNCTION fn_party_addresses_resolve_region()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commune_id IS NOT NULL AND NEW.region_code IS NULL THEN
    SELECT r.iso_3166_2 INTO NEW.region_code
    FROM communes c JOIN regions r ON r.id = c.region_id
    WHERE c.id = NEW.commune_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_addresses_resolve_region
  BEFORE INSERT OR UPDATE OF commune_id ON party_addresses
  FOR EACH ROW EXECUTE FUNCTION fn_party_addresses_resolve_region();

-- Hard delete prohibido (datos sensibles + retención).
CREATE OR REPLACE FUNCTION fn_party_addresses_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'party_addresses: hard delete prohibido. Usar valid_to o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_addresses_no_hard_delete
  BEFORE DELETE ON party_addresses
  FOR EACH ROW EXECUTE FUNCTION fn_party_addresses_no_hard_delete();

-- Una sola dirección activa por (party, address_type).
CREATE UNIQUE INDEX idx_pa_one_active_per_type
  ON party_addresses(party_id, address_type)
  WHERE deleted_at IS NULL AND valid_to IS NULL;

CREATE INDEX idx_pa_party       ON party_addresses(party_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_pa_commune     ON party_addresses(commune_id)      WHERE deleted_at IS NULL AND commune_id IS NOT NULL;
CREATE INDEX idx_pa_region      ON party_addresses(region_code)     WHERE deleted_at IS NULL AND region_code IS NOT NULL;
CREATE INDEX idx_pa_location_gix ON party_addresses USING GIST (location);
CREATE INDEX idx_pa_active      ON party_addresses(party_id) WHERE deleted_at IS NULL AND valid_to IS NULL;

COMMENT ON TABLE party_addresses IS
  'Direcciones físicas de personas naturales y jurídicas. Histórico via valid_from/valid_to. source/confidence trazan calidad del dato (Ley 21.719). Sensible cuando vinculado a imputado.';


-- =============================================================================
-- 3. party_documents — adjuntos del party (cédula, antecedentes, foto, etc.)
-- =============================================================================
-- Storage backend abstraído por StorageService (driver local|azure).
-- sha256 obligatorio para cadena de evidencia (CPP arts. 187+).

CREATE TABLE party_documents (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,

  document_type       VARCHAR(40) NOT NULL,

  storage_uri         TEXT NOT NULL,
  mime_type           VARCHAR(100) NOT NULL,
  size_bytes          BIGINT NOT NULL,
  sha256_hash         CHAR(64) NOT NULL,

  -- Metadata semántica.
  description         TEXT NULL,
  document_number     VARCHAR(80) NULL,           -- ej. nro de cédula, nro pasaporte
  issued_at           DATE NULL,
  expires_at          DATE NULL,
  issuing_authority   VARCHAR(200) NULL,

  -- Clasificación de confidencialidad (impacta acceso vía RBAC).
  confidentiality     VARCHAR(30) NOT NULL DEFAULT 'sensitive',

  -- Source y captura.
  source_description  TEXT NULL,
  captured_at         TIMESTAMPTZ NULL,
  captured_by_user_id BIGINT NULL REFERENCES users(id),

  -- Marcador biométrico — Ley 21.719: foto NO es biométrica salvo procesamiento.
  -- Si el sistema introduce reconocimiento facial debe activarse este flag y
  -- requerirá DPIA.
  is_biometric        BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT pd_document_type_ck CHECK (document_type IN (
    'id_card_chile',           -- cédula chilena
    'passport',                -- pasaporte
    'driver_license',          -- licencia de conducir
    'criminal_record_cert',    -- certificado de antecedentes
    'photo_id',                -- foto identificatoria (no biométrica por defecto)
    'block_evidence',          -- documento sustento del bloqueo (legacy)
    'unblock_evidence',        -- documento sustento del desbloqueo (legacy)
    'commercial_record',       -- info comercial (Dicom, etc.)
    'court_document',          -- copia documento judicial vinculado al party
    'other'
  )),
  CONSTRAINT pd_confidentiality_ck CHECK (confidentiality IN (
    'internal',           -- uso operativo URP general
    'sensitive',          -- art. 16 Ley 21.719 (datos relativos a procesos penales)
    'judicial_evidence'   -- evidencia con cadena de custodia activa
  )),
  CONSTRAINT pd_size_positive_ck CHECK (size_bytes > 0),
  CONSTRAINT pd_sha256_format_ck CHECK (sha256_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pd_dates_ck CHECK (
    expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at
  )
);

CREATE TRIGGER party_documents_touch_updated_at
  BEFORE UPDATE ON party_documents
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido (cadena de evidencia + Ley 21.719 retención).
CREATE OR REPLACE FUNCTION fn_party_documents_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'party_documents: hard delete prohibido. Usar deleted_at o anonimización por política de retención.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_documents_no_hard_delete
  BEFORE DELETE ON party_documents
  FOR EACH ROW EXECUTE FUNCTION fn_party_documents_no_hard_delete();

-- sha256 inmutable: si cambia el contenido, va a un nuevo registro.
CREATE OR REPLACE FUNCTION fn_party_documents_immutable_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash
     OR NEW.size_bytes  IS DISTINCT FROM OLD.size_bytes
     OR NEW.storage_uri IS DISTINCT FROM OLD.storage_uri THEN
    RAISE EXCEPTION 'party_documents: sha256_hash, size_bytes y storage_uri son inmutables (cadena de evidencia).';
  END IF;
  IF NEW.party_id IS DISTINCT FROM OLD.party_id THEN
    RAISE EXCEPTION 'party_documents: party_id es inmutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_documents_immutable_evidence
  BEFORE UPDATE ON party_documents
  FOR EACH ROW EXECUTE FUNCTION fn_party_documents_immutable_evidence();

CREATE INDEX idx_pd_party             ON party_documents(party_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_pd_document_type     ON party_documents(document_type)    WHERE deleted_at IS NULL;
CREATE INDEX idx_pd_confidentiality   ON party_documents(confidentiality)  WHERE deleted_at IS NULL;
CREATE INDEX idx_pd_expires           ON party_documents(expires_at)       WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX idx_pd_biometric         ON party_documents(party_id)         WHERE deleted_at IS NULL AND is_biometric = true;
CREATE INDEX idx_pd_sha256            ON party_documents(sha256_hash);

COMMENT ON TABLE party_documents IS
  'Documentos digitales asociados a un party (cédula, antecedentes, foto, evidencia bloqueo). Storage abstraído por StorageService. sha256+size+storage_uri inmutables (cadena de evidencia). Sensible por Ley 21.719 art. 16.';
COMMENT ON COLUMN party_documents.is_biometric IS
  'true solo si el sistema procesa el documento con identificación automatizada (reconocimiento facial). Activarlo requiere DPIA previa por Ley 21.719.';


-- =============================================================================
-- 4. party_aliases — histórico de aliases con first/last seen
-- =============================================================================

CREATE TABLE party_aliases (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,

  alias               VARCHAR(200) NOT NULL,

  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_description  TEXT NULL,
  confidence          VARCHAR(20) NOT NULL DEFAULT 'reported',

  active              BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT palias_alias_not_empty_ck CHECK (length(trim(alias)) > 0),
  CONSTRAINT palias_confidence_ck CHECK (confidence IN (
    'verified', 'reported', 'suspected'
  )),
  CONSTRAINT palias_seen_dates_ck CHECK (last_seen_at >= first_seen_at)
);

CREATE TRIGGER party_aliases_touch_updated_at
  BEFORE UPDATE ON party_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_party_aliases_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'party_aliases: hard delete prohibido. Usar active=false o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_aliases_no_hard_delete
  BEFORE DELETE ON party_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_party_aliases_no_hard_delete();

-- Un alias normalizado solo activo una vez por party (evita duplicación).
CREATE UNIQUE INDEX idx_palias_unique_active
  ON party_aliases(party_id, lower(fn_immutable_unaccent(alias)))
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX idx_palias_party        ON party_aliases(party_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_palias_active       ON party_aliases(party_id)        WHERE deleted_at IS NULL AND active = true;
CREATE INDEX idx_palias_alias_trgm   ON party_aliases USING gin (fn_immutable_unaccent(lower(alias)) gin_trgm_ops);

COMMENT ON TABLE party_aliases IS
  'Histórico de aliases del party. Reemplaza natural_persons.current_alias (que queda como denormalización del último alias activo).';


-- =============================================================================
-- 5. party_band_memberships — membresía a banda criminal con vigencia
-- =============================================================================

CREATE TABLE party_band_memberships (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  band_id             BIGINT NOT NULL REFERENCES bands(id)   ON DELETE RESTRICT,

  member_role         VARCHAR(30) NOT NULL DEFAULT 'member',
  confidence          VARCHAR(20) NOT NULL DEFAULT 'reported',

  first_observed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_description  TEXT NULL,

  active              BOOLEAN NOT NULL DEFAULT true,
  ended_at            TIMESTAMPTZ NULL,                -- cuando dejó la banda
  ended_reason        TEXT NULL,
  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT pbm_member_role_ck CHECK (member_role IN (
    'leader', 'member', 'collaborator', 'logistics', 'lookout', 'unknown'
  )),
  CONSTRAINT pbm_confidence_ck CHECK (confidence IN (
    'verified', 'reported', 'suspected'
  )),
  CONSTRAINT pbm_observed_dates_ck CHECK (last_observed_at >= first_observed_at),
  CONSTRAINT pbm_ended_consistency_ck CHECK (
    (active = true  AND ended_at IS NULL AND ended_reason IS NULL)
    OR (active = false AND ended_at IS NOT NULL)
  )
);

CREATE TRIGGER party_band_memberships_touch_updated_at
  BEFORE UPDATE ON party_band_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_pbm_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'party_band_memberships: hard delete prohibido. Usar active=false + ended_at o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pbm_no_hard_delete
  BEFORE DELETE ON party_band_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_pbm_no_hard_delete();

-- party_id, band_id inmutables (un cambio implica nueva fila).
CREATE OR REPLACE FUNCTION fn_pbm_immutable_keys()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.party_id IS DISTINCT FROM OLD.party_id OR NEW.band_id IS DISTINCT FROM OLD.band_id THEN
    RAISE EXCEPTION 'party_band_memberships: party_id y band_id son inmutables.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pbm_immutable_keys
  BEFORE UPDATE ON party_band_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_pbm_immutable_keys();

-- Una sola membresía activa por (party, band). El histórico se guarda con active=false.
CREATE UNIQUE INDEX idx_pbm_one_active_per_band
  ON party_band_memberships(party_id, band_id)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX idx_pbm_party           ON party_band_memberships(party_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_pbm_band            ON party_band_memberships(band_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_pbm_active_party    ON party_band_memberships(party_id)  WHERE deleted_at IS NULL AND active = true;
CREATE INDEX idx_pbm_active_band     ON party_band_memberships(band_id)   WHERE deleted_at IS NULL AND active = true;

COMMENT ON TABLE party_band_memberships IS
  'Membresía party↔band con vigencia y nivel de confianza. Reemplaza el string natural_persons.current_band (que queda como denormalización del último band activo). Sensible por Ley 21.719 art. 16.';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('bands');
SELECT fn_audit_attach('party_addresses');
SELECT fn_audit_attach('party_documents');
SELECT fn_audit_attach('party_aliases');
SELECT fn_audit_attach('party_band_memberships');
