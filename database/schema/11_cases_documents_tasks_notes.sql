-- =============================================================================
-- SURP 2.0 — schema/11_cases_documents_tasks_notes.sql
--
-- Módulo cases — documentos, plantillas, tareas y notas:
--
--   - case_templates           Plantillas de escritos editables por
--                              Abogado Administrador (querella, recurso, etc.)
--   - case_documents           Documentos de la causa (escritos, resoluciones,
--                              actas, pruebas) con versionado real.
--   - case_document_versions   Versiones individuales del documento.
--   - case_tasks               TODO list por causa, asignable. Auto-generadas
--                              desde plazos o manuales.
--   - case_notes               Notas. is_private=true → visibles solo al equipo
--                              asignado a la causa (filtrado en use case).
--
-- Esta ola cierra el módulo cases:
--   - Agrega las FKs diferidas:
--     case_hearings.act_document_id, case_resolutions.document_id,
--     case_appeals.document_id, case_querellas.document_id
--   - Agrega permisos faltantes en seed/09.
-- =============================================================================


-- =============================================================================
-- 1. case_templates — plantillas de escritos
-- =============================================================================

CREATE TABLE case_templates (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                     VARCHAR(60) NOT NULL UNIQUE,
  title                    VARCHAR(200) NOT NULL,
  body_markdown            TEXT NOT NULL,
  -- Placeholders: array de objetos {name, label, required, default_value}
  placeholders             JSONB NOT NULL DEFAULT '[]'::jsonb,

  applicable_to_matter     VARCHAR(30) NULL,
  applicable_document_type VARCHAR(40) NULL REFERENCES case_document_types(code),

  is_system                BOOLEAN NOT NULL DEFAULT false,
  active                   BOOLEAN NOT NULL DEFAULT true,
  order_index              INT NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_templates_matter_ck CHECK (
    applicable_to_matter IS NULL OR applicable_to_matter IN ('PENAL', 'CIVIL', 'ADMIN', 'CONST')
  ),
  CONSTRAINT case_templates_placeholders_array_ck CHECK (
    jsonb_typeof(placeholders) = 'array'
  )
);

CREATE TRIGGER case_templates_touch_updated_at
  BEFORE UPDATE ON case_templates
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_case_templates_matter   ON case_templates(applicable_to_matter) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_templates_doc_type ON case_templates(applicable_document_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_templates_active   ON case_templates(active) WHERE deleted_at IS NULL;

COMMENT ON TABLE case_templates IS 'Plantillas de escritos. Editables por Abogado Administrador. body_markdown con placeholders {{nombre}} reemplazables al instanciar.';


-- =============================================================================
-- 2. case_documents (parent) y case_document_versions (versions)
-- =============================================================================

-- Forward declaration: case_documents referencia current_version_id que
-- vive en case_document_versions. Se resuelve con FK agregada al final.

CREATE TABLE case_documents (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                  BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  document_type_code       VARCHAR(40) NOT NULL REFERENCES case_document_types(code),
  title                    VARCHAR(200) NOT NULL,
  description              TEXT NULL,

  -- Apunta a la version "actual". NULL al crear documento sin versiones.
  current_version_id       BIGINT NULL,
  current_version_number   INT NOT NULL DEFAULT 0,

  template_id              BIGINT NULL REFERENCES case_templates(id),

  -- Cuándo se presentó al tribunal (NULL = aún no se presenta)
  presented_to_court_at    TIMESTAMPTZ NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id)
);

