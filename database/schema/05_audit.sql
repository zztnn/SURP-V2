-- =============================================================================
-- SURP 2.0 — 05_audit.sql
--
-- Auditoría universal del sistema. Cubre dos fuentes:
--
--   1. CRUD trigger — INSERT/UPDATE/DELETE sobre tablas operativas. Captura
--      before/after sanitizados, columnas que cambiaron, y el actor desde las
--      GUCs `app.current_user_id`, `app.current_org_id`, `app.session_id`,
--      `app.request_id`, `app.current_ip`.
--
--   2. Aplicación — el AuditInterceptor de NestJS escribe directamente para
--      lecturas sensibles, login/logout, descargas de evidencia, merges de
--      parties, asignaciones de roles, etc. (ADR-B-009 + SECURITY.md §5.2).
--
-- Particionamiento por mes (PARTITION BY RANGE occurred_at). La tabla crece
-- rápido — en el legacy SURP, una tabla equivalente sin partición causaría
-- problemas de mantenimiento. Inicialmente se crean particiones para los
-- próximos 12 meses + una "default" catch-all. La función
-- `fn_audit_ensure_partition()` crea la del mes siguiente; un cron mensual
-- la invoca.
--
-- Referencias:
--   - ADR-B-009 (Auditoría CRUD + lecturas sensibles)
--   - SECURITY.md §0 (lo que NO heredamos del legacy: nada de "sin auditoría")
--   - SECURITY.md §5.2 (forma del audit_log para lecturas sensibles)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. audit_logs — tabla padre particionada por mes.
-- -----------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id                          BIGSERIAL,
  occurred_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Origen del registro.
  source                      VARCHAR(30) NOT NULL
    CHECK (source IN (
      'crud_trigger',     -- generado por trigger genérico de tabla
      'sensitive_read',   -- AuditInterceptor: lectura de permiso is_sensitive=true
      'auth',             -- login, logout, mfa, password reset, lock, unlock
      'admin_action',     -- merge de parties, reset de mfa, asignación de rol
      'system'            -- eventos del sistema (jobs, importaciones, etc.)
    )),

  -- Acción concreta. Vocabulario libre por convención: 'insert', 'update',
  -- 'delete', 'login_success', 'login_failed', 'evidence_download',
  -- 'merge_parties', 'assign_role', 'revoke_role', 'mfa_reset', etc.
  action                      VARCHAR(60) NOT NULL,

  -- Quién (puede ser NULL en eventos del sistema o login con email no existente).
  user_id                     BIGINT,
  organization_id             BIGINT,
  session_id                  UUID,
  request_id                  UUID,
  ip                          INET,
  user_agent                  TEXT,

  -- Sobre qué (NULL para eventos sin entidad — login, etc.).
  entity_table                VARCHAR(80),
  entity_id                   BIGINT,
  entity_external_id          UUID,

  -- Datos del cambio (sanitizados).
  before_data                 JSONB,
  after_data                  JSONB,
  changed_columns             TEXT[],

  -- Razón humana opcional (descargas con justificación, merges, etc.).
  reason                      TEXT,
  -- Metadata libre por evento.
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,

  PRIMARY KEY (id, occurred_at)
)
PARTITION BY RANGE (occurred_at);

-- Índices globales (se aplican a todas las particiones automáticamente).
CREATE INDEX audit_logs_user_recent_ix     ON audit_logs (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX audit_logs_org_recent_ix      ON audit_logs (organization_id, occurred_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX audit_logs_entity_ix          ON audit_logs (entity_table, entity_id) WHERE entity_table IS NOT NULL;
CREATE INDEX audit_logs_entity_external_ix ON audit_logs (entity_external_id) WHERE entity_external_id IS NOT NULL;
CREATE INDEX audit_logs_action_recent_ix   ON audit_logs (action, occurred_at DESC);
CREATE INDEX audit_logs_source_ix          ON audit_logs (source);

COMMENT ON TABLE audit_logs IS
  'Tabla universal de auditoría. Particionada mensualmente. Fuente: trigger CRUD + AuditInterceptor de la app. Append-only — el código nunca debe UPDATE ni DELETE filas existentes.';

-- -----------------------------------------------------------------------------
-- 2. Particiones iniciales: 12 meses desde el mes actual + 1 default catch-all.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_start  DATE := date_trunc('month', now())::DATE;
  v_month  DATE;
  v_next   DATE;
  v_pname  TEXT;
  i        INT;
BEGIN
  FOR i IN 0..11 LOOP
    v_month := (v_start + (i || ' months')::INTERVAL)::DATE;
    v_next  := (v_month + INTERVAL '1 month')::DATE;
    v_pname := format('audit_logs_%s', to_char(v_month, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L);',
      v_pname, v_month, v_next
    );
  END LOOP;
  -- DEFAULT catch-all para fechas fuera del rango precreado (debe quedar
  -- vacía en operación normal; alerta si se llena).
  EXECUTE 'CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. fn_audit_ensure_partition — invocable por cron mensual para crear la
-- partición del mes siguiente. Idempotente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_ensure_partition(p_month DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::DATE;
  v_next  DATE := (v_month + INTERVAL '1 month')::DATE;
  v_pname TEXT := format('audit_logs_%s', to_char(v_month, 'YYYY_MM'));
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = v_pname
  ) THEN
    RETURN format('partition %s already exists', v_pname);
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L);',
    v_pname, v_month, v_next
  );
  RETURN format('partition %s created', v_pname);
