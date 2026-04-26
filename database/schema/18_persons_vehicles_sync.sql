-- =============================================================================
-- SURP 2.0 — schema/18_persons_vehicles_sync.sql
--
-- Cierra las olas persons/vehicles enrichment con triggers de sincronización
-- que mantienen las denormalizaciones coherentes con sus tablas con histórico.
--
-- Fuentes de verdad vs. denormalizaciones:
--
--   Fuente de verdad                 → Denormalización derivada
--   ---------------------------------------------------------------
--   party_aliases (active=true,       → natural_persons.current_alias
--                  más reciente por
--                  last_seen_at)
--
--   party_band_memberships            → natural_persons.current_band
--   (active=true, más reciente por      (string con bands.name)
--    last_observed_at) JOIN bands
--
--   vehicle_associated_parties        → vehicles.owner_party_id
--   (association_type='owner_current',
--    active=true)
--
-- Filosofía:
--   - La tabla con histórico es la fuente de verdad. La denormalización
--     se reescribe desde ella vía trigger AFTER. Cualquier UPDATE manual
--     a la denormalización vivirá hasta el próximo cambio en la fuente.
--   - El trigger es idempotente: si la denormalización ya coincide con lo
--     calculado, no genera UPDATE (evita ruido en audit_logs).
--   - Si la persona/vehículo no tiene fila en la tabla con histórico, la
--     denormalización se setea a NULL.
--   - Se respeta deleted_at en todas las queries.
-- =============================================================================