CREATE TRIGGER case_documents_touch_updated_at
  BEFORE UPDATE ON case_documents
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_case_documents_case      ON case_documents(case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_documents_type      ON case_documents(document_type_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_documents_template  ON case_documents(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_case_documents_presented ON case_documents(presented_to_court_at) WHERE presented_to_court_at IS NOT NULL;


CREATE TABLE case_document_versions (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  document_id         BIGINT NOT NULL REFERENCES case_documents(id) ON DELETE RESTRICT,
  version_number      INT NOT NULL,

  -- Almacenamiento (StorageService). Container privado, SAS corto.
  storage_object_key  TEXT NOT NULL,
  mime_type           VARCHAR(100) NOT NULL,
  size_bytes          BIGINT NOT NULL,
  sha256              VARCHAR(64) NOT NULL,

  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_id      BIGINT NOT NULL REFERENCES users(id),
  change_notes        TEXT NULL,

  CONSTRAINT cdv_version_positive_ck CHECK (version_number > 0),
  CONSTRAINT cdv_size_positive_ck CHECK (size_bytes > 0),
  CONSTRAINT cdv_sha256_format_ck CHECK (sha256 ~ '^[a-f0-9]{64}$'),

  -- Una version_number por documento — no duplicar
  UNIQUE (document_id, version_number)
);

CREATE INDEX idx_cdv_document  ON case_document_versions(document_id);
CREATE INDEX idx_cdv_uploaded  ON case_document_versions(uploaded_at DESC);
CREATE INDEX idx_cdv_sha256    ON case_document_versions(sha256);

-- FK case_documents.current_version_id ahora que case_document_versions existe
ALTER TABLE case_documents
  ADD CONSTRAINT case_documents_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES case_document_versions(id);

-- Trigger: al crear nueva version, actualizar current_version_id del documento padre
CREATE OR REPLACE FUNCTION fn_case_document_versions_update_current()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo actualizar si la nueva version es mayor que la actual
  UPDATE case_documents
  SET current_version_id = NEW.id,
      current_version_number = NEW.version_number,
      updated_at = now()
  WHERE id = NEW.document_id
    AND (current_version_number < NEW.version_number OR current_version_number IS NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_document_versions_update_current
  AFTER INSERT ON case_document_versions
  FOR EACH ROW EXECUTE FUNCTION fn_case_document_versions_update_current();

-- Inmutabilidad de versions: las versiones individuales no se editan, solo se
-- agregan nuevas (mismo patrón que case_milestones append-only).
CREATE OR REPLACE FUNCTION fn_case_document_versions_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'case_document_versions: append-only. Para corregir, subir nueva version (id=%).', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'case_document_versions: append-only. Borrado prohibido (id=%).', OLD.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_document_versions_append_only
  BEFORE UPDATE OR DELETE ON case_document_versions
  FOR EACH ROW EXECUTE FUNCTION fn_case_document_versions_append_only();

-- Auto-asignar version_number incremental por documento
CREATE OR REPLACE FUNCTION fn_case_document_versions_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number = 0 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM case_document_versions
    WHERE document_id = NEW.document_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_document_versions_auto_number
  BEFORE INSERT ON case_document_versions
  FOR EACH ROW EXECUTE FUNCTION fn_case_document_versions_auto_number();

COMMENT ON TABLE case_documents IS 'Documentos de la causa (escritos, resoluciones, actas, pruebas). Versiones reales en case_document_versions; current_version_id apunta a la última.';
COMMENT ON TABLE case_document_versions IS 'Versiones append-only de documentos. version_number auto-incremental por documento. Storage via StorageService (Azure Blob / disco local). sha256 obligatorio.';


-- =============================================================================
-- 3. ALTER TABLE: agregar FKs diferidas hacia case_documents
-- =============================================================================

ALTER TABLE case_hearings
  ADD CONSTRAINT case_hearings_act_document_fk
  FOREIGN KEY (act_document_id) REFERENCES case_documents(id) ON DELETE SET NULL;

ALTER TABLE case_resolutions
  ADD CONSTRAINT case_resolutions_document_fk
  FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE SET NULL;

ALTER TABLE case_appeals
  ADD CONSTRAINT case_appeals_document_fk
  FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE SET NULL;

ALTER TABLE case_querellas
  ADD CONSTRAINT case_querellas_document_fk
  FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE SET NULL;


-- =============================================================================
-- 4. case_tasks — TODO list por causa
-- =============================================================================

CREATE TABLE case_tasks (
  id                                  BIGSERIAL PRIMARY KEY,
  external_id                         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id                             BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,

  title                               VARCHAR(200) NOT NULL,
  description                         TEXT NULL,
  due_at                              TIMESTAMPTZ NULL,

  assigned_to_user_id                 BIGINT NULL REFERENCES users(id),
  state                               VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Si fue auto-generada desde un plazo
  auto_generated_from_deadline_id     BIGINT NULL REFERENCES case_deadlines(id),

  completed_at                        TIMESTAMPTZ NULL,
  completed_by_id                     BIGINT NULL REFERENCES users(id),

  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                       BIGINT NULL REFERENCES users(id),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                       BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_tasks_state_ck CHECK (state IN (
    'pending', 'in_progress', 'done', 'cancelled'
  )),
  CONSTRAINT case_tasks_done_consistency_ck CHECK (
    state <> 'done' OR (completed_at IS NOT NULL AND completed_by_id IS NOT NULL)
  )
);

CREATE TRIGGER case_tasks_touch_updated_at
  BEFORE UPDATE ON case_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_case_tasks_case        ON case_tasks(case_id);
CREATE INDEX idx_case_tasks_assigned    ON case_tasks(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX idx_case_tasks_state       ON case_tasks(state);
CREATE INDEX idx_case_tasks_due         ON case_tasks(due_at) WHERE state IN ('pending', 'in_progress') AND due_at IS NOT NULL;
CREATE INDEX idx_case_tasks_from_deadline ON case_tasks(auto_generated_from_deadline_id) WHERE auto_generated_from_deadline_id IS NOT NULL;

COMMENT ON TABLE case_tasks IS 'TODO list por causa. Auto-generadas desde plazos (auto_generated_from_deadline_id NOT NULL) o manuales (NULL). Asignables a cualquier user de Arauco.';


-- =============================================================================
-- 5. case_notes — notas (privadas o no)
-- =============================================================================

CREATE TABLE case_notes (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  case_id             BIGINT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  author_user_id      BIGINT NOT NULL REFERENCES users(id),

  body_markdown       TEXT NOT NULL,
  is_private          BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT case_notes_body_not_empty_ck CHECK (length(trim(body_markdown)) > 0)
);

CREATE TRIGGER case_notes_touch_updated_at
  BEFORE UPDATE ON case_notes
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Solo el autor puede modificar su nota (validado en trigger; capa app refuerza)
CREATE OR REPLACE FUNCTION fn_case_notes_only_author_modifies()
RETURNS TRIGGER AS $$
BEGIN
  -- author_user_id es immutable
  IF NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN
    RAISE EXCEPTION 'case_notes: author_user_id es inmutable';
  END IF;
  -- case_id es immutable
  IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'case_notes: case_id es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_notes_only_author_modifies
  BEFORE UPDATE ON case_notes
  FOR EACH ROW EXECUTE FUNCTION fn_case_notes_only_author_modifies();

CREATE INDEX idx_case_notes_case      ON case_notes(case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_notes_author    ON case_notes(author_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_notes_private   ON case_notes(case_id, is_private) WHERE deleted_at IS NULL;

COMMENT ON TABLE case_notes IS 'Notas. is_private=true → visibles SOLO a abogados actualmente asignados a la causa (case_attorneys con assigned_until IS NULL). Filtrado en use case + audit_log con action read_private_case_note al leer.';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('case_templates');
SELECT fn_audit_attach('case_documents');
SELECT fn_audit_attach('case_document_versions');
SELECT fn_audit_attach('case_tasks');
SELECT fn_audit_attach('case_notes');
