-- =============================================================================
-- SURP 2.0 — 00_extensions_and_domains.sql
--
-- Fundación del schema: extensiones requeridas, dominios chilenos y funciones
-- utilitarias transversales (validación de RUT módulo 11, canonicalización,
-- normalización de email/teléfono, triggers de timestamps).
--
-- Orden de aplicación: primero. Ningún otro archivo debe correr antes.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE donde PostgreSQL lo soporta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensiones
-- -----------------------------------------------------------------------------

-- PostGIS 3 — datos geoespaciales (coordenadas de incidentes, polígonos de
-- predios/zonas/áreas/comunas, rutas de patrullaje).
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto — gen_random_uuid() para external_id, digest() para hashes auxiliares.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- citext — emails case-insensitive con comparación natural.
CREATE EXTENSION IF NOT EXISTS citext;

-- unaccent — búsqueda por nombre sin acentos (matching de personas).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- btree_gin — índices GIN compuestos (full-text + filtros estructurados).
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- pg_trgm — búsqueda por similitud (trigram) sobre nombres y razones sociales.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 2. Funciones de validación y canonicalización de RUT chileno
--
-- El RUT se almacena en formato canónico sin puntos y con dígito verificador en
-- mayúscula (`76543210-K`). La UI muestra con puntos (`76.543.210-K`).
-- Referencias: Servicio de Registro Civil e Identificación.
-- -----------------------------------------------------------------------------

