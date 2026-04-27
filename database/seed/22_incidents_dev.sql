-- =============================================================================
-- 22_incidents_dev.sql — 24 incidentes de ejemplo para desarrollo y demo.
--
-- Distribuidos:
--   - 6 por zona (ML / NB / BB / AR), correlativos 1..6 por cada Z{XX}.
--   - Año 2026 (correlativo usa year de occurred_at).
--   - Mezcla de tipos (THEFT_TIMBER, ILLEGAL_LOGGING, INTRUSION,
--     LAND_OCCUPATION, FIRE, INFRASTRUCTURE_DAMAGE, ANIMAL_RUSTLING).
--   - Mezcla de estados: submitted, under_review, closed, voided.
--   - Mezcla de semáforos: rojo, amarillo, verde, no_determinado.
--   - occurred_at distribuidos entre oct/2025 y abr/2026.
--
-- Idempotente: TRUNCATE limpia todo lo existente y resetea las secuencias.
-- Se asume que ya existen las zones (seed 20), incident_types (seed 01),
-- users (seed 04 bootstrap) y organizations.
-- =============================================================================

-- 1. Limpieza completa. TRUNCATE saltea el trigger fn_incidents_no_hard_delete
--    porque actúa BEFORE DELETE FOR EACH ROW (no se dispara en TRUNCATE).
TRUNCATE incidents RESTART IDENTITY CASCADE;
TRUNCATE incident_sequences;

-- 2. Insert 24 incidentes con datos realistas.
-- Variables resueltas via subquery:
--   - zone_id: SELECT id FROM zones WHERE short_code = '...'
--   - incident_type_id: SELECT id FROM incident_types WHERE code = '...'
--   - user_id: 1 (Juan Quiero, admin)
--   - organization_id: 1 (Forestal Arauco S.A., principal)

INSERT INTO incidents (
  correlative_code, correlative_number, correlative_year,
  zone_id, incident_type_id,
  occurred_at, detected_at, reported_at, submitted_at,
  location, location_source,
  description, semaforo, semaforo_set_at, semaforo_set_by_user_id,
  state, state_changed_at,
  voided_at, voided_by_user_id, void_reason,
  aggravating_factors,
  created_by_organization_id, captured_by_user_id,
  created_by_id, updated_by_id
)
SELECT
  cd.correlative_code,
  cd.correlative_number,
  2026,
  z.id,
  it.id,
  cd.occurred_at,
  cd.detected_at,
  cd.occurred_at + INTERVAL '2 hours',
  cd.occurred_at + INTERVAL '3 hours',
  ST_SetSRID(ST_MakePoint(cd.lng, cd.lat), 4326),
  cd.location_source,
  cd.description,
  cd.semaforo,
  CASE WHEN cd.semaforo = 'no_determinado' THEN NULL ELSE cd.occurred_at + INTERVAL '4 hours' END,
  CASE WHEN cd.semaforo = 'no_determinado' THEN NULL ELSE 1 END,
  cd.state,
  cd.occurred_at + INTERVAL '5 hours',
  CASE WHEN cd.state = 'voided' THEN cd.occurred_at + INTERVAL '5 hours' ELSE NULL END,
  CASE WHEN cd.state = 'voided' THEN 1 ELSE NULL END,
  CASE WHEN cd.state = 'voided' THEN cd.void_reason ELSE NULL END,
  cd.aggravating_factors::jsonb,
  1,  -- Forestal Arauco S.A.
  1,  -- Juan Quiero
  1, 1
