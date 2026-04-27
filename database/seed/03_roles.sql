-- =============================================================================
-- SURP 2.0 — seed/03_roles.sql
--
-- Roles base del sistema con `is_system=true`. Asignación de permisos por rol.
--
-- Idempotente:
--   - Roles: ON CONFLICT (name) DO NOTHING.
--   - Permisos: ON CONFLICT (role_id, permission_id) DO NOTHING.
--
-- Convención de scope:
--   - principal_only         — usuarios de Arauco
--   - security_provider_only — empresas de seguridad contratistas
--   - api_consumer_only      — consumidores de la API externa
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles base (AUTHORIZATION.md §4)
-- -----------------------------------------------------------------------------

INSERT INTO roles (name, description, scope, is_system) VALUES
  ('administrator',     'Administrador del sistema. Todos los permisos.',                                      'principal_only',         true),
  ('patrimonial_admin', 'Jefe URP. CRUD incidentes/denuncias/personas/vehículos + lectura de causas.',         'principal_only',         true),
  ('patrimonial',       'Personal URP. CRUD incidentes/denuncias/personas/vehículos.',                        'principal_only',         true),
  ('lawyer_admin',      'Abogado administrador. Asigna abogados, ve todas las causas.',                       'principal_only',         true),
  ('lawyer',            'Abogado interno. CRUD sobre causas asignadas.',                                      'principal_only',         true),
  ('field_lawyer',      'Abogado de terreno. Funcionalidades en zona + lectura de incidentes.',               'principal_only',         true),
  ('external_lawyer',   'Abogado externo contratado. Auditoría reforzada.',                                   'principal_only',         true),
  ('fires_specialist',  'Especialista en incendios.',                                                          'principal_only',         true),
  ('surveillance',      'Personal de vigilancia. Patrullajes y tracking.',                                     'principal_only',         true),
  ('viewer',            'Solo lectura. Sin acceso a MAAT ni causas sensibles.',                                'principal_only',         true),
  ('queries_maat',      'Consultas MAAT y bloqueos.',                                                          'principal_only',         true),
  ('company_admin',     'Administrador de empresa de seguridad. Gestiona sus usuarios.',                       'security_provider_only', true),
  ('guard',             'Guardia. CRUD incidentes/denuncias en zonas asignadas.',                              'security_provider_only', true),
  ('api_blocks_check',  'Solo consulta de bloqueos vía API.',                                                  'api_consumer_only',      true)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Asignación de permisos por rol.