-- fn_rut_canonicalize: elimina puntos/espacios y pasa el DV a mayúscula.
-- Entrada tolerante: '76.543.210-k', '76543210k', '76.543.210-K'
-- Salida canónica: '76543210-K'
-- Devuelve NULL si la entrada es NULL; NO valida módulo 11.
CREATE OR REPLACE FUNCTION fn_rut_canonicalize(p_rut TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
  v_body  TEXT;
  v_dv    TEXT;
BEGIN
  IF p_rut IS NULL THEN
    RETURN NULL;
  END IF;

  -- Quita puntos, espacios y guiones; uppercase para manejar 'k' → 'K'.
  v_clean := upper(regexp_replace(p_rut, '[.\s-]', '', 'g'));

  -- Debe tener al menos 2 caracteres (cuerpo + DV).
  IF length(v_clean) < 2 THEN
    RETURN NULL;
  END IF;

  v_body := left(v_clean, length(v_clean) - 1);
  v_dv   := right(v_clean, 1);

  -- Cuerpo debe ser solo dígitos; DV solo dígito o 'K'.
  IF v_body !~ '^\d+$' OR v_dv !~ '^[0-9K]$' THEN
    RETURN NULL;
  END IF;

  RETURN v_body || '-' || v_dv;
END;
$$;

COMMENT ON FUNCTION fn_rut_canonicalize(TEXT) IS
  'Normaliza un RUT a formato canónico `NNNNNNNN-DV` sin validar módulo 11. Devuelve NULL si el input es inválido estructuralmente.';

-- fn_rut_is_valid: valida módulo 11 sobre un RUT ya canonicalizado o no.
-- Devuelve TRUE/FALSE; NULL si el input es NULL.
CREATE OR REPLACE FUNCTION fn_rut_is_valid(p_rut TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_canon         TEXT;
  v_body          TEXT;
  v_dv_input      TEXT;
  v_dv_computed   TEXT;
  v_factor        INT;
  v_sum           INT;
  v_remainder     INT;
  v_check_digit   INT;
  i               INT;
BEGIN
  IF p_rut IS NULL THEN
    RETURN NULL;
  END IF;

  v_canon := fn_rut_canonicalize(p_rut);
  IF v_canon IS NULL THEN
    RETURN FALSE;
  END IF;

  v_body     := split_part(v_canon, '-', 1);
  v_dv_input := split_part(v_canon, '-', 2);

  -- Rango razonable: cuerpo entre 1 y 8 dígitos (cubre empresas y personas).
  IF length(v_body) < 1 OR length(v_body) > 8 THEN
    RETURN FALSE;
  END IF;

  v_factor := 2;
  v_sum    := 0;

  -- Recorre el cuerpo de derecha a izquierda multiplicando por 2..7 cíclico.
  FOR i IN REVERSE length(v_body)..1 LOOP
    v_sum    := v_sum + (substring(v_body FROM i FOR 1))::INT * v_factor;
    v_factor := v_factor + 1;
    IF v_factor > 7 THEN
      v_factor := 2;
    END IF;
  END LOOP;

  v_remainder   := v_sum % 11;
  v_check_digit := 11 - v_remainder;

  IF v_check_digit = 11 THEN
    v_dv_computed := '0';
  ELSIF v_check_digit = 10 THEN
    v_dv_computed := 'K';
  ELSE
    v_dv_computed := v_check_digit::TEXT;
  END IF;

  RETURN v_dv_input = v_dv_computed;
END;
$$;

COMMENT ON FUNCTION fn_rut_is_valid(TEXT) IS
  'Valida el dígito verificador de un RUT chileno por módulo 11. Tolera formatos con/sin puntos. Devuelve NULL si input es NULL, TRUE/FALSE en cualquier otro caso.';

-- -----------------------------------------------------------------------------
-- 3. Dominios chilenos
-- -----------------------------------------------------------------------------

-- d_rut — RUT chileno en formato canónico `NNNNNNNN-DV` con módulo 11 válido.
-- No aplica a documentos extranjeros (ver `parties.foreign_document_*`).
CREATE DOMAIN d_rut AS VARCHAR(12)
  CONSTRAINT d_rut_format_valid
    CHECK (VALUE ~ '^[0-9]{1,8}-[0-9K]$')
  CONSTRAINT d_rut_modulo11_valid
    CHECK (fn_rut_is_valid(VALUE));

COMMENT ON DOMAIN d_rut IS
  'RUT chileno canónico. Formato `NNNNNNNN-DV`, dígito verificador en mayúscula si es K, módulo 11 validado.';

-- d_email — email case-insensitive con formato básico válido.
-- No valida MX ni existencia; solo forma sintáctica RFC 5321 simplificada.
CREATE DOMAIN d_email AS CITEXT
  CONSTRAINT d_email_format_valid
    CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

COMMENT ON DOMAIN d_email IS
  'Email en formato sintáctico válido, case-insensitive vía citext. No valida MX/existencia.';

-- d_phone_cl — teléfono chileno en formato E.164 estricto (`+56[2|9]XXXXXXXX`).
-- Fijos: +56 2 + 8 dígitos. Móviles: +56 9 + 8 dígitos.
-- La UI acepta formatos flexibles y los normaliza antes de insertar.
CREATE DOMAIN d_phone_cl AS VARCHAR(20)
  CONSTRAINT d_phone_cl_format_valid
    CHECK (VALUE ~ '^\+56[29][0-9]{8}$');

COMMENT ON DOMAIN d_phone_cl IS
  'Teléfono chileno en E.164. Móvil: +569XXXXXXXX. Fijo: +562XXXXXXXX. Normalización ocurre en la aplicación antes del INSERT.';

-- d_license_plate_cl — patente chilena canónica (autos: 4 letras + 2 dígitos,
-- motos: 2 letras + 4 dígitos, antiguas permitidas por rango). Se guarda en
-- mayúsculas sin guion ni espacios.
CREATE DOMAIN d_license_plate_cl AS VARCHAR(10)
  CONSTRAINT d_license_plate_cl_format_valid
    CHECK (VALUE ~ '^[A-Z0-9]{4,8}$');

COMMENT ON DOMAIN d_license_plate_cl IS
  'Patente chilena canónica en mayúsculas sin separadores. Tolera formatos antiguos (6 chars) y vigentes (6 chars letras+digits).';

-- -----------------------------------------------------------------------------
-- 3.bis Wrapper IMMUTABLE de unaccent()
--
-- `unaccent()` en PostgreSQL no está marcada IMMUTABLE por defecto (depende
-- del diccionario, que puede ser recargado en caliente). Para poder crear
-- índices funcionales sobre `unaccent(lower(...))`, se usa este wrapper que
-- lo marca IMMUTABLE — práctica estándar cuando el diccionario no cambia en
-- producción. Todos los índices de búsqueda por nombre deben llamar esta
-- función en lugar de `unaccent()` directo.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_immutable_unaccent(TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

COMMENT ON FUNCTION fn_immutable_unaccent(TEXT) IS
  'Wrapper IMMUTABLE de unaccent() para permitir su uso en índices funcionales. Asume que el diccionario unaccent no cambia en runtime.';

-- -----------------------------------------------------------------------------
-- 4. Helpers de auditoría y timestamps
-- -----------------------------------------------------------------------------

-- fn_touch_updated_at: trigger BEFORE UPDATE que refresca updated_at si hay
-- cualquier cambio real. Usado por todas las tablas que llevan auditoría.
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_touch_updated_at() IS
  'Trigger BEFORE UPDATE: refresca updated_at si la fila cambió. Aplicar a toda tabla con columnas de auditoría estándar.';

-- fn_current_user_id: lee la GUC `app.current_user_id` que NestJS setea al
-- abrir la transacción. Devuelve NULL si no está seteada (p.ej. scripts,
-- seeds, migraciones ETL). Usado por triggers de auditoría y columnas
-- `updated_by_id` cuando el llamador no las provee.
CREATE OR REPLACE FUNCTION fn_current_user_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_value TEXT;
BEGIN
  BEGIN
    v_value := current_setting('app.current_user_id', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_value IS NULL OR v_value = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_value::BIGINT;
END;
$$;

COMMENT ON FUNCTION fn_current_user_id() IS
  'Lee la GUC `app.current_user_id` (setea el AuditInterceptor de NestJS). Devuelve NULL si no está disponible.';

-- fn_current_org_id: análoga a fn_current_user_id para la organización.
CREATE OR REPLACE FUNCTION fn_current_org_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_value TEXT;
BEGIN
  BEGIN
    v_value := current_setting('app.current_org_id', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_value IS NULL OR v_value = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_value::BIGINT;
END;
$$;

COMMENT ON FUNCTION fn_current_org_id() IS
  'Lee la GUC `app.current_org_id`. Útil para filtros de scope en vistas o políticas defensivas.';

-- -----------------------------------------------------------------------------
-- 5. Verificación PostGIS
-- -----------------------------------------------------------------------------

-- SRID 4326 = WGS84. Verificamos que esté disponible en spatial_ref_sys.
-- Un fail aquí indica una instalación PostGIS incompleta — detener la cadena.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = 4326) THEN
    RAISE EXCEPTION 'SRID 4326 (WGS84) no disponible. PostGIS no está instalado correctamente.';
  END IF;
END;
$$;