FROM (
  VALUES
    -- ============ ZONA ML (Maule) — centro -35.43, -71.66 ============
    ('1-2026-ZML',  1, 'ML', 'THEFT_TIMBER',     '2026-04-22 06:30:00'::timestamptz, '2026-04-22 07:00:00'::timestamptz, -35.42, -71.65, 'gps', 'Robo de madera en sector norte. Camión con patente parcialmente legible avistado en escape.', 'rojo', 'active', '["chainsaw_used","motorized_vehicle_used"]', NULL),
    ('2-2026-ZML',  2, 'ML', 'ILLEGAL_LOGGING',  '2026-03-15 11:20:00'::timestamptz, '2026-03-15 14:00:00'::timestamptz, -35.50, -71.70, 'property_centroid', 'Tala ilegal de pino radiata, aproximadamente 8 árboles derribados sin extraer.', 'amarillo', 'active', '["chainsaw_used"]', NULL),
    ('3-2026-ZML',  3, 'ML', 'INTRUSION',        '2026-02-10 18:00:00'::timestamptz, NULL, -35.38, -71.62, 'manual', 'Intrusión sin sustracción reportada por guardia en patrullaje vespertino.', 'verde', 'active', '[]', NULL),
    ('4-2026-ZML',  4, 'ML', 'LAND_OCCUPATION',  '2026-01-08 09:00:00'::timestamptz, '2026-01-08 10:00:00'::timestamptz, -35.55, -71.55, 'gps', 'Toma de predio por aproximadamente 12 personas con instalación de campamento.', 'rojo', 'active', '["multiple_offenders"]', NULL),
    ('5-2026-ZML',  5, 'ML', 'FIRE',             '2025-12-20 14:30:00'::timestamptz, '2025-12-20 14:35:00'::timestamptz, -35.45, -71.68, 'gps', 'Incendio menor controlado por brigada de Arauco antes de propagarse al rodal.', 'no_determinado', 'voided', '[]', 'Reporte de prueba — incendio falso, no se detectó daño tras inspección'),
    ('6-2026-ZML',  6, 'ML', 'THEFT_TIMBER',     '2025-10-05 04:15:00'::timestamptz, '2025-10-05 06:00:00'::timestamptz, -35.40, -71.72, 'property_centroid', 'Robo nocturno de madera ya cosechada y apilada en cancha de acopio.', 'amarillo', 'active', '["motorized_vehicle_used"]', NULL),
    -- ============ ZONA NB (Ñuble) — centro -36.61, -72.10 ============
    ('1-2026-ZNB',  1, 'NB', 'THEFT_TIMBER',     '2026-04-18 23:00:00'::timestamptz, '2026-04-19 06:30:00'::timestamptz, -36.62, -72.08, 'gps', 'Robo masivo durante la noche, posibles dos vehículos involucrados.', 'rojo', 'active', '["motorized_vehicle_used","multiple_offenders"]', NULL),
    ('2-2026-ZNB',  2, 'NB', 'ILLEGAL_LOGGING',  '2026-03-22 10:00:00'::timestamptz, NULL, -36.55, -72.15, 'manual', 'Tala selectiva detectada en patrullaje aéreo con dron.', 'amarillo', 'active', '["chainsaw_used"]', NULL),
    ('3-2026-ZNB',  3, 'NB', 'INTRUSION',        '2026-02-28 19:30:00'::timestamptz, '2026-02-28 19:30:00'::timestamptz, -36.60, -72.05, 'gps', 'Vehículo no autorizado dentro del predio. Conductor abandonó al ver guardia.', 'verde', 'active', '[]', NULL),
    ('4-2026-ZNB',  4, 'NB', 'INFRASTRUCTURE_DAMAGE', '2026-01-30 15:00:00'::timestamptz, '2026-01-31 09:00:00'::timestamptz, -36.65, -72.12, 'property_centroid', 'Cortado el portón principal de acceso al área forestal con herramienta.', 'no_determinado', 'active', '["fence_breach"]', NULL),
    ('5-2026-ZNB',  5, 'NB', 'LAND_OCCUPATION',  '2025-12-12 07:00:00'::timestamptz, NULL, -36.58, -72.18, 'manual', 'Toma de predio con bandera y carteles. Aproximadamente 30 personas.', 'rojo', 'active', '["multiple_offenders","possible_organized_crime"]', NULL),
    ('6-2026-ZNB',  6, 'NB', 'FIRE',             '2025-11-08 16:45:00'::timestamptz, '2025-11-08 16:50:00'::timestamptz, -36.63, -72.07, 'gps', 'Incendio de origen sospechoso en sector con baja probabilidad de causa natural.', 'rojo', 'active', '[]', NULL),
    -- ============ ZONA BB (Biobío) — centro -36.83, -73.05 ============
    ('1-2026-ZBB',  1, 'BB', 'THEFT_TIMBER',     '2026-04-20 02:30:00'::timestamptz, '2026-04-20 05:00:00'::timestamptz, -36.85, -73.02, 'gps', 'Robo nocturno con uso de grúa para cargar piezas mayores.', 'rojo', 'active', '["crane_used","motorized_vehicle_used"]', NULL),
    ('2-2026-ZBB',  2, 'BB', 'ILLEGAL_LOGGING',  '2026-03-10 13:20:00'::timestamptz, NULL, -36.80, -73.10, 'manual', 'Sector con explotación ilegal recurrente. Se reportan 15 árboles caídos.', 'amarillo', 'active', '["chainsaw_used"]', NULL),
    ('3-2026-ZBB',  3, 'BB', 'INTRUSION',        '2026-02-15 22:00:00'::timestamptz, '2026-02-16 08:00:00'::timestamptz, -36.82, -73.06, 'gps', 'Intrusión en sector de bodega. No se constata sustracción.', 'no_determinado', 'voided', '[]', 'Duplicado — el evento ya estaba registrado en informe previo'),
    ('4-2026-ZBB',  4, 'BB', 'LAND_OCCUPATION',  '2026-01-22 11:00:00'::timestamptz, NULL, -36.86, -73.00, 'property_centroid', 'Toma con instalación de mediagua y reclamos territoriales.', 'amarillo', 'active', '["multiple_offenders"]', NULL),
    ('5-2026-ZBB',  5, 'BB', 'FIRE',             '2025-12-28 13:00:00'::timestamptz, '2025-12-28 13:05:00'::timestamptz, -36.84, -73.04, 'gps', 'Incendio extenso, requirió coordinación con CONAF y Bomberos.', 'rojo', 'active', '[]', NULL),
    ('6-2026-ZBB',  6, 'BB', 'THEFT_TIMBER',     '2025-11-15 03:00:00'::timestamptz, '2025-11-15 06:00:00'::timestamptz, -36.81, -73.08, 'gps', 'Robo recuperado parcialmente. Detenido 1 sospechoso.', 'verde', 'active', '["motorized_vehicle_used"]', NULL),
    -- ============ ZONA AR (Araucanía) — centro -38.74, -72.60 ============
    ('1-2026-ZAR',  1, 'AR', 'THEFT_TIMBER',     '2026-04-25 04:00:00'::timestamptz, '2026-04-25 07:00:00'::timestamptz, -38.75, -72.58, 'gps', 'Robo a gran escala. Múltiples vehículos en escape coordinado.', 'rojo', 'active', '["motorized_vehicle_used","multiple_offenders","possible_organized_crime"]', NULL),
    ('2-2026-ZAR',  2, 'AR', 'ILLEGAL_LOGGING',  '2026-03-08 12:00:00'::timestamptz, NULL, -38.72, -72.62, 'manual', 'Tala con uso de motosierra detectada por dron. Imputados huyeron.', 'amarillo', 'active', '["chainsaw_used"]', NULL),
    ('3-2026-ZAR',  3, 'AR', 'ANIMAL_RUSTLING',  '2026-02-20 06:00:00'::timestamptz, '2026-02-20 08:00:00'::timestamptz, -38.78, -72.55, 'property_centroid', 'Sustracción de ganado de pequeña explotación dentro del predio.', 'no_determinado', 'active', '["animal_rustling"]', NULL),
    ('4-2026-ZAR',  4, 'AR', 'LAND_OCCUPATION',  '2026-01-15 08:00:00'::timestamptz, '2026-01-15 09:00:00'::timestamptz, -38.73, -72.65, 'gps', 'Toma con bandera mapuche y reclamos territoriales históricos.', 'rojo', 'active', '["multiple_offenders"]', NULL),
    ('5-2026-ZAR',  5, 'AR', 'FIRE',             '2025-12-05 14:00:00'::timestamptz, '2025-12-05 14:10:00'::timestamptz, -38.76, -72.61, 'gps', 'Incendio simultáneo en dos puntos, causa intencional bajo investigación.', 'amarillo', 'active', '[]', NULL),
    ('6-2026-ZAR',  6, 'AR', 'THEFT_TIMBER',     '2025-10-12 23:30:00'::timestamptz, '2025-10-13 02:00:00'::timestamptz, -38.71, -72.67, 'gps', 'Robo menor controlado por intervención rápida del guardia de turno.', 'verde', 'active', '[]', NULL)
) AS cd (
  correlative_code, correlative_number, zone_short_code, type_code,
  occurred_at, detected_at, lat, lng,
  location_source, description, semaforo, state, aggravating_factors, void_reason
)
JOIN zones z ON z.short_code = cd.zone_short_code
JOIN incident_types it ON it.code = cd.type_code;

-- 3. Sincronizar incident_sequences con los correlativos asignados.
INSERT INTO incident_sequences (zone_id, year, last_number)
SELECT z.id, 2026, 6
FROM zones z
WHERE z.short_code IN ('ML', 'NB', 'BB', 'AR');

-- Resumen para verificación.
SELECT
  z.short_code AS zona,
  count(*) FILTER (WHERE i.state = 'active')   AS reportados,
  count(*) FILTER (WHERE i.state = 'active') AS en_revision,
  count(*) FILTER (WHERE i.state = 'active')       AS cerrados,
  count(*) FILTER (WHERE i.state = 'voided')       AS anulados,
  count(*) AS total
FROM incidents i
JOIN zones z ON z.id = i.zone_id
GROUP BY z.short_code
ORDER BY z.short_code;
