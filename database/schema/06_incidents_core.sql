-- =============================================================================
-- SURP 2.0 — 06_incidents_core.sql
--
-- CORE del sistema: el informe de incidente y todo lo que cuelga de él.
--
-- Tablas:
--   1. vehicles                            — flota propia + ajena, con o sin patente
--   2. (refresh) fn_blocks_check_target_exists para soportar target_type='vehicle'
--   3. incidents                           — el informe
--   4. incident_party_links                — N:M incidente ↔ persona con rol procesal y snapshot
--   5. incident_vehicle_links              — N:M incidente ↔ vehículo
--   6. assets_affected                     — bienes afectados de Arauco
--   7. assets_affected_timber_details      — extensión 1:1 cuando es madera
--   8. seized_means                        — medios incautados al sospechoso
--   9. incident_evidences                  — fotos / videos / audios / docs
--  10. incident_versions                   — versiones del informe (3 capas)
--
-- Invariantes (LEGAL-INVARIANTS-INCIDENTS.md + INCIDENT-CODE.md + memorias):
--   - correlative_code `{NN}-{YYYY}-Z{XX}` es asignado server-side al pasar
--     de `draft` a `active`. No se libera al anular. Es inmutable.
--   - location NOT NULL — fallback en cascada gps→predio→área→zona en aplicación.
--   - Snapshot de alias/banda/armado en incident_party_links es inmutable.
--   - Anular un incidente usa state='voided' (NO hard-delete).
--   - procedural_role es enum cerrado (no catálogo) — invariante de código.
--   - state machine SIMPLIFICADA por decisión de Iván Vuskovic / URP — solo
--     3 estados: `draft` (capturado offline en celular, pendiente de sync),
--     `active` (sincronizado, default operativo, equivalente al `Activo=true`
--     del legacy), `voided` (anulado con razón obligatoria, equivalente al
--     `Activo=false` del legacy pero auditado). Los estados intermedios
--     `submitted/under_review/closed/escalated` se eliminaron — el legacy
--     solo tenía `Activo bool` y los usuarios URP no usan workflow.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. vehicles — flota completa: identificados, no identificados, propios, ajenos.
--
-- Unifica `Vehiculo` y `VehiculoNI` del legacy. `license_plate` es NULL solo
-- cuando `not_identified=true` (vehículo visto sin patente legible).
-- -----------------------------------------------------------------------------

CREATE TABLE vehicles (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  vehicle_type_id             BIGINT REFERENCES vehicle_types(id),

  -- Patente canónica chilena. NULL si no_identified=true.
  license_plate               d_license_plate_cl,
  not_identified              BOOLEAN NOT NULL DEFAULT false,

  brand                       VARCHAR(80),
  model                       VARCHAR(80),
  year                        SMALLINT,
  color                       VARCHAR(40),

  -- Propietario actual. Puede ser persona natural o jurídica.
  -- NULL cuando se desconoce (típico para vehículos en investigación).
  owner_party_id              BIGINT REFERENCES parties(id),
  -- Indica si el dueño actual fue verificado vs. el RVM (Certificado del
  -- Registro Civil). El historial de propietarios se modela en archivo aparte
  -- cuando se implemente la verificación contra RVM.
  ownership_verified          BOOLEAN NOT NULL DEFAULT false,
  ownership_verified_at       TIMESTAMPTZ,

  observation                 TEXT,
  migrated_from_legacy_id     INT,                                   -- Vehiculo.VehiculoId o VehiculoNI.VehiculoNIId

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT vehicles_plate_consistency_ck CHECK (
    (not_identified = true  AND license_plate IS NULL)
    OR
    (not_identified = false AND license_plate IS NOT NULL)
  ),
  CONSTRAINT vehicles_year_range_ck CHECK (year IS NULL OR year BETWEEN 1900 AND 2100)
);

-- Patente única entre los identificados activos.
CREATE UNIQUE INDEX vehicles_license_plate_unique_active_ux
  ON vehicles (license_plate)
  WHERE license_plate IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX vehicles_owner_ix       ON vehicles (owner_party_id) WHERE owner_party_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX vehicles_type_ix        ON vehicles (vehicle_type_id) WHERE deleted_at IS NULL;
