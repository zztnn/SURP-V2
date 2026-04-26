-- =============================================================================
-- 19_geo_chilemapas.sql — Catálogo territorial chileno (textual, sin polígonos).
--
-- Carga 16 regiones, 16 provincias sintéticas (1 por región — placeholder hasta
-- el ETL real desde BCN/IDE Chile) y ~346 comunas con nombre y código INE
-- sintético consistente con el formato CUT (5 dígitos).
--
-- Fuente de los nombres: `IGM/frontend/src/data/chile-regiones-comunas.ts`.
-- NO incluye polígonos — `regions.geometry` y `communes.geometry` quedan NULL.
-- Las geometrías reales se cargan después con `pnpm db:seed:geo` desde
-- `juanbrujo/chilemapas` (ver GEO-PATTERNS.md §9).
--
-- Idempotente vía ON CONFLICT (ine_code) DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Regions (16) — códigos INE oficiales 2 dígitos.
-- -----------------------------------------------------------------------------

INSERT INTO regions (ine_code, name, short_name, iso_3166_2, capital, order_north_south)
VALUES
  ('15', 'Arica y Parinacota',          'Arica y Parinacota', 'CL-AP', 'Arica',         1),
  ('01', 'Tarapacá',                    'Tarapacá',           'CL-TA', 'Iquique',       2),
  ('02', 'Antofagasta',                 'Antofagasta',        'CL-AN', 'Antofagasta',   3),
  ('03', 'Atacama',                     'Atacama',            'CL-AT', 'Copiapó',       4),
  ('04', 'Coquimbo',                    'Coquimbo',           'CL-CO', 'La Serena',     5),
  ('05', 'Valparaíso',                  'Valparaíso',         'CL-VS', 'Valparaíso',    6),
  ('13', 'Metropolitana de Santiago',   'RM',                 'CL-RM', 'Santiago',      7),
  ('06', 'O''Higgins',                  'O''Higgins',         'CL-LI', 'Rancagua',      8),
  ('07', 'Maule',                       'Maule',              'CL-ML', 'Talca',         9),
  ('16', 'Ñuble',                       'Ñuble',              'CL-NB', 'Chillán',      10),
  ('08', 'Biobío',                      'Biobío',             'CL-BI', 'Concepción',   11),
  ('09', 'La Araucanía',                'Araucanía',          'CL-AR', 'Temuco',       12),
  ('14', 'Los Ríos',                    'Los Ríos',           'CL-LR', 'Valdivia',     13),
  ('10', 'Los Lagos',                   'Los Lagos',          'CL-LL', 'Puerto Montt', 14),
  ('11', 'Aysén',                       'Aysén',              'CL-AI', 'Coyhaique',    15),
  ('12', 'Magallanes',                  'Magallanes',         'CL-MA', 'Punta Arenas', 16)