END;
$$;

COMMENT ON FUNCTION fn_audit_ensure_partition(DATE) IS
  'Crea la partición mensual de audit_logs para el mes que contiene la fecha dada. Invocable por cron — idempotente.';

-- -----------------------------------------------------------------------------
-- 4. Función trigger genérica: fn_audit_row_changes
--
-- - Captura before/after como JSONB.
-- - Sanitiza columnas sensibles (password_hash, key_hash, encrypted_secret,
--   refresh_token_hash) antes de almacenar.
-- - Calcula changed_columns en UPDATEs comparando old vs new key by key.
-- - Lee actor desde GUCs (app.current_user_id, app.current_org_id, etc.).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_row_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw_before JSONB;
  v_raw_after  JSONB;
  v_before     JSONB;
  v_after      JSONB;
  v_changed    TEXT[];
  v_id         BIGINT;
  v_ext_id     UUID;
  v_action     VARCHAR(20);
  v_session    UUID;
  v_request    UUID;
  v_ip         INET;
  v_ua         TEXT;
  -- Columna que sirve como entity_id en audit_logs. Default 'id'; se puede
  -- pasar como TG_ARGV[0] para tablas con PK distinta (ej. extensiones 1:1
  -- con `party_id` o `user_id` como PK).
  v_id_column  TEXT := COALESCE(TG_ARGV[0], 'id');
BEGIN
  -- Lectura defensiva de GUCs — todas opcionales.
  v_session := NULLIF(current_setting('app.session_id', true), '')::UUID;
  v_request := NULLIF(current_setting('app.request_id', true), '')::UUID;
  v_ip      := NULLIF(current_setting('app.current_ip', true), '')::INET;
  v_ua      := NULLIF(current_setting('app.current_user_agent', true), '');

  IF TG_OP = 'INSERT' THEN
    v_action     := 'insert';
    v_raw_after  := to_jsonb(NEW);
    v_after      := fn_audit_sanitize(v_raw_after);
    v_id         := (v_raw_after->>v_id_column)::BIGINT;
    v_ext_id     := NULLIF(v_raw_after->>'external_id', '')::UUID;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action     := 'update';
    v_raw_before := to_jsonb(OLD);
    v_raw_after  := to_jsonb(NEW);

    -- Calcular columnas que cambiaron sobre los datos CRUDOS (incluye
    -- columnas sensibles — su nombre debe quedar en changed_columns aunque
    -- el valor se redacte). Excluye updated_at (cambia siempre por trigger).
    SELECT array_agg(key)
      INTO v_changed
      FROM (
        SELECT key
        FROM jsonb_each(v_raw_after)
        WHERE key <> 'updated_at'
          AND v_raw_before->key IS DISTINCT FROM v_raw_after->key
      ) t;

    -- Si solo cambió updated_at, no auditar (ruido puro).
    IF v_changed IS NULL OR array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    -- Sanitizar después de calcular el diff: el VALOR sensible nunca llega
    -- al log; el NOMBRE de la columna sí (queda en changed_columns).
    v_before := fn_audit_sanitize(v_raw_before);
    v_after  := fn_audit_sanitize(v_raw_after);
    v_id     := (v_raw_after->>v_id_column)::BIGINT;
    v_ext_id := NULLIF(v_raw_after->>'external_id', '')::UUID;
  ELSIF TG_OP = 'DELETE' THEN
    v_action     := 'delete';
    v_raw_before := to_jsonb(OLD);
    v_before     := fn_audit_sanitize(v_raw_before);
    v_id         := (v_raw_before->>v_id_column)::BIGINT;
    v_ext_id     := NULLIF(v_raw_before->>'external_id', '')::UUID;
  END IF;

  INSERT INTO audit_logs (
    source, action,
    user_id, organization_id, session_id, request_id, ip, user_agent,
    entity_table, entity_id, entity_external_id,
    before_data, after_data, changed_columns
  ) VALUES (
    'crud_trigger', v_action,
    fn_current_user_id(), fn_current_org_id(), v_session, v_request, v_ip, v_ua,
    TG_TABLE_NAME, v_id, v_ext_id,
    v_before, v_after, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION fn_audit_row_changes() IS
  'Trigger AFTER INSERT/UPDATE/DELETE genérico. Sanitiza campos sensibles, calcula changed_columns, lee actor desde GUCs y escribe en audit_logs.';

-- -----------------------------------------------------------------------------
-- 5. fn_audit_sanitize — redacta campos sensibles en una representación JSONB.
--
-- Lista cerrada: cualquier columna nueva que sea sensible debe agregarse aquí.
-- Estrategia: borrar la clave (no dejar `null`) para que no aparezca en el log.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_sanitize(p_row JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_row
    - 'password_hash'
    - 'key_hash'
    - 'encrypted_secret'
    - 'refresh_token_hash';
$$;

COMMENT ON FUNCTION fn_audit_sanitize(JSONB) IS
  'Quita campos sensibles antes de escribir en audit_logs. Mantener sincronizada con cualquier columna sensible nueva.';

-- -----------------------------------------------------------------------------
-- 6. fn_audit_attach — helper para conectar el trigger genérico a una tabla.
--
-- Valida que la tabla tenga columna `id BIGINT` (la mayoría sí; las que no
-- requieren auditoría a nivel de aplicación).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_attach(p_table_name TEXT, p_id_column TEXT DEFAULT 'id')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_col BOOLEAN;
  v_trigger_name TEXT := format('%s_audit_changes_tg', p_table_name);
BEGIN
  -- Validar que la tabla existe en el schema public.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    RAISE EXCEPTION 'fn_audit_attach: tabla %.% no existe', 'public', p_table_name;
  END IF;

  -- Validar que la columna PK indicada existe.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table_name AND column_name = p_id_column
  ) INTO v_has_col;

  IF NOT v_has_col THEN
    RAISE EXCEPTION 'fn_audit_attach: tabla % no tiene columna `%` — auditar a nivel de aplicación', p_table_name, p_id_column;
  END IF;

  -- Idempotente.
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table = p_table_name
      AND trigger_name = v_trigger_name
  ) THEN
    RETURN format('audit ya estaba conectada a %s', p_table_name);
  END IF;

  EXECUTE format(
    'CREATE TRIGGER %I
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION fn_audit_row_changes(%L);',
    v_trigger_name, p_table_name, p_id_column
  );

  RETURN format('audit conectada a %s (pk=%s)', p_table_name, p_id_column);
