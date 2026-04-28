-- =============================================================================
-- SURP 2.0 — seed/02_permissions.sql
--
-- Catálogo de permisos del sistema. Sincronizado por la API en arranque
-- (`apps/api/src/auth/permissions.catalog.ts`); este seed es la pre-carga
-- para que la BD pueda funcionar antes de levantar la API.
--
-- Idempotente: ON CONFLICT (code) DO NOTHING preserva edits manuales del
-- admin (aunque permissions NO debería editarse en UI — es catálogo de código).
--
-- Convención del code: `modulo.recurso.accion`. is_sensitive=true marca
-- permisos cuya invocación se audita como lectura sensible (ADR-B-009).
-- =============================================================================

INSERT INTO permissions (code, module, resource, action, description, is_sensitive) VALUES
  -- ---------------------------------------------------------------------------
  -- incidents
  -- ---------------------------------------------------------------------------
  ('incidents.incidents.read',         'incidents', 'incidents', 'read',         'Leer incidentes', false),
  ('incidents.incidents.create',       'incidents', 'incidents', 'create',       'Crear incidentes', false),
  ('incidents.incidents.update',       'incidents', 'incidents', 'update',       'Actualizar incidentes (informe URP)', false),
  ('incidents.incidents.void',         'incidents', 'incidents', 'void',         'Anular incidentes (mantiene correlativo)', false),
  ('incidents.incidents.set_semaforo', 'incidents', 'incidents', 'set_semaforo', 'Modificar semáforo URP', false),
  ('incidents.evidence.upload',        'incidents', 'evidence',  'upload',       'Subir evidencia', false),
  ('incidents.evidence.download',      'incidents', 'evidence',  'download',     'Descargar evidencia (auditado)', true),

  -- ---------------------------------------------------------------------------
  -- complaints (denuncias)
  -- ---------------------------------------------------------------------------
  ('complaints.complaints.read',   'complaints', 'complaints', 'read',   'Leer denuncias', false),
  ('complaints.complaints.create', 'complaints', 'complaints', 'create', 'Presentar denuncias', false),
  ('complaints.complaints.update', 'complaints', 'complaints', 'update', 'Actualizar denuncias', false),

  -- ---------------------------------------------------------------------------
  -- cases (causas judiciales — solo `principal`)
  -- ---------------------------------------------------------------------------
  ('cases.cases.read',          'cases', 'cases',     'read',          'Leer causas', true),
  ('cases.cases.create',        'cases', 'cases',     'create',        'Iniciar causa (presentar querella)', false),
  ('cases.cases.update',        'cases', 'cases',     'update',        'Actualizar causa', false),
  ('cases.cases.assign_lawyer', 'cases', 'cases',     'assign_lawyer', 'Asignar abogado a causa', true),
  ('cases.cases.reopen',        'cases', 'cases',     'reopen',        'Reabrir causa cerrada', true),
  ('cases.milestones.create',   'cases', 'milestones','create',        'Registrar hitos procesales', false),
  ('cases.milestones.read',     'cases', 'milestones','read',          'Leer hitos procesales', true),

  -- ---------------------------------------------------------------------------
  -- persons / parties
  -- ---------------------------------------------------------------------------
  ('persons.persons.read',        'persons', 'persons',   'read',  'Leer personas', false),
  ('persons.persons.create',      'persons', 'persons',   'create','Crear personas', false),
  ('persons.persons.update',      'persons', 'persons',   'update','Actualizar personas', false),
  ('persons.persons.merge',       'persons', 'persons',   'merge', 'Fusionar duplicados (solo Administrador)', true),
  ('persons.imputados.read',      'persons', 'imputados', 'read',  'Leer datos de imputados (sensible)', true),

  -- ---------------------------------------------------------------------------
  -- vehicles
  -- ---------------------------------------------------------------------------
  ('vehicles.vehicles.read',   'vehicles', 'vehicles', 'read',   'Leer vehículos', false),
  ('vehicles.vehicles.create', 'vehicles', 'vehicles', 'create', 'Crear vehículos', false),
  ('vehicles.vehicles.update', 'vehicles', 'vehicles', 'update', 'Actualizar vehículos', false),

  -- ---------------------------------------------------------------------------
  -- queries (API externa + página web de consulta)
  -- ---------------------------------------------------------------------------
  ('queries.blocks.check', 'queries', 'blocks', 'check', 'Consultar bloqueo de RUT/PPU (auditado por consulta)', true),

  -- ---------------------------------------------------------------------------
  -- blocks (gestión de bloqueos por URP)
  -- ---------------------------------------------------------------------------
  ('blocks.blocks.read',   'blocks', 'blocks', 'read',   'Leer bloqueos', false),
  ('blocks.blocks.grant',  'blocks', 'blocks', 'grant',  'Crear bloqueo', false),
  ('blocks.blocks.revoke', 'blocks', 'blocks', 'revoke', 'Levantar bloqueo', false),

  -- ---------------------------------------------------------------------------
  -- maat (solo personal autorizado de Arauco)
  -- ---------------------------------------------------------------------------
  ('maat.records.read',   'maat', 'records', 'read',   'Leer registros MAAT', true),
  ('maat.records.manage', 'maat', 'records', 'manage', 'Gestionar registros MAAT', true),

  -- ---------------------------------------------------------------------------
  -- catalog (configuración del sistema)
  -- ---------------------------------------------------------------------------
  ('catalog.catalog.manage',     'catalog', 'catalog',    'manage', 'Editar catálogos del sistema', false),
  ('catalog.geometries.import',  'catalog', 'geometries', 'import', 'Importar KMZ de zonas/áreas/predios', true),

  -- ---------------------------------------------------------------------------
  -- reports / statistics
  -- ---------------------------------------------------------------------------
  ('reports.reports.read',   'reports', 'reports', 'read',   'Acceder a reportes', false),
  ('reports.reports.export', 'reports', 'reports', 'export', 'Exportar reportes (Excel/PDF/CSV)', true),

  -- ---------------------------------------------------------------------------
  -- admin del sistema
  -- ---------------------------------------------------------------------------
  ('users.users.manage',                 'users',         'users',         'manage', 'Gestionar usuarios', false),
  ('users.users.reset_mfa',              'users',         'users',         'reset_mfa', 'Resetear MFA de un usuario (auditado)', true),
  ('roles.roles.manage',                 'roles',         'roles',         'manage', 'Gestionar roles', true),
  ('organizations.organizations.manage', 'organizations', 'organizations', 'manage', 'Gestionar organizaciones', true),
  ('organizations.zones.assign',         'organizations', 'zones',         'assign', 'Reasignar zonas a empresas de seguridad', true),
  ('audit.logs.read',                    'audit',         'logs',          'read',   'Leer audit logs', true)
ON CONFLICT (code) DO NOTHING;