-- =============================================================================
-- 1. natural_persons.current_alias ← party_aliases más reciente activo
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_recalc_current_alias(p_party_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_new_alias VARCHAR(200);
  v_old_alias VARCHAR(200);
  v_party_type VARCHAR(30);
BEGIN
  -- Solo aplica a personas naturales.
  SELECT party_type INTO v_party_type FROM parties WHERE id = p_party_id;
  IF v_party_type IS DISTINCT FROM 'natural_person' THEN
    RETURN;
  END IF;

  SELECT alias INTO v_new_alias
  FROM party_aliases
  WHERE party_id = p_party_id
    AND active = true
    AND deleted_at IS NULL
  ORDER BY last_seen_at DESC, id DESC
  LIMIT 1;

  SELECT current_alias INTO v_old_alias
  FROM natural_persons WHERE party_id = p_party_id;

  IF v_new_alias IS DISTINCT FROM v_old_alias THEN
    UPDATE natural_persons
       SET current_alias = v_new_alias,
           updated_at = now()
     WHERE party_id = p_party_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_party_aliases_sync_natural_persons()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT / UPDATE: recalcular para el party afectado (NEW.party_id).
  -- DELETE no debería ocurrir (hard delete prohibido) pero se cubre por
  -- defensa.
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalc_current_alias(OLD.party_id);
    RETURN OLD;
  END IF;

  -- Si en UPDATE cambia party_id (lo cual no debería pasar, pero por
  -- robustez), recalcular ambos.
  IF TG_OP = 'UPDATE' AND NEW.party_id IS DISTINCT FROM OLD.party_id THEN
    PERFORM fn_recalc_current_alias(OLD.party_id);
  END IF;

  PERFORM fn_recalc_current_alias(NEW.party_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_aliases_sync_natural_persons
  AFTER INSERT OR UPDATE OR DELETE ON party_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_party_aliases_sync_natural_persons();

COMMENT ON FUNCTION fn_recalc_current_alias(BIGINT) IS
  'Recalcula natural_persons.current_alias desde party_aliases (active=true más reciente). Idempotente.';


-- =============================================================================
-- 2. natural_persons.current_band ← party_band_memberships activo más reciente
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_recalc_current_band(p_party_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_new_band VARCHAR(200);
  v_old_band VARCHAR(200);
  v_party_type VARCHAR(30);
BEGIN
  SELECT party_type INTO v_party_type FROM parties WHERE id = p_party_id;
  IF v_party_type IS DISTINCT FROM 'natural_person' THEN
    RETURN;
  END IF;

  SELECT b.name INTO v_new_band
  FROM party_band_memberships pbm
  JOIN bands b ON b.id = pbm.band_id
  WHERE pbm.party_id = p_party_id
    AND pbm.active = true
    AND pbm.deleted_at IS NULL
    AND b.deleted_at IS NULL
  ORDER BY pbm.last_observed_at DESC, pbm.id DESC
  LIMIT 1;

  SELECT current_band INTO v_old_band
  FROM natural_persons WHERE party_id = p_party_id;

  IF v_new_band IS DISTINCT FROM v_old_band THEN
    UPDATE natural_persons
       SET current_band = v_new_band,
           updated_at = now()
     WHERE party_id = p_party_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_party_band_memberships_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalc_current_band(OLD.party_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.party_id IS DISTINCT FROM OLD.party_id THEN
    PERFORM fn_recalc_current_band(OLD.party_id);
  END IF;

  PERFORM fn_recalc_current_band(NEW.party_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_band_memberships_sync
  AFTER INSERT OR UPDATE OR DELETE ON party_band_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_party_band_memberships_sync();

-- Si una banda cambia su `name`, los miembros con current_band activo en esa
-- banda deben reflejar el nuevo nombre. Trigger sobre bands.
CREATE OR REPLACE FUNCTION fn_bands_name_change_propagate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- Recalcular para todos los parties con membership activa en esta banda.
    PERFORM fn_recalc_current_band(pbm.party_id)
    FROM party_band_memberships pbm
    WHERE pbm.band_id = NEW.id AND pbm.active = true AND pbm.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bands_name_change_propagate
  AFTER UPDATE OF name ON bands
  FOR EACH ROW EXECUTE FUNCTION fn_bands_name_change_propagate();

COMMENT ON FUNCTION fn_recalc_current_band(BIGINT) IS
  'Recalcula natural_persons.current_band (string con bands.name) desde party_band_memberships activo más reciente. Idempotente.';


-- =============================================================================
-- 3. vehicles.owner_party_id ← vehicle_associated_parties.owner_current activo
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_recalc_vehicle_owner(p_vehicle_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_new_owner BIGINT;
  v_old_owner BIGINT;
BEGIN
  SELECT party_id INTO v_new_owner
  FROM vehicle_associated_parties
  WHERE vehicle_id = p_vehicle_id
    AND association_type = 'owner_current'
    AND active = true
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT owner_party_id INTO v_old_owner
  FROM vehicles WHERE id = p_vehicle_id;

  IF v_new_owner IS DISTINCT FROM v_old_owner THEN
    UPDATE vehicles
       SET owner_party_id = v_new_owner,
           updated_at = now()
     WHERE id = p_vehicle_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_vap_sync_vehicle_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.association_type = 'owner_current' THEN
      PERFORM fn_recalc_vehicle_owner(OLD.vehicle_id);
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT / UPDATE: solo recalcular si la fila es o fue 'owner_current'.
  IF NEW.association_type = 'owner_current'
     OR (TG_OP = 'UPDATE' AND OLD.association_type = 'owner_current') THEN
    PERFORM fn_recalc_vehicle_owner(NEW.vehicle_id);
  END IF;

  -- Si en UPDATE cambia vehicle_id de un owner_current (no debería, es
  -- inmutable, pero por defensa), recalcular ambos.
  IF TG_OP = 'UPDATE' AND NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     AND OLD.association_type = 'owner_current' THEN
    PERFORM fn_recalc_vehicle_owner(OLD.vehicle_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vap_sync_vehicle_owner
  AFTER INSERT OR UPDATE OR DELETE ON vehicle_associated_parties
  FOR EACH ROW EXECUTE FUNCTION fn_vap_sync_vehicle_owner();

COMMENT ON FUNCTION fn_recalc_vehicle_owner(BIGINT) IS
  'Recalcula vehicles.owner_party_id desde vehicle_associated_parties (association_type=owner_current y active=true). Idempotente.';


-- =============================================================================
-- 4. Backfill inicial — asegurar coherencia de filas pre-existentes
-- =============================================================================
-- Si ya hay datos en party_aliases / party_band_memberships /
-- vehicle_associated_parties cuando este schema se aplica, hay que recalcular
-- las denormalizaciones para que el estado actual quede consistente.

DO $$
DECLARE
  v_party_id BIGINT;
  v_vehicle_id BIGINT;
  v_aliases_synced INT := 0;
  v_bands_synced INT := 0;
  v_owners_synced INT := 0;
BEGIN
  -- Aliases: recalcular para todo party que tenga al menos una fila en party_aliases.
  FOR v_party_id IN
    SELECT DISTINCT party_id FROM party_aliases WHERE deleted_at IS NULL
  LOOP
    PERFORM fn_recalc_current_alias(v_party_id);
    v_aliases_synced := v_aliases_synced + 1;
  END LOOP;

  -- Bands: idem.
  FOR v_party_id IN
    SELECT DISTINCT party_id FROM party_band_memberships WHERE deleted_at IS NULL
  LOOP
    PERFORM fn_recalc_current_band(v_party_id);
    v_bands_synced := v_bands_synced + 1;
  END LOOP;

  -- Vehicle owners: recalcular para todo vehículo con asociación owner_current.
  FOR v_vehicle_id IN
    SELECT DISTINCT vehicle_id
    FROM vehicle_associated_parties
    WHERE association_type = 'owner_current' AND deleted_at IS NULL
  LOOP
    PERFORM fn_recalc_vehicle_owner(v_vehicle_id);
    v_owners_synced := v_owners_synced + 1;
  END LOOP;

  RAISE NOTICE 'schema/18 backfill — aliases parties=%, bands parties=%, vehicle owners=%',
    v_aliases_synced, v_bands_synced, v_owners_synced;
END;
$$;
