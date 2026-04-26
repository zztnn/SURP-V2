-- =============================================================================
-- SURP 2.0 — seed/05_cases_catalogs.sql
--
-- Seed de los 8 catálogos fijos del módulo cases.
-- Idempotente: ON CONFLICT (code) DO NOTHING.
--
-- Para el catálogo case_milestone_types combinamos:
--   - Los 48 valores del enum NombreHito del legacy (surp-legacy) — códigos
--     normalizados a SNAKE_CASE_UPPER, typos corregidos, duplicados consolidados.
--   - Hitos procesales nuevos necesarios para el flujo SURP 2.0 (formalización,
--     cierre de investigación, notificaciones, decisiones post-cierre, etc.)
--     que gatillan plazos legales del CPP.
--
-- Los catálogos courts, prosecutor_offices y prosecutors NO se siembran aquí —
-- se hacen en seed/08_courts_prosecutors_seed.sql (Ola 4) tras confirmación
-- del equipo URP sobre la lista real de tribunales y fiscalías prioritarias.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. case_matters
-- -----------------------------------------------------------------------------

INSERT INTO case_matters (code, name, description, order_index, is_system) VALUES
  ('PENAL',  'Penal',                    'Materia penal: CP + leyes especiales (Ley 21.013 madera, Ley 20.283 bosques, Ley 21.633 usurpación, Ley 17.798 armas, Ley 21.577 crimen organizado)', 10, true),
  ('CIVIL',  'Civil',                    'Materia civil: responsabilidad extracontractual (CC arts. 2314 y ss.), cobranzas, indemnizaciones', 20, true),
  ('ADMIN',  'Contencioso administrativo', 'Procedimientos sancionatorios CONAF, SAG, SMA con reclamación judicial ante juez de letras civil', 30, true),
  ('CONST',  'Constitucional',           'Recursos de protección, amparo (CPR art. 20)', 40, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. case_milestone_types — 56 filas (48 legacy normalizados + 8 nuevos SURP 2.0)
-- -----------------------------------------------------------------------------

-- Categoría: judicial (hitos ante tribunal)
INSERT INTO case_milestone_types (code, name, description, category, applicable_to_matter, auto_advances_stage_to, order_index, is_system) VALUES
  -- Actos iniciales / preparatorios
  ('CITACION_TRIBUNAL',             'Citación del tribunal',           'Citación emitida por el tribunal a las partes',                 'judicial', NULL, NULL, 10, true),
  ('AUDIENCIA',                     'Audiencia (genérica)',            'Hito genérico. Preferir registrar audiencias en case_hearings', 'judicial', NULL, NULL, 20, true),
  ('FIJA_AUDIENCIA',                'Fija audiencia',                  'El tribunal fija una audiencia',                                'judicial', NULL, NULL, 30, true),
  ('SOLICITA_AUDIENCIA',            'Solicita audiencia',              'Parte solicita audiencia',                                      'judicial', NULL, NULL, 40, true),
  ('SOLICITA_CAMBIO_FECHA',         'Solicita cambio de fecha',        'Parte solicita reprogramación',                                 'judicial', NULL, NULL, 50, true),

  -- Diligencias y accesos
  ('ACCEDE_DILIGENCIAS',            'Accede a diligencias',            'Tribunal accede a las diligencias solicitadas',                 'judicial', NULL, NULL, 60, true),
  ('CONCEDE_COPIA',                 'Concede copia',                   'El tribunal concede copia solicitada',                          'judicial', NULL, NULL, 70, true),
  ('SOLICITA_COPIA_PARCIAL',        'Solicita copia parcial',          NULL,                                                            'judicial', NULL, NULL, 80, true),
  ('SOLICITA_ANTECEDENTES',         'Solicita antecedentes',           NULL,                                                            'judicial', NULL, NULL, 90, true),

  -- Parte y personería
  ('SE_HACE_PARTE',                 'Se hace parte',                   NULL,                                                            'judicial', NULL, NULL, 100, true),
  ('PATROCINIO_PODER',              'Patrocinio y poder',              'Constitución de patrocinio y poder',                            'judicial', NULL, NULL, 110, true),
  ('TENGASE_PRESENTE',              'Téngase presente',                NULL,                                                            'judicial', NULL, NULL, 120, true),
  ('TENGASE_ADHERIDO_ACUSACION',    'Téngase adherido a la acusación', 'Consolidación de los 2 valores duplicados del legacy (404/405)', 'judicial', 'PENAL', NULL, 130, true),

  -- Incidencias
  ('TERCERIA',                      'Tercería',                        NULL,                                                            'judicial', NULL, NULL, 140, true),
  ('OPOSICION_TERCERIA',            'Oposición a tercería',            NULL,                                                            'judicial', NULL, NULL, 150, true),
  ('TRASLADO',                      'Traslado',                        NULL,                                                            'judicial', NULL, NULL, 160, true),
  ('REQUERIMIENTO',                 'Requerimiento',                   NULL,                                                            'judicial', NULL, NULL, 170, true),
  ('CUMPLE_ORDENADO',               'Cumple lo ordenado',              NULL,                                                            'judicial', NULL, NULL, 180, true),
  ('PREVIO_RESOLVER',               'Previo a resolver',               NULL,                                                            'judicial', NULL, NULL, 190, true),
  ('CERTIFICACION',                 'Certificación',                   NULL,                                                            'judicial', NULL, NULL, 200, true),
  ('NOTIFICA_EXHORTO',              'Notifica exhorto',                NULL,                                                            'judicial', NULL, NULL, 210, true),
  ('AGRUPACION_CAUSA',              'Agrupación de causas',            NULL,                                                            'judicial', NULL, NULL, 220, true),
  ('DECLARACION',                   'Declaración',                     NULL,                                                            'judicial', NULL, NULL, 230, true),
  ('COMUNICACION',                  'Comunicación',                    NULL,                                                            'judicial', NULL, NULL, 240, true),

  -- Alegatos / resolución
  ('DECLARA_ADMISIBLE_QUERELLA',    'Declara admisible querella',      'Juez declara admisible la querella',                            'judicial', 'PENAL', NULL, 250, true),
  ('ALEGATOS',                      'Alegatos',                        NULL,                                                            'judicial', NULL, NULL, 260, true),
  ('RESOLUCION',                    'Resolución (genérica)',           NULL,                                                            'judicial', NULL, NULL, 270, true),
  ('VISTA_CAUSA_ICA',               'Vista de la causa en ICA',        'Vista en Corte de Apelaciones',                                 'judicial', NULL, NULL, 280, true),
  ('FALLO',                         'Fallo',                           NULL,                                                            'judicial', NULL, NULL, 290, true),
  ('RECURSO_APELACION',             'Recurso de apelación',            NULL,                                                            'judicial', NULL, NULL, 300, true),

  -- NUEVOS SURP 2.0 — hitos procesales clave que gatillan plazos
  ('DENUNCIA_PRESENTADA',           'Denuncia presentada',             'Arauco (o jefe de predio) presentó la denuncia. Cumple plazo obligatorio 24h', 'judicial', 'PENAL', NULL, 305, true),
  ('FORMALIZATION',                 'Formalización',                   'Audiencia de formalización (CPP art. 229). Inicia plazo máximo 2 años de investigación. Cumple prescripción de la acción penal.', 'judicial', 'PENAL', 'investigation_formalized', 310, true),
  ('CIERRE_INVESTIGACION',          'Cierre de investigación',         'Cierre formal (CPP art. 247). Gatilla plazo de 10 días para decisión fiscal.', 'judicial', 'PENAL', NULL, 320, true),
  ('CITACION_APJO',                 'Citación a audiencia de preparación de juicio oral', 'Gatilla plazo de acción civil (15 días antes, CPP art. 60)', 'judicial', 'PENAL', NULL, 330, true),
  ('ORDEN_APERTURA_JUICIO_ORAL',    'Auto de apertura de juicio oral', NULL,                                                            'judicial', 'PENAL', 'oral_trial_prep', 340, true),
  ('NOTIFICACION_RESOLUCION_APELABLE', 'Notificación de resolución apelable', 'Notificación que gatilla plazo de apelación (5 días hábiles, CPP art. 366)', 'judicial', NULL, NULL, 350, true),
  ('NOTIFICACION_SENTENCIA_DEFINITIVA', 'Notificación de sentencia definitiva', 'Gatilla plazo de nulidad (10 días, CPP art. 372)', 'judicial', 'PENAL', NULL, 360, true),
  ('SENTENCIA_CONDENATORIA',        'Sentencia condenatoria',          NULL,                                                            'judicial', 'PENAL', 'sentence', 370, true),
  ('SENTENCIA_ABSOLUTORIA',         'Sentencia absolutoria',           NULL,                                                            'judicial', 'PENAL', 'sentence', 380, true)
ON CONFLICT (code) DO NOTHING;

-- Categoría: fiscalia (hitos ante el Ministerio Público)
INSERT INTO case_milestone_types (code, name, description, category, applicable_to_matter, auto_advances_stage_to, order_index, is_system) VALUES
  ('QUERELLA',                      'Querella',                        'Presentación de querella',                                      'fiscalia', 'PENAL', NULL, 1010, true),
  ('AMPLIACION_QUERELLA',           'Ampliación de querella',          NULL,                                                            'fiscalia', 'PENAL', NULL, 1020, true),
  ('ACUSACION',                     'Acusación',                       'Acusación del fiscal (CPP art. 248 b)',                         'fiscalia', 'PENAL', 'accusation', 1030, true),
  ('ADHESION_ACUSACION',            'Adhesión a la acusación',         NULL,                                                            'fiscalia', 'PENAL', NULL, 1040, true),
  ('SOLICITUD_FORMALIZACION',       'Solicitud de formalización',      NULL,                                                            'fiscalia', 'PENAL', NULL, 1050, true),
  ('ORDEN_INVESTIGAR',              'Orden de investigar',             NULL,                                                            'fiscalia', 'PENAL', NULL, 1060, true),
  ('ORDEN_DETENCION',               'Orden de detención',              NULL,                                                            'fiscalia', 'PENAL', NULL, 1070, true),
  ('SOLICITA_ENTREVISTA_FISCAL',    'Solicita entrevista con fiscal',  'Consolidación de los 2 valores duplicados del legacy',           'fiscalia', 'PENAL', NULL, 1080, true),
  ('ENTREVISTA',                    'Entrevista',                      NULL,                                                            'fiscalia', 'PENAL', NULL, 1090, true),
  ('FIJA_FECHA_ENTREVISTA',         'Fija fecha de entrevista',        NULL,                                                            'fiscalia', 'PENAL', NULL, 1100, true),
  ('APORTE_ANTECEDENTES',           'Aporte de antecedentes',          NULL,                                                            'fiscalia', 'PENAL', NULL, 1110, true),
  ('SOLICITA_DILIGENCIAS_INVESTIGACION', 'Solicita diligencias de investigación', NULL,                                                  'fiscalia', 'PENAL', NULL, 1120, true),
  ('SOLICITA_COPIA_CARPETA_ADMINISTRATIVA', 'Solicita copia de carpeta administrativa', NULL,                                            'fiscalia', 'PENAL', NULL, 1130, true),
  ('SOLICITA_DEVOLUCION_ESPECIES',  'Solicita devolución de especies', NULL,                                                            'fiscalia', 'PENAL', NULL, 1140, true),
  ('AGRUPACION_INVESTIGACION',      'Agrupación de investigación',     NULL,                                                            'fiscalia', 'PENAL', NULL, 1150, true),

  -- NUEVOS SURP 2.0 — decisiones post-cierre del fiscal (CPP art. 248)
  ('SOBRESEIMIENTO_DEFINITIVO',     'Sobreseimiento definitivo',       'Cierre por sobreseimiento (CPP art. 250)',                      'fiscalia', 'PENAL', 'closed', 1160, true),
  ('SOBRESEIMIENTO_TEMPORAL',       'Sobreseimiento temporal',         'Sobreseimiento temporal (CPP art. 252)',                        'fiscalia', 'PENAL', NULL, 1170, true),
  ('NO_PERSEVERAR',                 'Comunicación de no perseverar',   'Fiscal comunica no perseverar (CPP art. 248 c)',                'fiscalia', 'PENAL', 'closed', 1180, true),
  ('ACUERDO_REPARATORIO',           'Acuerdo reparatorio',             'Aprobado por el juez (CPP art. 241)',                           'fiscalia', 'PENAL', 'closed', 1190, true),
  ('SUSPENSION_CONDICIONAL',        'Suspensión condicional',          'Procedimiento suspendido bajo condiciones (CPP art. 237)',      'fiscalia', 'PENAL', NULL, 1200, true)
ON CONFLICT (code) DO NOTHING;

-- Categoría: administrativo (policial + CONAF)
INSERT INTO case_milestone_types (code, name, description, category, applicable_to_matter, auto_advances_stage_to, order_index, is_system) VALUES
  ('DENUNCIA_POLICIAL',             'Denuncia policial',               NULL,                                                            'administrativo', NULL, NULL, 2010, true),
  ('PARTE_POLICIAL',                'Parte policial',                  NULL,                                                            'administrativo', NULL, NULL, 2020, true),
  ('PROCEDIMIENTO_POLICIAL',        'Procedimiento policial',          NULL,                                                            'administrativo', NULL, NULL, 2030, true),
  ('INFORME_MAXCON',                'Informe Maxcon',                  'Informe de la empresa de seguridad (legacy histórico)',         'administrativo', NULL, NULL, 2040, true),
  ('DENUNCIA_DIRECTA',              'Denuncia directa',                NULL,                                                            'administrativo', NULL, NULL, 2050, true),

  -- NUEVOS SURP 2.0 — flujo CONAF
  ('NOTIFICACION_RESOLUCION_CONAF', 'Notificación de resolución CONAF', 'Gatilla plazo de reclamación administrativa CONAF (30 días, Ley 20.283 art. 24)', 'administrativo', 'ADMIN', NULL, 2060, true),
  ('RECLAMACION_CONAF_PRESENTADA',  'Reclamación CONAF presentada',    'Cumple plazo de reclamación administrativa',                    'administrativo', 'ADMIN', NULL, 2070, true)
ON CONFLICT (code) DO NOTHING;

-- Categoría: interno_arauco (eventos del equipo legal Arauco)
INSERT INTO case_milestone_types (code, name, description, category, applicable_to_matter, auto_advances_stage_to, order_index, is_system) VALUES
  ('ASIGNACION_ABOGADO',            'Asignación de abogado',           'Abogado asignado a la causa (registro automático)',             'interno_arauco', NULL, NULL, 3010, true),
  ('CAMBIO_ABOGADO_TITULAR',        'Cambio de abogado titular',       'Reasignación del titular de la causa',                          'interno_arauco', NULL, NULL, 3020, true),
  ('REVISION_INTERNA',              'Revisión interna',                'Revisión por Abogado Administrador',                            'interno_arauco', NULL, NULL, 3030, true),
  ('INFORME_URP',                   'Informe a URP',                   'Informe interno a la Unidad de Resguardo Patrimonial',          'interno_arauco', NULL, NULL, 3040, true)
ON CONFLICT (code) DO NOTHING;

-- Categoría: otros
INSERT INTO case_milestone_types (code, name, description, category, applicable_to_matter, auto_advances_stage_to, order_index, is_system) VALUES
  ('OTROS',                         'Otros',                           'Hito no clasificado',                                           'otros', NULL, NULL, 9999, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. case_hearing_types — 12 tipos de audiencia
-- -----------------------------------------------------------------------------

INSERT INTO case_hearing_types (code, name, description, applicable_to_matter, order_index, is_system) VALUES
  ('CONTROL_DETENCION',     'Control de detención',                       'Audiencia dentro de 24h de la detención (CPP art. 131)',           'PENAL', 10, true),
  ('FORMALIZACION',         'Audiencia de formalización',                 'CPP art. 229. Inicia plazo máximo 2 años de investigación',        'PENAL', 20, true),
  ('CAUTELAR',              'Audiencia cautelar',                         'Decreta o sustituye medidas cautelares (CPP arts. 122-156)',       'PENAL', 30, true),
  ('CIERRE_INVESTIGACION',  'Audiencia de cierre de investigación',       'CPP art. 247',                                                     'PENAL', 40, true),
  ('PREP_JUICIO_ORAL',      'Audiencia de preparación de juicio oral (APJO)', 'CPP arts. 260-280',                                            'PENAL', 50, true),
  ('JUICIO_ORAL',           'Juicio oral',                                'CPP arts. 281-351',                                                'PENAL', 60, true),
  ('LECTURA_SENTENCIA',     'Lectura de sentencia',                       'CPP arts. 339-351',                                                'PENAL', 70, true),
  ('VISTA_APELACION_ICA',   'Vista de la causa en ICA (apelación)',       'Vista del recurso de apelación en Corte de Apelaciones',           NULL,    80, true),
  ('VISTA_NULIDAD',         'Vista de recurso de nulidad',                'Vista del recurso de nulidad',                                     'PENAL', 90, true),
  ('AUDIENCIA_CIVIL',       'Audiencia civil',                            'Audiencias del procedimiento civil',                               'CIVIL', 100, true),
  ('ALEGATOS',              'Alegatos',                                   NULL,                                                               NULL,    110, true),
  ('OTRA',                  'Otra',                                       'Audiencia no clasificada',                                         NULL,    9999, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. case_resolution_types — 10 tipos
-- -----------------------------------------------------------------------------

INSERT INTO case_resolution_types (code, name, description, is_appealable, is_subject_to_replevin, is_subject_to_nullity, order_index, is_system) VALUES
  ('SENTENCIA_CONDENATORIA',    'Sentencia condenatoria',         'Sentencia que condena al imputado',                  true,  false, true,  10, true),
  ('SENTENCIA_ABSOLUTORIA',     'Sentencia absolutoria',          'Sentencia que absuelve al imputado',                 true,  false, true,  20, true),
  ('SOBRESEIMIENTO_DEFINITIVO', 'Sobreseimiento definitivo',      'CPP art. 250',                                       true,  false, false, 30, true),
  ('SOBRESEIMIENTO_TEMPORAL',   'Sobreseimiento temporal',        'CPP art. 252',                                       true,  false, false, 40, true),
  ('RESOLUCION_CAUTELAR',       'Resolución cautelar',            'Resolución que decreta o modifica cautelar',         true,  true,  false, 50, true),
  ('AUTO_APERTURA_JUICIO_ORAL', 'Auto de apertura de juicio oral', NULL,                                                true,  false, false, 60, true),
  ('RESOLUCION_INTERLOCUTORIA', 'Resolución interlocutoria',      'Resolución que se pronuncia sobre incidente',        true,  true,  false, 70, true),
  ('DECRETO',                   'Decreto',                        'Provee mero trámite',                                false, true,  false, 80, true),
  ('RESOLUCION_ICA',            'Resolución de Corte de Apelaciones', NULL,                                             false, false, false, 90, true),
  ('RESOLUCION_CS',             'Resolución de Corte Suprema',    NULL,                                                 false, false, false, 100, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. case_appeal_types — 6 tipos
-- -----------------------------------------------------------------------------

INSERT INTO case_appeal_types (code, name, description, applicable_against, order_index, is_system) VALUES
  ('APELACION',      'Apelación',                'Recurso de apelación (CPP art. 366)',                  'Resoluciones del Juzgado de Garantía declaradas apelables', 10, true),
  ('REPOSICION',     'Reposición',               'Recurso de reposición (CPP art. 362)',                 'Resoluciones interlocutorias y decretos',                    20, true),
  ('NULIDAD',        'Recurso de nulidad',       'Recurso de nulidad (CPP arts. 372-387)',               'Sentencias definitivas del Tribunal Oral',                   30, true),
  ('CASACION_FORMA', 'Casación en la forma',     'Recurso de casación en la forma (CPC arts. 766-808)',  'Sentencias civiles definitivas',                             40, true),
  ('CASACION_FONDO', 'Casación en el fondo',     'Recurso de casación en el fondo (CPC arts. 767-808)',  'Sentencias civiles definitivas',                             50, true),
  ('QUEJA',          'Recurso de queja',         'Recurso de queja (COT art. 545)',                      'Faltas o abusos graves de tribunales inferiores',            60, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. case_party_roles — 15 roles procesales
-- -----------------------------------------------------------------------------

INSERT INTO case_party_roles (code, name, description, applicable_to_matter, is_defendant, order_index, is_system) VALUES
  ('QUERELLANTE',          'Querellante',                       'Quien presenta querella (CPP art. 111)',                          'PENAL', false, 10, true),
  ('QUERELLADO',           'Querellado',                        NULL,                                                              'PENAL', true,  20, true),
  ('IMPUTADO',             'Imputado',                          'Persona contra quien se dirige la investigación',                 'PENAL', true,  30, true),
  ('DENUNCIADO_INCERTUS',  'Denunciado/imputado incertus',      'Imputado sin identificación al momento del registro',             'PENAL', true,  40, true),
  ('DEFENSOR',             'Defensor',                          'Defensor del imputado',                                           'PENAL', false, 50, true),
  ('VICTIMA',              'Víctima',                           NULL,                                                              'PENAL', false, 60, true),
  ('TESTIGO',              'Testigo',                           NULL,                                                              NULL,    false, 70, true),
  ('PERITO',               'Perito',                            NULL,                                                              NULL,    false, 80, true),
  ('DENUNCIANTE',          'Denunciante',                       'Quien presenta la denuncia (no es interviniente, CPP art. 173)',  'PENAL', false, 90, true),
  ('DEMANDANTE',           'Demandante',                        NULL,                                                              'CIVIL', false, 100, true),
  ('DEMANDADO',            'Demandado',                         NULL,                                                              'CIVIL', true,  110, true),
  ('TERCERO_COADYUVANTE',  'Tercero coadyuvante',               NULL,                                                              'CIVIL', false, 120, true),
  ('RECURRENTE',           'Recurrente',                        'Recurrente en sede constitucional o administrativa',              'CONST', false, 130, true),
  ('RECURRIDO',            'Recurrido',                         NULL,                                                              'CONST', true,  140, true),
  ('FISCALIZADO',          'Fiscalizado',                       'Persona/empresa fiscalizada por CONAF/SAG/SMA',                   'ADMIN', true,  150, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 7. case_attorney_roles — 5 roles del equipo legal
-- -----------------------------------------------------------------------------

INSERT INTO case_attorney_roles (code, name, description, order_index, is_system) VALUES
  ('TITULAR',     'Titular',     'Abogado responsable principal de la causa. Único vigente por causa.', 10, true),
  ('SECUNDARIO',  'Secundario',  'Abogado de apoyo',                                                    20, true),
  ('SUPERVISOR',  'Supervisor',  'Abogado Administrador supervisando la causa',                         30, true),
  ('PASANTE',     'Pasante',     'Pasante apoyando al equipo',                                          40, true),
  ('EXTERNO',     'Externo',     'Abogado de estudio jurídico externo contratado',                      50, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 8. case_document_types — 8 tipos de documento
-- -----------------------------------------------------------------------------

INSERT INTO case_document_types (code, name, description, is_evidence, is_sensitive, order_index, is_system) VALUES
  ('QUERELLA',                'Querella',                       'Escrito de querella',                              false, false, 10, true),
  ('AMPLIACION_QUERELLA',     'Ampliación de querella',         NULL,                                               false, false, 20, true),
  ('ESCRITO',                 'Escrito procesal',               'Escrito genérico presentado al tribunal',          false, false, 30, true),
  ('RESOLUCION',              'Resolución',                     'Resolución del tribunal',                          false, false, 40, true),
  ('ACTA_AUDIENCIA',          'Acta de audiencia',              NULL,                                               false, false, 50, true),
  ('PRUEBA',                  'Prueba',                         'Documento ofrecido como prueba',                   true,  false, 60, true),
  ('CARPETA_INVESTIGACION',   'Carpeta de investigación',       'Carpeta de la investigación fiscal',               true,  true,  70, true),
  ('OTRO',                    'Otro',                           NULL,                                               false, false, 9999, true)
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 9. Verificación final
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_matters INT;
  v_milestones INT;
  v_hearings INT;
  v_resolutions INT;
  v_appeals INT;
  v_party_roles INT;
  v_attorney_roles INT;
  v_doc_types INT;
BEGIN
  SELECT count(*) INTO v_matters         FROM case_matters         WHERE is_system = true;
  SELECT count(*) INTO v_milestones      FROM case_milestone_types WHERE is_system = true;
  SELECT count(*) INTO v_hearings        FROM case_hearing_types   WHERE is_system = true;
  SELECT count(*) INTO v_resolutions     FROM case_resolution_types WHERE is_system = true;
  SELECT count(*) INTO v_appeals         FROM case_appeal_types    WHERE is_system = true;
  SELECT count(*) INTO v_party_roles     FROM case_party_roles     WHERE is_system = true;
  SELECT count(*) INTO v_attorney_roles  FROM case_attorney_roles  WHERE is_system = true;
  SELECT count(*) INTO v_doc_types       FROM case_document_types  WHERE is_system = true;

  IF v_matters         < 4  THEN RAISE EXCEPTION 'seed/05: case_matters incompleto (%)', v_matters; END IF;
  IF v_milestones      < 50 THEN RAISE EXCEPTION 'seed/05: case_milestone_types incompleto (%)', v_milestones; END IF;
  IF v_hearings        < 12 THEN RAISE EXCEPTION 'seed/05: case_hearing_types incompleto (%)', v_hearings; END IF;
  IF v_resolutions     < 10 THEN RAISE EXCEPTION 'seed/05: case_resolution_types incompleto (%)', v_resolutions; END IF;
  IF v_appeals         < 6  THEN RAISE EXCEPTION 'seed/05: case_appeal_types incompleto (%)', v_appeals; END IF;
  IF v_party_roles     < 15 THEN RAISE EXCEPTION 'seed/05: case_party_roles incompleto (%)', v_party_roles; END IF;
  IF v_attorney_roles  < 5  THEN RAISE EXCEPTION 'seed/05: case_attorney_roles incompleto (%)', v_attorney_roles; END IF;
  IF v_doc_types       < 8  THEN RAISE EXCEPTION 'seed/05: case_document_types incompleto (%)', v_doc_types; END IF;

  RAISE NOTICE 'seed/05 OK — matters=% milestones=% hearings=% resolutions=% appeals=% party_roles=% attorney_roles=% doc_types=%',
    v_matters, v_milestones, v_hearings, v_resolutions, v_appeals, v_party_roles, v_attorney_roles, v_doc_types;
END;
$$;
