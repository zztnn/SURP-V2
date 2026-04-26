-- =============================================================================
-- SURP 2.0 — seed/01_catalog.sql
--
-- Carga inicial de los 11 catálogos editables por admin. Solo filas mínimas
-- con `is_system=true` (no se pueden borrar). El admin agrega el resto en UI.
--
-- Idempotente: ON CONFLICT (code) DO NOTHING — re-ejecutar el seed no
-- sobrescribe ediciones del admin.
--
-- Justificaciones de mínimos:
--   - Selección basada en uso operativo conocido del legacy + skills legales.
--   - El ETL legacy completará el resto al cut-over.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- incident_types
-- -----------------------------------------------------------------------------

INSERT INTO incident_types
  (code, name, description, category, default_legal_articles, involves_timber, involves_land_occupation, involves_fire, is_system, order_index)
VALUES
  ('THEFT_TIMBER', 'Robo de madera', 'Sustracción de madera del patrimonio Arauco con o sin fuerza',
    'property_crime',
    '[{"law":"CP","article":"443","note":"Inc. final Ley 21.013 — productos forestales con agravantes"},
      {"law":"CP","article":"446","note":"Hurto simple cuando no hay fuerza"}]'::jsonb,
    true, false, false, true, 10),
  ('ILLEGAL_LOGGING', 'Tala ilegal', 'Corta de árboles sin autorización (predios Arauco)',
    'property_crime',
    '[{"law":"CP","article":"484","note":"Daños"},
      {"law":"Ley 20.283","article":"22","note":"Sanción administrativa CONAF"}]'::jsonb,
    true, false, false, true, 20),
  ('INTRUSION', 'Intrusión',
    'Ingreso no autorizado a predio (sin necesariamente sustracción)',
    'property_crime',
    '[{"law":"CP","article":"144","note":"Violación de morada — solo si hay habitación"},
      {"law":"CP","article":"475","note":"Daños"}]'::jsonb,
    false, false, false, true, 30),
  ('LAND_OCCUPATION', 'Toma / usurpación',
    'Ocupación de predio (Ley 21.633 — procedimiento expedito)',
    'land_occupation',
    '[{"law":"CP","article":"457","note":"Usurpación violenta"},
      {"law":"CP","article":"458","note":"Usurpación no violenta"}]'::jsonb,
    false, true, false, true, 40),
  ('FIRE', 'Incendio',
    'Incendio forestal (intencional, accidental, o de origen indeterminado)',
    'fire',
    '[{"law":"CP","article":"476","note":"Incendio en lugar habitado o destinado a habitación"},
      {"law":"CP","article":"477","note":"Incendio de monte/bosque"},
      {"law":"Ley 20.653","article":"3","note":"Agravantes específicas para incendios forestales"}]'::jsonb,
    false, false, true, true, 50),
  ('INFRASTRUCTURE_DAMAGE', 'Daño a infraestructura',
    'Daño a caminos, cercos, portones, edificaciones, equipos',
    'infrastructure',
    '[{"law":"CP","article":"484","note":"Daños"}]'::jsonb,
    false, false, false, true, 60),
  ('ANIMAL_RUSTLING', 'Abigeato',
    'Sustracción de ganado en predios Arauco',
    'property_crime',
    '[{"law":"CP","article":"448 bis","note":"Hurto/abigeato"},
      {"law":"CP","article":"448 ter","note":"Abigeato agravado"}]'::jsonb,
    false, false, false, true, 70),
  ('THREATS', 'Amenazas',
    'Amenazas a trabajadores, contratistas o personal de seguridad de Arauco',
    'other',
    '[{"law":"CP","article":"296","note":"Amenazas"}]'::jsonb,
    false, false, false, true, 80),
  ('RECEPTION', 'Receptación',
    'Recepción/transporte/comercialización de madera de origen ilícito',
    'property_crime',
    '[{"law":"CP","article":"456 bis A","note":"Receptación"}]'::jsonb,
    true, false, false, true, 90),
  ('OTHER', 'Otro',
    'Categoría residual; debe completarse con descripción detallada',
    'other', '[]'::jsonb,
    false, false, false, true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- incident_person_roles (rol operativo en el informe — distinto de procedural_role)
-- -----------------------------------------------------------------------------

INSERT INTO incident_person_roles
  (code, name, description, requires_contact_info, requires_rut, is_system, order_index)
VALUES
  ('DENOUNCER', 'Denunciante', 'Persona que reporta el hecho', true, true, true, 10),
  ('WITNESS', 'Testigo', 'Presenció el hecho', true, false, true, 20),
  ('VICTIM', 'Víctima', 'Persona afectada directa', true, false, true, 30),
  ('INFORMER', 'Informante', 'Aporta antecedentes sin ser testigo', false, false, true, 40),
  ('AFFECTED_WORKER', 'Trabajador afectado', 'Trabajador o contratista afectado por el hecho', true, true, true, 50),
  ('DRIVER', 'Conductor', 'Conductor del vehículo involucrado', false, false, true, 60),
  ('OCCUPANT', 'Ocupante', 'Ocupante del vehículo o predio', false, false, true, 70),
  ('OTHER', 'Otro', 'Rol no clasificado', false, false, true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- asset_types — bienes afectados de Arauco
-- -----------------------------------------------------------------------------

INSERT INTO asset_types
  (code, name, description, category, default_unit, requires_valuation, is_system, order_index)
VALUES
  ('LOG_TIMBER', 'Madera en troza', 'Trozas de madera lista para transporte/aserrado', 'timber', 'm3', true, true, 10),
  ('STANDING_TIMBER', 'Madera en pie', 'Árboles en pie del patrimonio Arauco', 'timber', 'unidades', true, true, 20),
  ('SAWN_TIMBER', 'Madera dimensionada', 'Madera procesada (tablas, vigas, basas)', 'timber', 'm3', true, true, 30),
  ('FIREWOOD', 'Leña', 'Madera para combustión', 'timber', 'ton', true, true, 40),
  ('MACHINERY_HEAVY', 'Maquinaria pesada', 'Cosechadoras, skidders, cargadores', 'machinery', 'unidades', true, true, 50),
  ('VEHICLE_OWNED', 'Vehículo Arauco', 'Vehículos propiedad de Arauco', 'vehicle', 'unidades', true, true, 60),
  ('FUEL', 'Combustible', 'Diesel, bencina, lubricantes', 'machinery', 'litros', true, true, 70),
  ('FENCING', 'Cercos', 'Cercos perimetrales del predio', 'infrastructure', 'metros', true, true, 80),
  ('BUILDINGS', 'Edificaciones', 'Galpones, oficinas, casetas', 'infrastructure', 'unidades', true, true, 90),
  ('ROADS', 'Caminos', 'Caminos forestales internos', 'infrastructure', 'km', true, true, 100),
  ('OTHER', 'Otro', 'Bien no clasificado', 'other', NULL, true, true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- vehicle_types
-- -----------------------------------------------------------------------------

INSERT INTO vehicle_types
  (code, name, category, is_system, order_index)
VALUES
  ('TRUCK_FORESTAL', 'Camión forestal',  'truck', true, 10),
  ('TRUCK_GENERAL',  'Camión general',   'truck', true, 20),
  ('PICKUP',         'Camioneta',        'pickup', true, 30),
  ('CAR',            'Automóvil',        'car', true, 40),
  ('SUV',            'SUV',              'car', true, 50),
  ('MOTORCYCLE',     'Motocicleta',      'motorcycle', true, 60),
  ('MACHINERY',      'Maquinaria',       'machinery', true, 70),
  ('OTHER',          'Otro',             'other', true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- institutions
-- -----------------------------------------------------------------------------

INSERT INTO institutions
  (code, name, short_name, institution_type, is_system, order_index)
VALUES
  ('CARABINEROS',     'Carabineros de Chile',                                        'Carabineros',     'police',             true, 10),
  ('PDI',             'Policía de Investigaciones de Chile',                         'PDI',             'police',             true, 20),
  ('FISCALIA',        'Ministerio Público',                                          'Fiscalía',        'prosecutor',         true, 30),
  ('TRIBUNAL_GAR',    'Tribunal de Garantía',                                        'TG',              'court',              true, 40),
  ('TRIBUNAL_OP',     'Tribunal de Juicio Oral en lo Penal',                         'TOP',             'court',              true, 50),
  ('CORTE_APELACION', 'Corte de Apelaciones',                                        'C. Apelaciones',  'court',              true, 60),
  ('CONAF',           'Corporación Nacional Forestal',                               'CONAF',           'forestry_authority', true, 70),
  ('BOMBEROS',        'Cuerpo de Bomberos',                                          'Bomberos',        'fire_department',    true, 80),
  ('LABOCAR',         'Laboratorio de Criminalística de Carabineros',                'LABOCAR',         'police',             true, 90),
  ('SML',             'Servicio Médico Legal',                                       'SML',             'medical_legal',      true, 100)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- tree_species
-- -----------------------------------------------------------------------------

INSERT INTO tree_species
  (code, common_name, scientific_name, origin_category, protected_status, is_system, order_index)
VALUES
  ('pinus_radiata',         'Pino radiata',     'Pinus radiata D.Don',              'exotic_plantation', NULL,                 true, 10),
  ('eucalyptus_globulus',   'Eucalipto azul',   'Eucalyptus globulus Labill.',      'exotic_plantation', NULL,                 true, 20),
  ('eucalyptus_nitens',     'Eucalipto nitens', 'Eucalyptus nitens (Deane & Maiden) Maiden', 'exotic_plantation', NULL,        true, 30),
  ('nothofagus_obliqua',    'Roble',            'Nothofagus obliqua (Mirb.) Oerst.', 'native',           NULL,                 true, 40),
  ('nothofagus_alpina',     'Raulí',            'Nothofagus alpina (Poepp. & Endl.) Oerst.', 'native',   'minor_concern',      true, 50),
  ('nothofagus_dombeyi',    'Coihue',           'Nothofagus dombeyi (Mirb.) Oerst.', 'native',           NULL,                 true, 60),
  ('araucaria_araucana',    'Araucaria',        'Araucaria araucana (Molina) K.Koch', 'native',          'vulnerable',         true, 70),
  ('austrocedrus_chilensis','Ciprés cordillera','Austrocedrus chilensis (D.Don) Pic.Serm. & Bizzarri', 'native', 'minor_concern', true, 80),
  ('fitzroya_cupressoides', 'Alerce',           'Fitzroya cupressoides (Molina) I.M.Johnst.', 'native',  'endangered',         true, 90),
  ('OTHER',                 'Otra',             NULL,                                'other',           NULL,                 true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- wood_conditions (CondicionMadera legacy)
-- -----------------------------------------------------------------------------

INSERT INTO wood_conditions
  (code, name, description, is_system, order_index)
VALUES
  ('LOG',         'En troza',     'Tronco aserrado en largos comerciales',     true, 10),
  ('DIMENSIONED', 'Dimensionada', 'Madera procesada en aserradero',            true, 20),
  ('FIREWOOD',    'Leña',         'Madera para combustión (corta y partida)',  true, 30),
  ('CHIPS',       'Astillas',     'Astillas/chips para celulosa',              true, 40),
  ('PULPWOOD',    'Pulpable',     'Madera destinada a celulosa, sin dimensionar', true, 50),
  ('STANDING',    'En pie',       'Árbol vivo en el predio',                   true, 60),
  ('FELLED',      'Volteado',     'Árbol cortado pero aún en cancha/predio',   true, 70),
  ('UNKNOWN',     'No determinado','Estado físico no determinable al momento del informe', true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- wood_states (EstadoMadera legacy — recuperación)
-- -----------------------------------------------------------------------------

INSERT INTO wood_states
  (code, name, description, recovery_indicator, is_system, order_index)
VALUES
  ('FULL_RECOVERY',     'Recuperada total',   'Toda la madera fue recuperada', 'full', true, 10),
  ('PARTIAL_RECOVERY',  'Recuperada parcial', 'Parte de la madera fue recuperada', 'partial', true, 20),
  ('NO_RECOVERY',       'No recuperada',      'No se recuperó madera', 'none', true, 30),
  ('UNDETERMINED',      'No determinado',     'Estado de recuperación no determinable al momento del informe', 'unknown', true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- wood_storage_types (AcopioMadera legacy)
-- -----------------------------------------------------------------------------

INSERT INTO wood_storage_types
  (code, name, description, is_system, order_index)
VALUES
  ('YARD',        'Cancha',           'Madera acopiada en cancha del predio', true, 10),
  ('TRUCK',       'Camión',           'Madera cargada en camión al momento del hecho', true, 20),
  ('SAWMILL',     'Patio aserradero', 'Madera en patio de aserradero', true, 30),
  ('IN_FIELD',    'En terreno',       'Madera dispersa en terreno (post-corta)', true, 40),
  ('NO_STORAGE',  'Sin acopio',       'No estaba acopiada (en pie / dispersa)', true, 50),
  ('UNKNOWN',     'No determinado',   'Tipo de acopio no determinable', true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- operation_types (Faena legacy)
-- -----------------------------------------------------------------------------

INSERT INTO operation_types
  (code, name, description, is_system, order_index)
VALUES
  ('HARVESTING',  'Cosecha',     'Cosecha (tala rasa) en curso', true, 10),
  ('THINNING',    'Raleo',       'Raleo en curso',               true, 20),
  ('PLANTING',    'Plantación',  'Plantación en curso',          true, 30),
  ('PRUNING',     'Poda',        'Poda en curso',                true, 40),
  ('ROADS',       'Caminos',     'Construcción/mantención de caminos forestales', true, 50),
  ('MAINTENANCE', 'Mantención',  'Mantención general (cercos, prevención)', true, 60),
  ('TRANSPORT',   'Transporte',  'Transporte de madera/insumos en curso', true, 70),
  ('NONE',        'Sin faena',   'Predio sin faena activa', true, 80),
  ('UNKNOWN',     'No determinado', 'Faena no determinada al momento del hecho', true, 1000)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- seizure_reasons
-- -----------------------------------------------------------------------------

INSERT INTO seizure_reasons
  (code, name, description, requires_chain_of_custody, is_system, order_index)
VALUES
  ('FLAGRANCE',       'Flagrancia',           'Detenido en flagrancia (CPP art. 130)', true, true, 10),
  ('PROPERTY_FOUND',  'Hallazgo en predio',   'Encontrado en el predio sin sospechoso identificado', true, true, 20),
  ('VOLUNTARY',       'Entrega voluntaria',   'El sospechoso entrega voluntariamente', true, true, 30),
  ('JUDICIAL_ORDER',  'Orden judicial',       'Incautado por orden del tribunal', true, true, 40),
  ('POLICE_REQUEST',  'Solicitud de policía', 'Entregado a Carabineros/PDI bajo solicitud', true, true, 50)
ON CONFLICT (code) DO NOTHING;
