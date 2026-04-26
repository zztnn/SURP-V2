-- =============================================================================
-- SURP 2.0 — 04_catalog.sql
--
-- Catálogos del sistema editables por el Administrador.
--
-- Regla #6 de CLAUDE.md: "No hardcodear valores de dominio". Todo lo que es
-- configuración del negocio (tipos de incidente, instituciones, especies
-- madereras, etc.) vive en BD; el código consulta por código estable.
--
-- Convención del archivo:
--   - Cada catálogo lleva: id, external_id, code (clave estable), name (display),
--     description, is_system (true para seeds protegidos), active, order_index
--     y auditoría estándar.
--   - `code` es snake_case en MAYÚSCULAS para constantes técnicas (`THEFT_TIMBER`)
--     o snake_case minúsculas para identificadores naturales (`pinus_radiata`),
--     a criterio del catálogo. Lo que importa: estabilidad y unicidad.
--   - `is_system=true` ⇒ no se puede borrar; renombrar `name` está OK.
--
-- Notas de scope:
--   - Los enums duros (`procedural_role`, `case_state`, `party_type`,
--     `organization.type`) NO van aquí: son invariantes de código.
--   - Catálogos para módulos no-MVP (suggestion rules, MAAT, fires) viven
--     en sus propios archivos cuando se implementen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. incident_types — Tipo de incidente.
--
-- Origen legacy: `TipoIncidente`. Cada incidente lleva un tipo principal y
-- (opcionalmente) sub-tipos. La tipificación penal sugerida se calcula con el
-- motor `rules` cruzando `incident_types.default_legal_articles` con los
-- atributos del incidente — el motor sugiere, nunca decide.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_types (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- Categoría macro para reportería: 'property_crime', 'land_occupation',
  -- 'fire', 'wildlife', 'infrastructure', 'other'.
  category                    VARCHAR(40)  NOT NULL,

  -- Artículos del CP/leyes especiales que típicamente aplican. Lista cerrada:
  -- el motor de sugerencias mostrará estos al usuario para que el abogado
  -- confirme o cambie. Estructura: [{ "law": "CP", "article": "443", "note": "..." }].
  default_legal_articles      JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- Si el evento típicamente involucra madera (activa preguntas de especie,
  -- volumen, condición, etc. en el formulario).
  involves_timber             BOOLEAN      NOT NULL DEFAULT false,
  -- Si el evento es una toma/usurpación (activa flujos Ley 21.633).
  involves_land_occupation    BOOLEAN      NOT NULL DEFAULT false,
  -- Si el evento es un incendio (activa flujos del módulo `fires`).
  involves_fire               BOOLEAN      NOT NULL DEFAULT false,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX incident_types_active_ix    ON incident_types (active)    WHERE deleted_at IS NULL;
CREATE INDEX incident_types_category_ix  ON incident_types (category)  WHERE deleted_at IS NULL;
CREATE TRIGGER incident_types_touch_updated_at
  BEFORE UPDATE ON incident_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON COLUMN incident_types.default_legal_articles IS
  'Artículos del CP / leyes especiales que el motor de sugerencias propondrá al tipificar. El abogado confirma. Esquema: [{"law":"CP","article":"443","note":"..."}].';

-- -----------------------------------------------------------------------------
-- 2. incident_person_roles — Rol operativo de la persona en el incidente.
--
-- Distinto del `procedural_role` de causas (que es enum de código). Aquí van
-- los roles del informe del incidente: Denunciante, Testigo, Víctima,
-- Conductor, Ocupante, Trabajador afectado, Etc.
-- El "Denunciado/Imputado" del legacy se modela por `procedural_role` en la
-- tabla pivote incident_party_links (ver módulo de incidentes), no aquí.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_person_roles (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- Si el rol exige campos de contacto (Denunciante típicamente sí; Testigo
  -- depende). El módulo de incidentes valida con esta bandera.
  requires_contact_info       BOOLEAN      NOT NULL DEFAULT false,
  -- Si el rol exige que la persona tenga RUT chileno (algunos no — testigo
  -- extranjero, por ejemplo).
  requires_rut                BOOLEAN      NOT NULL DEFAULT false,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX incident_person_roles_active_ix
  ON incident_person_roles (active)
  WHERE deleted_at IS NULL;

CREATE TRIGGER incident_person_roles_touch_updated_at
  BEFORE UPDATE ON incident_person_roles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. asset_types — Tipo de bien afectado del patrimonio Arauco.
--
-- "Bienes afectados" del legacy: madera, maquinaria, infraestructura, vehículos
-- de Arauco, etc. NO confundir con "medios incautados" (tabla aparte en módulo
-- incidentes — son bienes del sospechoso retenidos por Arauco/policía).
-- -----------------------------------------------------------------------------

CREATE TABLE asset_types (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- 'timber', 'machinery', 'infrastructure', 'vehicle', 'other'.
  category                    VARCHAR(40)  NOT NULL,
  -- Unidad de medida default para valuación (m3, ton, ha, unidades, kg, etc.).
  default_unit                VARCHAR(20),
  -- Bandera: si se valoriza típicamente (todos los bienes afectados de Arauco
  -- se valorizan; en raros casos donde no aplica → false).
  requires_valuation          BOOLEAN      NOT NULL DEFAULT true,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX asset_types_active_ix
  ON asset_types (active)
  WHERE deleted_at IS NULL;

CREATE TRIGGER asset_types_touch_updated_at
  BEFORE UPDATE ON asset_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. vehicle_types — Tipo de vehículo (camión, camioneta, moto, etc.).
-- Aplica a `vehicles` (creado en archivo posterior).
-- -----------------------------------------------------------------------------

CREATE TABLE vehicle_types (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- Categoría macro: 'truck', 'pickup', 'car', 'motorcycle', 'machinery', 'other'.
  category                    VARCHAR(40)  NOT NULL,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER vehicle_types_touch_updated_at
  BEFORE UPDATE ON vehicle_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5. institutions — Carabineros, PDI, Fiscalía, Tribunales, CONAF, Bomberos,
-- LABOCAR, Servicio Médico Legal, etc. Cada denuncia/causa puede vincular una
-- o varias.
-- -----------------------------------------------------------------------------

CREATE TABLE institutions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(200) NOT NULL,
  short_name                  VARCHAR(50),

  -- Tipo de institución (define visibilidad en formularios del módulo
  -- complaints/cases): 'police', 'prosecutor', 'court', 'forestry_authority',
  -- 'fire_department', 'medical_legal', 'other'.
  institution_type            VARCHAR(40)  NOT NULL,

  -- Geografía opcional (cuartel territorial, fiscalía local, tribunal con
  -- competencia, etc.).
  region_id                   BIGINT REFERENCES regions(id),
  commune_id                  BIGINT REFERENCES communes(id),
  address                     TEXT,
  phone                       d_phone_cl,
  email                       d_email,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX institutions_type_ix
  ON institutions (institution_type)
  WHERE deleted_at IS NULL;
CREATE INDEX institutions_commune_ix
  ON institutions (commune_id)
  WHERE deleted_at IS NULL AND commune_id IS NOT NULL;

CREATE TRIGGER institutions_touch_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. tree_species — Especies forestales relevantes (pino, eucalipto, nativas).
-- Usado en bienes afectados cuando el activo es madera.
-- -----------------------------------------------------------------------------

CREATE TABLE tree_species (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,        -- 'pinus_radiata', 'eucalyptus_globulus', 'nothofagus_obliqua'
  common_name                 VARCHAR(150) NOT NULL,                -- 'Pino radiata', 'Eucalipto', 'Roble'
  scientific_name             VARCHAR(200),                          -- 'Pinus radiata D.Don'
  description                 TEXT,

  -- 'exotic_plantation' (pino/eucalipto), 'native', 'other'.
  origin_category             VARCHAR(40)  NOT NULL DEFAULT 'other',
  -- Indicador de protección legal especial (Ley 20.283 + DS 68 — listado
  -- oficial de especies en categoría de conservación).
  protected_status            VARCHAR(40),                           -- 'extinct', 'endangered', 'vulnerable', 'rare', 'minor_concern', null

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX tree_species_origin_ix
  ON tree_species (origin_category)
  WHERE deleted_at IS NULL;
CREATE INDEX tree_species_protected_ix
  ON tree_species (protected_status)
  WHERE protected_status IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER tree_species_touch_updated_at
  BEFORE UPDATE ON tree_species
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 7. wood_conditions — Estado físico de la madera (CondicionMadera legacy).
-- 'En troza', 'dimensionada', 'leña', 'astillas', etc.
-- -----------------------------------------------------------------------------

CREATE TABLE wood_conditions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER wood_conditions_touch_updated_at
  BEFORE UPDATE ON wood_conditions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 8. wood_states — Estado de recuperación de la madera (EstadoMadera legacy).
-- 'recuperada total', 'recuperada parcial', 'no recuperada', 'no determinado'.
-- -----------------------------------------------------------------------------

CREATE TABLE wood_states (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- Indicador para reportería: porcentaje de recuperación implícito.
  recovery_indicator          VARCHAR(20)
    CHECK (recovery_indicator IS NULL OR recovery_indicator IN ('full', 'partial', 'none', 'unknown')),

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER wood_states_touch_updated_at
  BEFORE UPDATE ON wood_states
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 9. wood_storage_types — Tipo de acopio (AcopioMadera legacy).
-- 'cancha', 'camion', 'patio_aserradero', 'sin_acopio', etc.
-- -----------------------------------------------------------------------------

CREATE TABLE wood_storage_types (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER wood_storage_types_touch_updated_at
  BEFORE UPDATE ON wood_storage_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 10. operation_types — Faena forestal (Faena legacy).
-- 'cosecha', 'raleo', 'plantacion', 'poda', 'caminos', etc.
-- Se usa para contextualizar el incidente: una intrusión durante una faena de
-- cosecha tiene implicancias distintas a una en un predio en barbecho.
-- -----------------------------------------------------------------------------

CREATE TABLE operation_types (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER operation_types_touch_updated_at
  BEFORE UPDATE ON operation_types
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 11. seizure_reasons — Motivos de incautación de medios al sospechoso.
-- Aplica a "medios incautados" del módulo incidentes (NO a bienes afectados).
-- 'flagrancia', 'hallazgo_en_predio', 'entrega_voluntaria', 'orden_judicial', etc.
-- -----------------------------------------------------------------------------

CREATE TABLE seizure_reasons (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  code                        VARCHAR(50)  UNIQUE NOT NULL,
  name                        VARCHAR(150) NOT NULL,
  description                 TEXT,

  -- Si aplica el régimen de cadena de custodia obligatoria (CPP arts. 187+).
  requires_chain_of_custody   BOOLEAN      NOT NULL DEFAULT true,

  is_system                   BOOLEAN      NOT NULL DEFAULT false,
  active                      BOOLEAN      NOT NULL DEFAULT true,
  order_index                 INT          NOT NULL DEFAULT 100,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ
);

CREATE TRIGGER seizure_reasons_touch_updated_at
  BEFORE UPDATE ON seizure_reasons
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 12. fn_protect_system_catalog_rows — guard contra borrado de filas is_system.
--
-- Aplica a TODOS los catálogos arriba. Renombrar `name` está permitido; borrar
-- una fila is_system=true no.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_protect_system_catalog_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system = true THEN
      RAISE EXCEPTION '% % es is_system=true; no se puede borrar', TG_TABLE_NAME, OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: bloquear cambio de `code` o `is_system` en filas is_system.
  IF OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION '% %: is_system no puede pasar de true a false', TG_TABLE_NAME, OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.is_system = true AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION '% %: code es inmutable cuando is_system=true', TG_TABLE_NAME, OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Aplica el guard a cada catálogo. Este loop dinámico evita duplicar 11 CREATE
-- TRIGGER idénticos.
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'incident_types',
    'incident_person_roles',
    'asset_types',
    'vehicle_types',
    'institutions',
    'tree_species',
    'wood_conditions',
    'wood_states',
    'wood_storage_types',
    'operation_types',
    'seizure_reasons'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_protect_system_rows
         BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_protect_system_catalog_rows();',
      v_table, v_table
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_protect_system_catalog_rows() IS
  'Trigger compartido: bloquea borrado de filas is_system=true y bloquea cambio de code/is_system en esas filas. Aplicado a los 11 catálogos del archivo 04.';