CREATE INDEX vehicles_unidentified_ix ON vehicles (not_identified) WHERE not_identified = true AND deleted_at IS NULL;

CREATE TRIGGER vehicles_touch_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE vehicles IS
  'Flota completa: identificados (con patente, casi siempre con dueño) y no identificados (vehículo visto en flagrancia sin patente legible). Unifica Vehiculo y VehiculoNI del legacy.';

-- -----------------------------------------------------------------------------
-- 2. Refrescar fn_blocks_check_target_exists para validar contra vehicles.
--
-- En 01_organizations_users_roles.sql el trigger lanzaba "tabla vehicles aún
-- no creada" cuando target_type='vehicle'. Ahora que existe, completamos la
-- verificación.
-- -----------------------------------------------------------------------------

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
    IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = NEW.target_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'blocks.target_id % no existe en vehicles (activa)', NEW.target_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. incidents — informe de incidente.
-- -----------------------------------------------------------------------------

CREATE TABLE incidents (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  -- Código correlativo `{NN}-{YYYY}-Z{XX}` denormalizado para búsqueda rápida.
  -- Asignado server-side al pasar de `draft` a `active` usando
  -- incident_sequences. NULL en estado `draft`.
  correlative_code            VARCHAR(20),
  correlative_number          INT,
  correlative_year            SMALLINT,

  -- Localización jerárquica.
  zone_id                     BIGINT NOT NULL REFERENCES zones(id),
  area_id                     BIGINT REFERENCES areas(id),
  property_id                 BIGINT REFERENCES properties(id),
  commune_id                  BIGINT REFERENCES communes(id),

  -- Tipificación.
  incident_type_id            BIGINT NOT NULL REFERENCES incident_types(id),
  operation_type_id           BIGINT REFERENCES operation_types(id),

  -- Fechas. occurred_at = cuándo pasó. detected_at = cuándo se detectó.
  -- reported_at = cuándo se ingresó en el celular. submitted_at = cuándo
  -- llegó al servidor (sync). El correlativo usa el AÑO de occurred_at.
  occurred_at                 TIMESTAMPTZ NOT NULL,
  detected_at                 TIMESTAMPTZ,
  reported_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at                TIMESTAMPTZ,

  -- Geo. Always NOT NULL — fallback gps→predio→área→zona resuelto en app.
  location                    geometry(Point, 4326) NOT NULL,
  location_source             VARCHAR(30) NOT NULL
    CHECK (location_source IN ('gps', 'property_centroid', 'area_centroid', 'zone_centroid', 'manual')),
  gps_accuracy_meters         NUMERIC(8, 2),

  -- Relato del campo (lo que vio el guardia / capturador). Curaduría URP +
  -- abogado se versiona en incident_versions.
  description                 TEXT NOT NULL,

  -- Semáforo URP — clasificación operativa interna.
  semaforo                    VARCHAR(20) NOT NULL DEFAULT 'no_determinado'
    CHECK (semaforo IN ('no_determinado', 'verde', 'amarillo', 'rojo')),
  semaforo_set_at             TIMESTAMPTZ,
  semaforo_set_by_user_id     BIGINT REFERENCES users(id),

  -- State machine simplificada (decisión URP — ver header del archivo).
  --   draft   → captura offline en celular, pendiente de sincronizar
  --   active  → operativo (default tras sync, ≈ Activo=true del legacy)
  --   voided  → anulado con razón (≈ Activo=false del legacy, con auditoría)
  state                       VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'active', 'voided')),
  state_changed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Modelo dominio forestal.
  -- 'extracted' (madera retirada del predio) | 'felled_only' (talada y
  -- abandonada — daños) | 'partially_extracted' | 'unknown'.
  timber_fate                 VARCHAR(30)
    CHECK (timber_fate IS NULL OR timber_fate IN ('extracted', 'felled_only', 'partially_extracted', 'unknown')),

  -- Catálogo cerrado de agravantes (LEGAL-INVARIANTS §8.3). JSONB array de
  -- códigos: ['motorized_vehicle_used', 'chainsaw_used', 'multiple_offenders'].
  aggravating_factors         JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Quién y cómo se ingresó.
  created_by_organization_id  BIGINT NOT NULL REFERENCES organizations(id),
  captured_by_user_id         BIGINT NOT NULL REFERENCES users(id),
  -- Sesión de captura móvil (correlaciona varias capturas del mismo guardia
  -- en la misma sesión). Permite detectar duplicados/sincronizaciones tardías.
  offline_session_id          UUID,
  offline_synced_at           TIMESTAMPTZ,

  -- Anulación (no libera correlativo).
  voided_at                   TIMESTAMPTZ,
  voided_by_user_id           BIGINT REFERENCES users(id),
  void_reason                 TEXT,

  migrated_from_legacy_id     INT,

  -- Auditoría.
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ,

  -- Invariantes estructurales.
  CONSTRAINT incidents_chile_bbox_ck CHECK (
    -- Punto debe estar en el bounding box de Chile (incluye territorio antártico).
    -- lat -90 a -17 (norte de Arica) | lng -110 a -66 (incluye Pascua).
    ST_X(location) BETWEEN -110 AND -66
    AND ST_Y(location) BETWEEN -90 AND -17
  ),
  CONSTRAINT incidents_correlative_consistency_ck CHECK (
    -- O todo está NULL (draft) o todo está seteado (submitted+).
    (correlative_code IS NULL AND correlative_number IS NULL AND correlative_year IS NULL)
    OR
    (correlative_code IS NOT NULL AND correlative_number IS NOT NULL AND correlative_year IS NOT NULL)
  ),
  CONSTRAINT incidents_correlative_year_range_ck CHECK (
    correlative_year IS NULL OR correlative_year BETWEEN 2000 AND 2099
  ),
  CONSTRAINT incidents_void_consistency_ck CHECK (
    -- Si state='voided', deben estar voided_at/by/reason. Si no, deben ser NULL.
    (state = 'voided' AND voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL)
    OR
    (state <> 'voided' AND voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
  ),
  CONSTRAINT incidents_active_has_correlative_ck CHECK (
    -- En state distinto de draft (es decir active o voided) debe haber correlative_code.
    state = 'draft' OR correlative_code IS NOT NULL
  ),
  CONSTRAINT incidents_semaforo_consistency_ck CHECK (
    -- Si semaforo está seteado a algo distinto de no_determinado, debe haber
    -- registro de quién y cuándo.
    semaforo = 'no_determinado'
    OR
    (semaforo_set_at IS NOT NULL AND semaforo_set_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX incidents_correlative_code_ux
  ON incidents (correlative_code)
  WHERE correlative_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX incidents_zone_year_ix       ON incidents (zone_id, correlative_year) WHERE deleted_at IS NULL;
CREATE INDEX incidents_zone_ix            ON incidents (zone_id)         WHERE deleted_at IS NULL;
CREATE INDEX incidents_property_ix        ON incidents (property_id)     WHERE property_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX incidents_type_ix            ON incidents (incident_type_id) WHERE deleted_at IS NULL;
CREATE INDEX incidents_state_ix           ON incidents (state)           WHERE deleted_at IS NULL;
CREATE INDEX incidents_occurred_at_ix     ON incidents (occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX incidents_location_gix       ON incidents USING GIST (location);
CREATE INDEX incidents_captured_by_ix     ON incidents (captured_by_user_id) WHERE deleted_at IS NULL;
CREATE INDEX incidents_offline_session_ix ON incidents (offline_session_id) WHERE offline_session_id IS NOT NULL;

CREATE TRIGGER incidents_touch_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE incidents IS
  'Informe de incidente — core del sistema. correlative_code asignado server-side al pasar de draft a submitted; nunca se libera al anular.';
COMMENT ON COLUMN incidents.location_source IS
  'Origen de la coordenada: gps directo, fallback al centroide del predio/área/zona, o ingreso manual. Nunca debe quedar NULL si el incidente fue capturado.';
COMMENT ON COLUMN incidents.aggravating_factors IS
  'Array JSONB de códigos del catálogo cerrado: motorized_vehicle_used, chainsaw_used, crane_used, multiple_offenders, fence_breach, animal_rustling, possible_organized_crime.';

-- -----------------------------------------------------------------------------
-- 4. Trigger: bloquear cambios al correlative_code una vez asignado.
-- (No bloqueamos la asignación inicial NULL → valor; sí bloqueamos cualquier
-- mutación posterior incluido NULL después de set.)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_incidents_correlative_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.correlative_code IS NOT NULL AND NEW.correlative_code IS DISTINCT FROM OLD.correlative_code THEN
    RAISE EXCEPTION 'incidents.correlative_code es inmutable una vez asignado (% intento %→%)', OLD.id, OLD.correlative_code, NEW.correlative_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.correlative_number IS NOT NULL AND NEW.correlative_number IS DISTINCT FROM OLD.correlative_number THEN
    RAISE EXCEPTION 'incidents.correlative_number es inmutable una vez asignado'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.correlative_year IS NOT NULL AND NEW.correlative_year IS DISTINCT FROM OLD.correlative_year THEN
    RAISE EXCEPTION 'incidents.correlative_year es inmutable una vez asignado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incidents_correlative_immutable_tg
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION fn_incidents_correlative_immutable();

-- -----------------------------------------------------------------------------
-- 5. Trigger: prohibir hard-delete sobre incidentes con correlativo asignado
-- (rompería el invariante de correlativos sin brechas dentro de zona+año).
-- Solo `draft` permite hard-delete; `active` y `voided` deben pasar por
-- soft-delete o anulación.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_incidents_no_hard_delete_post_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state <> 'draft' THEN
    RAISE EXCEPTION 'incidents % está en estado %; usa state=voided para anularlo (no hard-delete)', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER incidents_no_hard_delete_tg
  BEFORE DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION fn_incidents_no_hard_delete_post_active();

-- -----------------------------------------------------------------------------
-- 6. incident_party_links — N:M con rol procesal y snapshot.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_party_links (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- party_id puede ser NULL para querella contra incertus (LEGAL-INVARIANTS §2).
  party_id                    BIGINT REFERENCES parties(id),

  -- Rol procesal (enum cerrado, invariante de código). Ver LEGAL-INVARIANTS §1.
  procedural_role             VARCHAR(40) NOT NULL
    CHECK (procedural_role IN (
      'denounced', 'complained_against', 'suspect',
      'formalized_defendant', 'accused',
      'convicted', 'acquitted',
      'witness', 'victim', 'informant'
    )),

  -- Rol operativo del catálogo (denunciante, testigo, conductor, ocupante).
  -- Distinto de procedural_role: una persona puede ser "Denunciante"
  -- (operativo) y "victim" (procesal) a la vez.
  operational_role_id         BIGINT REFERENCES incident_person_roles(id),

  -- Para querellas contra incertus.
  unidentified_description    TEXT,
  identification_pending      BOOLEAN NOT NULL DEFAULT false,

  -- Snapshot inmutable al momento del informe.
  snapshot_alias              VARCHAR(200),
  snapshot_band               VARCHAR(200),
  snapshot_armed              BOOLEAN,

  -- Contacto al momento del informe (para roles que requieren contacto:
  -- denunciante, testigo, víctima dispuesta a colaborar).
  contact_phone               d_phone_cl,
  contact_email               d_email,

  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT incident_party_links_identification_consistency_ck CHECK (
    -- Si está pendiente de identificar, debe haber descripción y NO party.
    (identification_pending = true  AND party_id IS NULL     AND unidentified_description IS NOT NULL)
    OR
    -- Si está identificado, debe haber party_id (descripción opcional).
    (identification_pending = false AND party_id IS NOT NULL)
  ),
  -- No permitir el mismo procedural_role del mismo party en el mismo incidente.
  -- (Una persona puede ser victim+witness en mismo incidente — distinto rol.)
  CONSTRAINT incident_party_links_unique_party_role_per_incident
    UNIQUE (incident_id, party_id, procedural_role) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX incident_party_links_incident_ix
  ON incident_party_links (incident_id)
  WHERE deleted_at IS NULL;
CREATE INDEX incident_party_links_party_ix
  ON incident_party_links (party_id)
  WHERE party_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX incident_party_links_role_ix
  ON incident_party_links (procedural_role)
  WHERE deleted_at IS NULL;
CREATE INDEX incident_party_links_pending_ix
  ON incident_party_links (incident_id)
  WHERE identification_pending = true AND deleted_at IS NULL;

CREATE TRIGGER incident_party_links_touch_updated_at
  BEFORE UPDATE ON incident_party_links
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6.bis Trigger: snapshot_alias/snapshot_band/snapshot_armed son INMUTABLES
-- una vez seteados. parties.current_* mutan; el snapshot del incidente NO.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_incident_party_links_snapshot_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.snapshot_alias IS NOT NULL AND NEW.snapshot_alias IS DISTINCT FROM OLD.snapshot_alias THEN
    RAISE EXCEPTION 'snapshot_alias es inmutable (incident_party_link %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.snapshot_band IS NOT NULL AND NEW.snapshot_band IS DISTINCT FROM OLD.snapshot_band THEN
    RAISE EXCEPTION 'snapshot_band es inmutable (incident_party_link %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.snapshot_armed IS NOT NULL AND NEW.snapshot_armed IS DISTINCT FROM OLD.snapshot_armed THEN
    RAISE EXCEPTION 'snapshot_armed es inmutable (incident_party_link %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incident_party_links_snapshot_immutable_tg
  BEFORE UPDATE ON incident_party_links
  FOR EACH ROW EXECUTE FUNCTION fn_incident_party_links_snapshot_immutable();

-- -----------------------------------------------------------------------------
-- 7. incident_vehicle_links — N:M incidente ↔ vehículo.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_vehicle_links (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  vehicle_id                  BIGINT NOT NULL REFERENCES vehicles(id),

  -- Rol del vehículo en el incidente.
  role                        VARCHAR(30) NOT NULL
    CHECK (role IN ('used_by_offender', 'arauco_property_affected', 'witness_vehicle', 'transport_evidence', 'other')),

  -- Patente observada (puede diferir de vehicles.license_plate si fue
  -- alterada — registro forense).
  observed_plate              VARCHAR(10),
  -- Snapshot del estado del vehículo al momento del incidente (cargado,
  -- vacío, dañado, etc.).
  observed_state              TEXT,

  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT incident_vehicle_links_unique_per_role
    UNIQUE (incident_id, vehicle_id, role) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX incident_vehicle_links_incident_ix
  ON incident_vehicle_links (incident_id) WHERE deleted_at IS NULL;
CREATE INDEX incident_vehicle_links_vehicle_ix
  ON incident_vehicle_links (vehicle_id) WHERE deleted_at IS NULL;

CREATE TRIGGER incident_vehicle_links_touch_updated_at
  BEFORE UPDATE ON incident_vehicle_links
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 8. assets_affected — bienes afectados de Arauco (patrimoniales).
-- NO confundir con seized_means (medios incautados al sospechoso).
-- -----------------------------------------------------------------------------

CREATE TABLE assets_affected (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  asset_type_id               BIGINT NOT NULL REFERENCES asset_types(id),

  description                 TEXT,
  quantity                    NUMERIC(14, 4),
  unit                        VARCHAR(20),                       -- m3, ton, ha, unidades, kg, etc.

  estimated_value_clp         NUMERIC(14, 2),
  recovery_status             VARCHAR(20) NOT NULL DEFAULT 'unknown'
    CHECK (recovery_status IN ('not_recovered', 'partial', 'full', 'unknown')),
  recovered_value_clp         NUMERIC(14, 2),
  recovery_notes              TEXT,

  -- Localización dentro del predio (referencia textual; el location del
  -- incidente cubre la coordenada principal).
  location_within_property    TEXT,

  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT assets_affected_recovery_consistency_ck CHECK (
    -- Solo `full` exige recovered_value_clp (si se recuperó todo, debe haber
    -- monto). `partial` permite NULL porque al reportar inicialmente puede
    -- no conocerse el monto exacto. `not_recovered`/`unknown` no exigen monto.
    recovery_status <> 'full' OR recovered_value_clp IS NOT NULL
  )
);

CREATE INDEX assets_affected_incident_ix
  ON assets_affected (incident_id) WHERE deleted_at IS NULL;
CREATE INDEX assets_affected_type_ix
  ON assets_affected (asset_type_id) WHERE deleted_at IS NULL;

CREATE TRIGGER assets_affected_touch_updated_at
  BEFORE UPDATE ON assets_affected
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE assets_affected IS
  'Bienes patrimoniales de Arauco afectados (madera robada/derribada, maquinaria, infraestructura). NO confundir con seized_means (medios incautados al sospechoso por Arauco/policía).';

-- -----------------------------------------------------------------------------
-- 9. assets_affected_timber_details — extensión 1:1 cuando el activo es madera.
-- -----------------------------------------------------------------------------

CREATE TABLE assets_affected_timber_details (
  asset_affected_id           BIGINT PRIMARY KEY REFERENCES assets_affected(id) ON DELETE CASCADE,

  tree_species_id             BIGINT REFERENCES tree_species(id),
  wood_condition_id           BIGINT REFERENCES wood_conditions(id),
  wood_state_id               BIGINT REFERENCES wood_states(id),
  wood_storage_type_id        BIGINT REFERENCES wood_storage_types(id),

  volume_m3                   NUMERIC(12, 4),
  felled_trees_count          INT,
  -- Marcador agravante interno URP (Persona.DonacionMadera del legacy es
  -- a nivel persona; aquí lo capturamos a nivel de bien para informes
  -- donde el agravante aplica al hecho específico).
  timber_donation_aggravant   BOOLEAN NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id)
);

CREATE TRIGGER assets_affected_timber_details_touch_updated_at
  BEFORE UPDATE ON assets_affected_timber_details
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 10. seized_means — medios incautados al sospechoso (NO de Arauco).
-- -----------------------------------------------------------------------------

CREATE TABLE seized_means (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- Texto libre — la herramienta/objeto incautado puede no calzar con un
  -- catálogo (motosierra Stihl MS291, machete sin marca, etc.).
  description                 TEXT NOT NULL,
  seized_quantity             INT NOT NULL DEFAULT 1 CHECK (seized_quantity > 0),

  seizure_reason_id           BIGINT NOT NULL REFERENCES seizure_reasons(id),
  seized_at                   TIMESTAMPTZ NOT NULL,

  -- Cadena de custodia (CPP arts. 187+).
  chain_of_custody_required   BOOLEAN NOT NULL DEFAULT true,
  delivered_to_institution_id BIGINT REFERENCES institutions(id),
  delivered_at                TIMESTAMPTZ,
  delivery_receipt_number     VARCHAR(80),

  observation                 TEXT,
  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT seized_means_delivery_consistency_ck CHECK (
    -- Si delivered_to_institution_id está, deben estar delivered_at y receipt.
    (delivered_to_institution_id IS NULL AND delivered_at IS NULL AND delivery_receipt_number IS NULL)
    OR
    (delivered_to_institution_id IS NOT NULL AND delivered_at IS NOT NULL)
  )
);

CREATE INDEX seized_means_incident_ix
  ON seized_means (incident_id) WHERE deleted_at IS NULL;
CREATE INDEX seized_means_pending_delivery_ix
  ON seized_means (incident_id)
  WHERE chain_of_custody_required = true AND delivered_to_institution_id IS NULL AND deleted_at IS NULL;

CREATE TRIGGER seized_means_touch_updated_at
  BEFORE UPDATE ON seized_means
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMENT ON TABLE seized_means IS
  'Medios incautados al sospechoso (motosierras, machetes, vehículos retenidos, etc.). description es texto libre — los medios reales no calzan con un catálogo. Cadena de custodia obligatoria por defecto (CPP 187+).';

-- -----------------------------------------------------------------------------
-- 11. incident_evidences — evidencia digital. El binario vive en blob storage.
-- -----------------------------------------------------------------------------

CREATE TABLE incident_evidences (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  evidence_type               VARCHAR(20) NOT NULL
    CHECK (evidence_type IN ('photo', 'video', 'audio', 'document')),

  -- Referencia opaca al storage backend (driver/container/key). El driver
  -- (local/azure) vive en config; aquí solo el path lógico.
  storage_uri                 TEXT NOT NULL,
  mime_type                   VARCHAR(80) NOT NULL,
  size_bytes                  BIGINT NOT NULL CHECK (size_bytes > 0),
  -- Hash SHA-256 hex en minúsculas (64 chars).
  sha256_hash                 CHAR(64) NOT NULL CHECK (sha256_hash ~ '^[0-9a-f]{64}$'),

  captured_at                 TIMESTAMPTZ,
  captured_by_user_id         BIGINT REFERENCES users(id),

  -- Geolocalización extraída del EXIF (cuando aplica).
  gps_lat                     NUMERIC(10, 7),
  gps_lng                     NUMERIC(10, 7),
  gps_accuracy_meters         NUMERIC(8, 2),
  -- Coordenada calculada — STORED para indexar GIST.
  location                    geometry(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN gps_lat IS NOT NULL AND gps_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(gps_lng, gps_lat), 4326)
      END
    ) STORED,

  exif_metadata               JSONB,
  description                 TEXT,
  -- Marcador para reportería: si es la "foto principal" del informe.
  is_primary                  BOOLEAN NOT NULL DEFAULT false,

  migrated_from_legacy_id     INT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id               BIGINT REFERENCES users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id               BIGINT REFERENCES users(id),
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX incident_evidences_incident_ix
  ON incident_evidences (incident_id) WHERE deleted_at IS NULL;
CREATE INDEX incident_evidences_type_ix
  ON incident_evidences (incident_id, evidence_type) WHERE deleted_at IS NULL;
CREATE INDEX incident_evidences_location_gix
  ON incident_evidences USING GIST (location) WHERE location IS NOT NULL;
CREATE UNIQUE INDEX incident_evidences_one_primary_per_incident_ux
  ON incident_evidences (incident_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE TRIGGER incident_evidences_touch_updated_at
  BEFORE UPDATE ON incident_evidences
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 12. incident_versions — versiones del informe (3 capas: guardia, URP, abogado).
-- -----------------------------------------------------------------------------

CREATE TABLE incident_versions (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  incident_id                 BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- Correlativo dentro del incidente: 1, 2, 3, ...
  version_number              INT NOT NULL CHECK (version_number > 0),

  -- Capa que generó la versión.
  version_layer               VARCHAR(30) NOT NULL
    CHECK (version_layer IN ('guard_initial', 'urp_review', 'lawyer_review', 'admin_correction')),

  changes_summary             TEXT,
  -- Snapshot completo de campos relevantes del incident en este momento.
  -- Estructura libre (JSONB) — la app decide qué incluir.
  snapshot_data               JSONB NOT NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id          BIGINT NOT NULL REFERENCES users(id),

  CONSTRAINT incident_versions_unique_per_incident UNIQUE (incident_id, version_number)
);

CREATE INDEX incident_versions_incident_ix
  ON incident_versions (incident_id, version_number DESC);
CREATE INDEX incident_versions_layer_ix
  ON incident_versions (version_layer);

COMMENT ON TABLE incident_versions IS
  'Versiones del informe. Append-only: una nueva versión nace cuando guardia/URP/abogado modifica el informe. snapshot_data es el contenido congelado en JSONB.';

-- -----------------------------------------------------------------------------
-- 13. Conectar auditoría a las nuevas tablas.
-- (incident_versions queda fuera porque ya es append-only y ES la auditoría
-- semántica del informe; assets_affected_timber_details usa asset_affected_id
-- como PK.)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_table  TEXT;
  v_tables TEXT[] := ARRAY[
    'vehicles',
    'incidents',
    'incident_party_links',
    'incident_vehicle_links',
    'assets_affected',
    'seized_means',
    'incident_evidences'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    PERFORM fn_audit_attach(v_table);
  END LOOP;
  -- Extensión 1:1 con PK no-`id`.
  PERFORM fn_audit_attach('assets_affected_timber_details', 'asset_affected_id');
END;
$$;