ON CONFLICT (ine_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Provinces — sintéticas, 1 por región (placeholder hasta ETL real BCN).
--    El código INE es {region_code}9 (ej. '079' Maule, '169' Ñuble) para no
--    chocar con los códigos oficiales reales que luego se importarán y
--    sobreescriben.
-- -----------------------------------------------------------------------------

INSERT INTO provinces (ine_code, region_id, name, capital)
SELECT
  region.ine_code || '9' AS ine_code,
  region.id              AS region_id,
  region.name            AS name,
  region.capital         AS capital
FROM regions region
ON CONFLICT (ine_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Communes (~346) — CUT sintético `{region_code}{seq3}` (ej. '07001').
--    El secuencial dentro de la región se genera por orden alfabético del
--    nombre vía `row_number()`. Cuando se cargue el catálogo real desde INE,
--    los CUTs sintéticos se reemplazan vía UPDATE.
-- -----------------------------------------------------------------------------

INSERT INTO communes (ine_code, region_id, province_id, name)
SELECT
  cd.region_code || LPAD(
    row_number() OVER (PARTITION BY cd.region_code ORDER BY cd.name)::text,
    3, '0'
  ) AS ine_code,
  rl.id        AS region_id,
  pl.id        AS province_id,
  cd.name      AS name
FROM (
  VALUES
    -- 01 Tarapacá (7)
    ('01', 'Alto Hospicio'), ('01', 'Camiña'), ('01', 'Colchane'), ('01', 'Huara'),
    ('01', 'Iquique'), ('01', 'Pica'), ('01', 'Pozo Almonte'),
    -- 02 Antofagasta (9)
    ('02', 'Antofagasta'), ('02', 'Calama'), ('02', 'María Elena'), ('02', 'Mejillones'),
    ('02', 'Ollagüe'), ('02', 'San Pedro de Atacama'), ('02', 'Sierra Gorda'),
    ('02', 'Taltal'), ('02', 'Tocopilla'),
    -- 03 Atacama (9)
    ('03', 'Alto del Carmen'), ('03', 'Caldera'), ('03', 'Chañaral'), ('03', 'Copiapó'),
    ('03', 'Diego de Almagro'), ('03', 'Freirina'), ('03', 'Huasco'),
    ('03', 'Tierra Amarilla'), ('03', 'Vallenar'),
    -- 04 Coquimbo (15)
    ('04', 'Andacollo'), ('04', 'Canela'), ('04', 'Combarbalá'), ('04', 'Coquimbo'),
    ('04', 'Illapel'), ('04', 'La Higuera'), ('04', 'La Serena'), ('04', 'Los Vilos'),
    ('04', 'Monte Patria'), ('04', 'Ovalle'), ('04', 'Paihuano'), ('04', 'Punitaqui'),
    ('04', 'Río Hurtado'), ('04', 'Salamanca'), ('04', 'Vicuña'),
    -- 05 Valparaíso (38)
    ('05', 'Algarrobo'), ('05', 'Cabildo'), ('05', 'Calera'), ('05', 'Calle Larga'),
    ('05', 'Cartagena'), ('05', 'Casablanca'), ('05', 'Catemu'), ('05', 'Concón'),
    ('05', 'El Quisco'), ('05', 'El Tabo'), ('05', 'Hijuelas'), ('05', 'Isla de Pascua'),
    ('05', 'Juan Fernández'), ('05', 'La Cruz'), ('05', 'La Ligua'), ('05', 'Limache'),
    ('05', 'Llaillay'), ('05', 'Los Andes'), ('05', 'Nogales'), ('05', 'Olmué'),
    ('05', 'Panquehue'), ('05', 'Papudo'), ('05', 'Petorca'), ('05', 'Puchuncaví'),
    ('05', 'Putaendo'), ('05', 'Quillota'), ('05', 'Quilpué'), ('05', 'Quintero'),
    ('05', 'Rinconada'), ('05', 'San Antonio'), ('05', 'San Esteban'), ('05', 'San Felipe'),
    ('05', 'Santa María'), ('05', 'Santo Domingo'), ('05', 'Valparaíso'),
    ('05', 'Villa Alemana'), ('05', 'Viña del Mar'), ('05', 'Zapallar'),
    -- 06 O'Higgins (33)
    ('06', 'Chépica'), ('06', 'Chimbarongo'), ('06', 'Codegua'), ('06', 'Coinco'),
    ('06', 'Coltauco'), ('06', 'Doñihue'), ('06', 'Graneros'), ('06', 'La Estrella'),
    ('06', 'Las Cabras'), ('06', 'Litueche'), ('06', 'Lolol'), ('06', 'Machalí'),
    ('06', 'Malloa'), ('06', 'Marchihue'), ('06', 'Mostazal'), ('06', 'Nancagua'),
    ('06', 'Navidad'), ('06', 'Olivar'), ('06', 'Palmilla'), ('06', 'Paredones'),
    ('06', 'Peralillo'), ('06', 'Peumo'), ('06', 'Pichidegua'), ('06', 'Pichilemu'),
    ('06', 'Placilla'), ('06', 'Pumanque'), ('06', 'Quinta de Tilcoco'), ('06', 'Rancagua'),
    ('06', 'Rengo'), ('06', 'Requínoa'), ('06', 'San Fernando'), ('06', 'San Vicente'),
    ('06', 'Santa Cruz'),
    -- 07 Maule (30)
    ('07', 'Cauquenes'), ('07', 'Chanco'), ('07', 'Colbún'), ('07', 'Constitución'),
    ('07', 'Curepto'), ('07', 'Curicó'), ('07', 'Empedrado'), ('07', 'Hualañé'),
    ('07', 'Licantén'), ('07', 'Linares'), ('07', 'Longaví'), ('07', 'Maule'),
    ('07', 'Molina'), ('07', 'Parral'), ('07', 'Pelarco'), ('07', 'Pelluhue'),
    ('07', 'Pencahue'), ('07', 'Rauco'), ('07', 'Retiro'), ('07', 'Río Claro'),
    ('07', 'Romeral'), ('07', 'Sagrada Familia'), ('07', 'San Clemente'),
    ('07', 'San Javier'), ('07', 'San Rafael'), ('07', 'Talca'), ('07', 'Teno'),
    ('07', 'Vichuquén'), ('07', 'Villa Alegre'), ('07', 'Yerbas Buenas'),
    -- 08 Biobío (33)
    ('08', 'Alto Biobío'), ('08', 'Antuco'), ('08', 'Arauco'), ('08', 'Cabrero'),
    ('08', 'Cañete'), ('08', 'Chiguayante'), ('08', 'Concepción'), ('08', 'Contulmo'),
    ('08', 'Coronel'), ('08', 'Curanilahue'), ('08', 'Florida'), ('08', 'Hualpén'),
    ('08', 'Hualqui'), ('08', 'Laja'), ('08', 'Lebu'), ('08', 'Los Álamos'),
    ('08', 'Los Ángeles'), ('08', 'Lota'), ('08', 'Mulchén'), ('08', 'Nacimiento'),
    ('08', 'Negrete'), ('08', 'Penco'), ('08', 'Quilaco'), ('08', 'Quilleco'),
    ('08', 'San Pedro de La Paz'), ('08', 'San Rosendo'), ('08', 'Santa Bárbara'),
    ('08', 'Santa Juana'), ('08', 'Talcahuano'), ('08', 'Tirúa'), ('08', 'Tomé'),
    ('08', 'Tucapel'), ('08', 'Yumbel'),
    -- 09 La Araucanía (32)
    ('09', 'Angol'), ('09', 'Carahue'), ('09', 'Cholchol'), ('09', 'Collipulli'),
    ('09', 'Cunco'), ('09', 'Curacautín'), ('09', 'Curarrehue'), ('09', 'Ercilla'),
    ('09', 'Freire'), ('09', 'Galvarino'), ('09', 'Gorbea'), ('09', 'Lautaro'),
    ('09', 'Loncoche'), ('09', 'Lonquimay'), ('09', 'Los Sauces'), ('09', 'Lumaco'),
    ('09', 'Melipeuco'), ('09', 'Nueva Imperial'), ('09', 'Padre Las Casas'),
    ('09', 'Perquenco'), ('09', 'Pitrufquén'), ('09', 'Pucón'), ('09', 'Purén'),
    ('09', 'Renaico'), ('09', 'Saavedra'), ('09', 'Temuco'), ('09', 'Teodoro Schmidt'),
    ('09', 'Toltén'), ('09', 'Traiguén'), ('09', 'Victoria'), ('09', 'Vilcún'),
    ('09', 'Villarrica'),
    -- 10 Los Lagos (30)
    ('10', 'Ancud'), ('10', 'Calbuco'), ('10', 'Castro'), ('10', 'Chaitén'),
    ('10', 'Chonchi'), ('10', 'Cochamó'), ('10', 'Curaco de Vélez'), ('10', 'Dalcahue'),
    ('10', 'Fresia'), ('10', 'Frutillar'), ('10', 'Futaleufú'), ('10', 'Hualaihué'),
    ('10', 'Llanquihue'), ('10', 'Los Muermos'), ('10', 'Maullín'), ('10', 'Osorno'),
    ('10', 'Palena'), ('10', 'Puerto Montt'), ('10', 'Puerto Octay'), ('10', 'Puerto Varas'),
    ('10', 'Puqueldón'), ('10', 'Purranque'), ('10', 'Puyehue'), ('10', 'Queilén'),
    ('10', 'Quellón'), ('10', 'Quemchi'), ('10', 'Quinchao'), ('10', 'Río Negro'),
    ('10', 'San Juan de la Costa'), ('10', 'San Pablo'),
    -- 11 Aysén (10)
    ('11', 'Aysén'), ('11', 'Chile Chico'), ('11', 'Cisnes'), ('11', 'Cochrane'),
    ('11', 'Coyhaique'), ('11', 'Guaitecas'), ('11', 'Lago Verde'), ('11', 'O''Higgins'),
    ('11', 'Río Ibáñez'), ('11', 'Tortel'),
    -- 12 Magallanes (11)
    ('12', 'Antártica'), ('12', 'Cabo de Hornos'), ('12', 'Laguna Blanca'),
    ('12', 'Natales'), ('12', 'Porvenir'), ('12', 'Primavera'), ('12', 'Punta Arenas'),
    ('12', 'Río Verde'), ('12', 'San Gregorio'), ('12', 'Timaukel'),
    ('12', 'Torres del Paine'),
    -- 13 Metropolitana (52)
    ('13', 'Alhué'), ('13', 'Buin'), ('13', 'Calera de Tango'), ('13', 'Cerrillos'),
    ('13', 'Cerro Navia'), ('13', 'Colina'), ('13', 'Conchalí'), ('13', 'Curacaví'),
    ('13', 'El Bosque'), ('13', 'El Monte'), ('13', 'Estación Central'),
    ('13', 'Huechuraba'), ('13', 'Independencia'), ('13', 'Isla de Maipo'),
    ('13', 'La Cisterna'), ('13', 'La Florida'), ('13', 'La Granja'), ('13', 'La Pintana'),
    ('13', 'La Reina'), ('13', 'Lampa'), ('13', 'Las Condes'), ('13', 'Lo Barnechea'),
    ('13', 'Lo Espejo'), ('13', 'Lo Prado'), ('13', 'Macul'), ('13', 'Maipú'),
    ('13', 'María Pinto'), ('13', 'Melipilla'), ('13', 'Ñuñoa'), ('13', 'Padre Hurtado'),
    ('13', 'Paine'), ('13', 'Pedro Aguirre Cerda'), ('13', 'Peñaflor'), ('13', 'Peñalolén'),
    ('13', 'Pirque'), ('13', 'Providencia'), ('13', 'Pudahuel'), ('13', 'Puente Alto'),
    ('13', 'Quilicura'), ('13', 'Quinta Normal'), ('13', 'Recoleta'), ('13', 'Renca'),
    ('13', 'San Bernardo'), ('13', 'San Joaquín'), ('13', 'San José de Maipo'),
    ('13', 'San Miguel'), ('13', 'San Pedro'), ('13', 'San Ramón'), ('13', 'Santiago'),
    ('13', 'Talagante'), ('13', 'Tiltil'), ('13', 'Vitacura'),
    -- 14 Los Ríos (12)
    ('14', 'Corral'), ('14', 'Futrono'), ('14', 'La Unión'), ('14', 'Lago Ranco'),
    ('14', 'Lanco'), ('14', 'Los Lagos'), ('14', 'Máfil'), ('14', 'Mariquina'),
    ('14', 'Paillaco'), ('14', 'Panguipulli'), ('14', 'Río Bueno'), ('14', 'Valdivia'),
    -- 15 Arica y Parinacota (4)
    ('15', 'Arica'), ('15', 'Camarones'), ('15', 'General Lagos'), ('15', 'Putre'),
    -- 16 Ñuble (21)
    ('16', 'Bulnes'), ('16', 'Chillán'), ('16', 'Chillán Viejo'), ('16', 'Cobquecura'),
    ('16', 'Coelemu'), ('16', 'Coihueco'), ('16', 'El Carmen'), ('16', 'Ninhue'),
    ('16', 'Ñiquén'), ('16', 'Pemuco'), ('16', 'Pinto'), ('16', 'Portezuelo'),
    ('16', 'Quillón'), ('16', 'Quirihue'), ('16', 'Ránquil'), ('16', 'San Carlos'),
    ('16', 'San Fabián'), ('16', 'San Ignacio'), ('16', 'San Nicolás'),
    ('16', 'Trehuaco'), ('16', 'Yungay')
) AS cd (region_code, name)
JOIN regions   rl ON rl.ine_code = cd.region_code
JOIN provinces pl ON pl.region_id = rl.id
ON CONFLICT (ine_code) DO NOTHING;
