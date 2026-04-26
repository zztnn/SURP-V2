-- =============================================================================
-- SURP 2.0 — seed/08_courts_prosecutor_offices.sql
--
-- Stub mínimo de tribunales y fiscalías para las 4 regiones operativas de
-- Arauco URP: Maule, Ñuble, Biobío, Araucanía.
--
-- Este archivo es un PUNTO DE PARTIDA, NO el catálogo definitivo. Falta:
--   - Confirmar lista exacta con workshop URP (qué tribunales/fiscalías
--     visitan más frecuentemente).
--   - Implementar worker BullMQ sync-pjud-courts y sync-prosecutor-offices
--     que importe el catálogo oficial de PJUD/Ministerio Público (post-MVP).
--
-- Política de carga (CASES-MODULE-VISION.md §3.2):
--   - Estos registros se marcan is_normalized=true e is_system=true porque
--     el SURP los considera autoritativos. El usuario puede agregar más
--     on-the-fly (is_normalized=false, is_system=false) y el Abogado
--     Administrador los normaliza después.
--
-- Idempotente: filtros con NOT EXISTS para no duplicar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Courts — al menos un Juzgado de Garantía y un Tribunal Oral por región
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_admin BIGINT;
BEGIN
  SELECT id INTO v_admin FROM users WHERE email = 'jquiero@softe.cl';

  -- ----- Maule (CL-ML) -----
  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Talca', 'juzgado_garantia', 'CL-ML', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de talca');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Tribunal de Juicio Oral en lo Penal de Talca', 'tribunal_oral_penal', 'CL-ML', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'tribunal de juicio oral en lo penal de talca');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Corte de Apelaciones de Talca', 'corte_apelaciones', 'CL-ML', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'corte de apelaciones de talca');

  -- ----- Ñuble (CL-NB) -----
  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Chillán', 'juzgado_garantia', 'CL-NB', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de chillan');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Tribunal de Juicio Oral en lo Penal de Chillán', 'tribunal_oral_penal', 'CL-NB', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'tribunal de juicio oral en lo penal de chillan');

  -- ----- Biobío (CL-BI) -----
  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Concepción', 'juzgado_garantia', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de concepcion');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Cañete', 'juzgado_garantia', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de canete');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Los Ángeles', 'juzgado_garantia', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de los angeles');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Tribunal de Juicio Oral en lo Penal de Concepción', 'tribunal_oral_penal', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'tribunal de juicio oral en lo penal de concepcion');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Corte de Apelaciones de Concepción', 'corte_apelaciones', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'corte de apelaciones de concepcion');

  -- ----- Araucanía (CL-AR) -----
  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Temuco', 'juzgado_garantia', 'CL-AR', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de temuco');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Juzgado de Garantía de Angol', 'juzgado_garantia', 'CL-AR', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'juzgado de garantia de angol');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Tribunal de Juicio Oral en lo Penal de Temuco', 'tribunal_oral_penal', 'CL-AR', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'tribunal de juicio oral en lo penal de temuco');

  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Corte de Apelaciones de Temuco', 'corte_apelaciones', 'CL-AR', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'corte de apelaciones de temuco');

  -- ----- Corte Suprema (instancia superior nacional) -----
  INSERT INTO courts (name, court_type, region_code, is_normalized, is_system,
                       normalized_by_id, normalized_at, created_by_id)
  SELECT 'Corte Suprema', 'corte_suprema', 'CL-RM', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM courts WHERE lower(fn_immutable_unaccent(name)) = 'corte suprema');
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Prosecutor offices — fiscalías regionales y locales clave
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_admin BIGINT;
  v_fr_maule BIGINT;
  v_fr_nuble BIGINT;
  v_fr_biobio BIGINT;
  v_fr_araucania BIGINT;
BEGIN
  SELECT id INTO v_admin FROM users WHERE email = 'jquiero@softe.cl';

  -- ----- Fiscalías regionales -----
  INSERT INTO prosecutor_offices (name, office_type, region_code, is_normalized, is_system,
                                    normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Regional del Maule', 'fiscalia_regional', 'CL-ML', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional del maule');

  INSERT INTO prosecutor_offices (name, office_type, region_code, is_normalized, is_system,
                                    normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Regional de Ñuble', 'fiscalia_regional', 'CL-NB', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional de nuble');

  INSERT INTO prosecutor_offices (name, office_type, region_code, is_normalized, is_system,
                                    normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Regional del Biobío', 'fiscalia_regional', 'CL-BI', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional del biobio');

  INSERT INTO prosecutor_offices (name, office_type, region_code, is_normalized, is_system,
                                    normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Regional de la Araucanía', 'fiscalia_regional', 'CL-AR', true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional de la araucania');

  -- Resolver IDs de regionales
  SELECT id INTO v_fr_maule       FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional del maule';
  SELECT id INTO v_fr_nuble       FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional de nuble';
  SELECT id INTO v_fr_biobio      FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional del biobio';
  SELECT id INTO v_fr_araucania   FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia regional de la araucania';

  -- ----- Fiscalías locales -----
  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Talca', 'fiscalia_local', 'CL-ML', v_fr_maule, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de talca');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Chillán', 'fiscalia_local', 'CL-NB', v_fr_nuble, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de chillan');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Concepción', 'fiscalia_local', 'CL-BI', v_fr_biobio, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de concepcion');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Cañete', 'fiscalia_local', 'CL-BI', v_fr_biobio, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de canete');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Los Ángeles', 'fiscalia_local', 'CL-BI', v_fr_biobio, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de los angeles');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Temuco', 'fiscalia_local', 'CL-AR', v_fr_araucania, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de temuco');

  INSERT INTO prosecutor_offices (name, office_type, region_code, parent_office_id,
                                    is_normalized, is_system, normalized_by_id, normalized_at, created_by_id)
  SELECT 'Fiscalía Local de Angol', 'fiscalia_local', 'CL-AR', v_fr_araucania, true, true, v_admin, now(), v_admin
  WHERE NOT EXISTS (SELECT 1 FROM prosecutor_offices WHERE lower(fn_immutable_unaccent(name)) = 'fiscalia local de angol');
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_courts INT;
  v_pos    INT;
BEGIN
  SELECT count(*) INTO v_courts FROM courts             WHERE is_system = true;
  SELECT count(*) INTO v_pos    FROM prosecutor_offices WHERE is_system = true;

  IF v_courts < 14 THEN
    RAISE EXCEPTION 'seed/08: courts incompleto (%)', v_courts;
  END IF;
  IF v_pos < 11 THEN
    RAISE EXCEPTION 'seed/08: prosecutor_offices incompleto (%)', v_pos;
  END IF;

  RAISE NOTICE 'seed/08 OK — courts=% prosecutor_offices=% (TODO: completar listado real con workshop URP)',
    v_courts, v_pos;
END;
$$;