--
-- Se ejecuta en bloque DO para resolver IDs por nombre/code y aplicar la N:M.
-- ON CONFLICT preserva ediciones manuales del admin sobre permisos custom.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_role_id   BIGINT;
  v_perm_id   BIGINT;
  v_role_name TEXT;
  v_perm_code TEXT;
  v_pairs     TEXT[][] := ARRAY[
    -- ----------------------------------------------------------------------
    -- administrator — todos los permisos
    -- (se resuelve abajo con un INSERT especial; aquí no listamos)
    -- ----------------------------------------------------------------------

    -- ----------------------------------------------------------------------
    -- patrimonial_admin
    -- ----------------------------------------------------------------------
    ARRAY['patrimonial_admin', 'incidents.incidents.read'],
    ARRAY['patrimonial_admin', 'incidents.incidents.create'],
    ARRAY['patrimonial_admin', 'incidents.incidents.update'],
    ARRAY['patrimonial_admin', 'incidents.incidents.void'],
    ARRAY['patrimonial_admin', 'incidents.incidents.set_semaforo'],
    ARRAY['patrimonial_admin', 'incidents.evidence.upload'],
    ARRAY['patrimonial_admin', 'incidents.evidence.download'],
    ARRAY['patrimonial_admin', 'complaints.complaints.read'],
    ARRAY['patrimonial_admin', 'complaints.complaints.create'],
    ARRAY['patrimonial_admin', 'complaints.complaints.update'],
    ARRAY['patrimonial_admin', 'cases.cases.read'],
    ARRAY['patrimonial_admin', 'cases.milestones.read'],
    ARRAY['patrimonial_admin', 'persons.persons.read'],
    ARRAY['patrimonial_admin', 'persons.persons.create'],
    ARRAY['patrimonial_admin', 'persons.persons.update'],
    ARRAY['patrimonial_admin', 'persons.imputados.read'],
    ARRAY['patrimonial_admin', 'vehicles.vehicles.read'],
    ARRAY['patrimonial_admin', 'vehicles.vehicles.create'],
    ARRAY['patrimonial_admin', 'vehicles.vehicles.update'],
    ARRAY['patrimonial_admin', 'queries.blocks.check'],
    ARRAY['patrimonial_admin', 'blocks.blocks.read'],
    ARRAY['patrimonial_admin', 'blocks.blocks.grant'],
    ARRAY['patrimonial_admin', 'blocks.blocks.revoke'],
    ARRAY['patrimonial_admin', 'maat.records.read'],
    ARRAY['patrimonial_admin', 'reports.reports.read'],
    ARRAY['patrimonial_admin', 'reports.reports.export'],

    -- ----------------------------------------------------------------------
    -- patrimonial
    -- ----------------------------------------------------------------------
    ARRAY['patrimonial', 'incidents.incidents.read'],
    ARRAY['patrimonial', 'incidents.incidents.create'],
    ARRAY['patrimonial', 'incidents.incidents.update'],
    ARRAY['patrimonial', 'incidents.evidence.upload'],
    ARRAY['patrimonial', 'incidents.evidence.download'],
    ARRAY['patrimonial', 'complaints.complaints.read'],
    ARRAY['patrimonial', 'complaints.complaints.create'],
    ARRAY['patrimonial', 'cases.cases.read'],
    ARRAY['patrimonial', 'persons.persons.read'],
    ARRAY['patrimonial', 'persons.persons.create'],
    ARRAY['patrimonial', 'persons.persons.update'],
    ARRAY['patrimonial', 'vehicles.vehicles.read'],
    ARRAY['patrimonial', 'vehicles.vehicles.create'],
    ARRAY['patrimonial', 'vehicles.vehicles.update'],
    ARRAY['patrimonial', 'queries.blocks.check'],
    ARRAY['patrimonial', 'blocks.blocks.read'],

    -- ----------------------------------------------------------------------
    -- lawyer_admin
    -- ----------------------------------------------------------------------
    ARRAY['lawyer_admin', 'cases.cases.read'],
    ARRAY['lawyer_admin', 'cases.cases.create'],
    ARRAY['lawyer_admin', 'cases.cases.update'],
    ARRAY['lawyer_admin', 'cases.cases.assign_lawyer'],
    ARRAY['lawyer_admin', 'cases.cases.reopen'],
    ARRAY['lawyer_admin', 'cases.milestones.read'],
    ARRAY['lawyer_admin', 'cases.milestones.create'],
    ARRAY['lawyer_admin', 'incidents.incidents.read'],
    ARRAY['lawyer_admin', 'complaints.complaints.read'],
    ARRAY['lawyer_admin', 'persons.persons.read'],
    ARRAY['lawyer_admin', 'persons.imputados.read'],
    ARRAY['lawyer_admin', 'reports.reports.read'],
    ARRAY['lawyer_admin', 'reports.reports.export'],

    -- ----------------------------------------------------------------------
    -- lawyer / field_lawyer / external_lawyer
    -- ----------------------------------------------------------------------
    ARRAY['lawyer', 'cases.cases.read'],
    ARRAY['lawyer', 'cases.cases.update'],
    ARRAY['lawyer', 'cases.milestones.read'],
    ARRAY['lawyer', 'cases.milestones.create'],
    ARRAY['lawyer', 'incidents.incidents.read'],
    ARRAY['lawyer', 'complaints.complaints.read'],
    ARRAY['lawyer', 'persons.persons.read'],
    ARRAY['lawyer', 'persons.imputados.read'],

    ARRAY['field_lawyer', 'cases.cases.read'],
    ARRAY['field_lawyer', 'cases.cases.update'],
    ARRAY['field_lawyer', 'cases.milestones.read'],
    ARRAY['field_lawyer', 'cases.milestones.create'],
    ARRAY['field_lawyer', 'incidents.incidents.read'],
    ARRAY['field_lawyer', 'complaints.complaints.read'],
    ARRAY['field_lawyer', 'persons.persons.read'],
    ARRAY['field_lawyer', 'persons.imputados.read'],

    ARRAY['external_lawyer', 'cases.cases.read'],
    ARRAY['external_lawyer', 'cases.cases.update'],
    ARRAY['external_lawyer', 'cases.milestones.read'],
    ARRAY['external_lawyer', 'cases.milestones.create'],
    ARRAY['external_lawyer', 'incidents.incidents.read'],
    ARRAY['external_lawyer', 'complaints.complaints.read'],
    ARRAY['external_lawyer', 'persons.persons.read'],
    ARRAY['external_lawyer', 'persons.imputados.read'],

    -- ----------------------------------------------------------------------
    -- fires_specialist
    -- ----------------------------------------------------------------------
    ARRAY['fires_specialist', 'incidents.incidents.read'],
    ARRAY['fires_specialist', 'incidents.incidents.update'],
    ARRAY['fires_specialist', 'incidents.evidence.upload'],
    ARRAY['fires_specialist', 'incidents.evidence.download'],
    ARRAY['fires_specialist', 'complaints.complaints.read'],
    ARRAY['fires_specialist', 'reports.reports.read'],

    -- ----------------------------------------------------------------------
    -- surveillance
    -- ----------------------------------------------------------------------
    ARRAY['surveillance', 'incidents.incidents.read'],
    ARRAY['surveillance', 'incidents.incidents.create'],
    ARRAY['surveillance', 'incidents.evidence.upload'],
    ARRAY['surveillance', 'reports.reports.read'],

    -- ----------------------------------------------------------------------
    -- viewer (solo lectura básica)
    -- ----------------------------------------------------------------------
    ARRAY['viewer', 'incidents.incidents.read'],
    ARRAY['viewer', 'complaints.complaints.read'],
    ARRAY['viewer', 'persons.persons.read'],
    ARRAY['viewer', 'vehicles.vehicles.read'],
    ARRAY['viewer', 'reports.reports.read'],

    -- ----------------------------------------------------------------------
    -- queries_maat
    -- ----------------------------------------------------------------------
    ARRAY['queries_maat', 'maat.records.read'],
    ARRAY['queries_maat', 'queries.blocks.check'],
    ARRAY['queries_maat', 'persons.persons.read'],

    -- ----------------------------------------------------------------------
    -- company_admin (security_provider)
    -- ----------------------------------------------------------------------
    ARRAY['company_admin', 'incidents.incidents.read'],
    ARRAY['company_admin', 'incidents.incidents.create'],
    ARRAY['company_admin', 'incidents.incidents.update'],
    ARRAY['company_admin', 'incidents.evidence.upload'],
    ARRAY['company_admin', 'incidents.evidence.download'],
    ARRAY['company_admin', 'complaints.complaints.read'],
    ARRAY['company_admin', 'complaints.complaints.create'],
    ARRAY['company_admin', 'persons.persons.read'],
    ARRAY['company_admin', 'persons.persons.create'],
    ARRAY['company_admin', 'persons.persons.update'],
    ARRAY['company_admin', 'vehicles.vehicles.read'],
    ARRAY['company_admin', 'vehicles.vehicles.create'],
    ARRAY['company_admin', 'users.users.manage'],
    ARRAY['company_admin', 'reports.reports.read'],

    -- ----------------------------------------------------------------------
    -- guard
    -- ----------------------------------------------------------------------
    ARRAY['guard', 'incidents.incidents.read'],
    ARRAY['guard', 'incidents.incidents.create'],
    ARRAY['guard', 'incidents.incidents.update'],
    ARRAY['guard', 'incidents.evidence.upload'],
    ARRAY['guard', 'incidents.evidence.download'],
    ARRAY['guard', 'complaints.complaints.create'],
    ARRAY['guard', 'persons.persons.read'],
    ARRAY['guard', 'persons.persons.create'],
    ARRAY['guard', 'vehicles.vehicles.read'],
    ARRAY['guard', 'vehicles.vehicles.create'],

    -- ----------------------------------------------------------------------
    -- api_blocks_check (api_consumer)
    -- ----------------------------------------------------------------------
    ARRAY['api_blocks_check', 'queries.blocks.check']
  ];
  v_pair TEXT[];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    v_role_name := v_pair[1];
    v_perm_code := v_pair[2];

    SELECT id INTO v_role_id FROM roles WHERE name = v_role_name;
    SELECT id INTO v_perm_id FROM permissions WHERE code = v_perm_code;

    IF v_role_id IS NULL THEN
      RAISE WARNING 'rol % no existe — omitido', v_role_name;
      CONTINUE;
    END IF;
    IF v_perm_id IS NULL THEN
      RAISE WARNING 'permiso % no existe — omitido (asignación a %)', v_perm_code, v_role_name;
      CONTINUE;
    END IF;

    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. administrator obtiene TODOS los permisos.
-- -----------------------------------------------------------------------------

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;
