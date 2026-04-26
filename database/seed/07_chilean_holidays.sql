-- =============================================================================
-- SURP 2.0 — seed/07_chilean_holidays.sql
--
-- Bootstrap mínimo de feriados Chile 2026.
--
-- En producción este seed es solo el arranque inicial. El worker BullMQ
-- sync-chilean-holidays sincroniza anualmente desde:
--   https://api.feriados.io/v1/CL/holidays/{year}
-- (API key en Key Vault como FERIADOS_IO_API_KEY).
--
-- Idempotente: ON CONFLICT (date) DO NOTHING.
-- =============================================================================

INSERT INTO chilean_holidays (date, name, irrenunciable, holiday_type, source) VALUES
  ('2026-01-01', 'Año Nuevo',                              true,  'national', 'bootstrap'),
  ('2026-04-03', 'Viernes Santo',                          false, 'national', 'bootstrap'),
  ('2026-04-04', 'Sábado Santo',                           false, 'national', 'bootstrap'),
  ('2026-05-01', 'Día Nacional del Trabajo',               true,  'national', 'bootstrap'),
  ('2026-05-21', 'Día de las Glorias Navales',             false, 'national', 'bootstrap'),
  ('2026-06-21', 'Día Nacional de los Pueblos Indígenas',  false, 'national', 'bootstrap'),
  ('2026-06-29', 'San Pedro y San Pablo',                  false, 'national', 'bootstrap'),
  ('2026-07-16', 'Día de la Virgen del Carmen',            false, 'national', 'bootstrap'),
  ('2026-08-15', 'Asunción de la Virgen',                  false, 'national', 'bootstrap'),
  ('2026-09-18', 'Independencia Nacional',                 true,  'national', 'bootstrap'),
  ('2026-09-19', 'Día de las Glorias del Ejército',        true,  'national', 'bootstrap'),
  ('2026-10-12', 'Encuentro de Dos Mundos',                false, 'national', 'bootstrap'),
  ('2026-10-31', 'Día Nacional de las Iglesias Evangélicas', false, 'national', 'bootstrap'),
  ('2026-11-01', 'Día de Todos los Santos',                false, 'national', 'bootstrap'),
  ('2026-12-08', 'Inmaculada Concepción',                  false, 'national', 'bootstrap'),
  ('2026-12-25', 'Navidad',                                true,  'national', 'bootstrap')
ON CONFLICT (date) DO NOTHING;


-- Verificación
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM chilean_holidays
  WHERE EXTRACT(YEAR FROM date) = 2026;

  IF v_count < 16 THEN
    RAISE EXCEPTION 'seed/07: feriados 2026 incompletos (%)', v_count;
  END IF;
  RAISE NOTICE 'seed/07 OK — % feriados Chile 2026 cargados (bootstrap)', v_count;
END;
$$;