END;
$$;

COMMENT ON FUNCTION fn_audit_attach(TEXT, TEXT) IS
  'Conecta el trigger genérico de auditoría a una tabla. Idempotente. p_id_column default `id`; usar `party_id`/`user_id` para extensiones 1:1.';

-- -----------------------------------------------------------------------------
-- 7. Aplicar auditoría a las tablas operativas y de catálogo ya creadas.
--
-- NO auditar (justificación al lado):
--   - audit_logs           — recursión infinita.
--   - user_sessions        — alta frecuencia; tiene su propio tracking.
--   - user_login_attempts  — ya es una bitácora.
--   - permissions          — sincronizado desde código en arranque; sin valor.
--   - role_permissions     — sin columna `id`; auditar en service (assignPermissionToRole).
--   - user_roles           — sin columna `id`; auditar en service (assignRole/revokeRole).
--   - incident_sequences   — contador puro; sin valor auditarlo.
-- -----------------------------------------------------------------------------

-- Tablas con PK estándar `id`.
DO $$
DECLARE
  v_table  TEXT;
  v_tables TEXT[] := ARRAY[
    -- Identidad y RBAC
    'parties', 'party_contacts', 'party_relationships',
    'organizations', 'users', 'roles', 'api_keys', 'blocks',
    -- Territorial Chile
    'regions', 'provinces', 'communes',
    -- Territorial Arauco
    'zones', 'areas', 'properties', 'organization_zone_assignments',
    -- Catálogos
    'incident_types', 'incident_person_roles', 'asset_types', 'vehicle_types',
    'institutions', 'tree_species', 'wood_conditions', 'wood_states',
    'wood_storage_types', 'operation_types', 'seizure_reasons'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    PERFORM fn_audit_attach(v_table);
  END LOOP;
END;
$$;

-- Tablas extensión 1:1 cuya PK es `party_id` o `user_id`.
DO $$
BEGIN
  PERFORM fn_audit_attach('natural_persons',       'party_id');
  PERFORM fn_audit_attach('legal_entities',        'party_id');
  PERFORM fn_audit_attach('user_mfa_totp_secrets', 'user_id');
END;
$$;
