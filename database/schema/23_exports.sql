-- =============================================================================
-- SURP 2.0 — schema/23_exports.sql
--
-- Módulo exports — jobs de exportación async (BullMQ + worker).
--
--   - export_jobs    Una fila por petición de export. external_id = jobId BullMQ.
--                    Estado vive en Postgres (Redis es solo cola); el frontend
--                    consulta esta tabla para mostrar progreso.
--
-- Patrón canónico — ver `apps/api/.ai-docs/standards/BACKGROUND-JOBS.md` y
-- `apps/api/.ai-docs/standards/STORAGE.md`.
--
-- TTL del archivo generado: 7 días desde `created_at`. Cleanup vía cron diario
-- (a implementar en paso 7 — borra blob + actualiza fila a status='expired').
-- =============================================================================

CREATE TABLE export_jobs (
  id                            BIGSERIAL    PRIMARY KEY,
  external_id                   UUID         NOT NULL DEFAULT gen_random_uuid(),

  -- Qué se exporta y en qué formato.
  module                        VARCHAR(64)  NOT NULL,
  format                        VARCHAR(16)  NOT NULL
    CHECK (format IN ('xlsx', 'pdf', 'csv')),

  -- Quién pidió + en qué contexto multi-org. La organización es relevante
  -- para auditoría y para el guard de visibilidad: una `security_provider`
  -- exporta solo zonas asignadas a su org al momento de la petición.
  requested_by_user_id          BIGINT       NOT NULL REFERENCES users(id),
  requested_by_organization_id  BIGINT       NOT NULL REFERENCES organizations(id),

  -- Filtros aplicados al momento de pedirlo. Auditoría + reproducibilidad
  -- (re-correr el mismo export con los mismos parámetros).
  filters                       JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Estado del job (mismo vocabulario que BACKGROUND-JOBS.md).
  status                        VARCHAR(16)  NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled', 'expired')),
  progress                      SMALLINT     NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),
  total_rows                    INTEGER,
  rows_done                     INTEGER      NOT NULL DEFAULT 0,

  -- Resultado: referencia al blob en `surp-reports`.
  -- NULLs hasta que el job termina con status='done'.
  storage_container             VARCHAR(64),
  storage_key                   VARCHAR(512),
  file_size_bytes               BIGINT,
  filename                      VARCHAR(255),

  -- Error (cuando status='failed' o 'cancelled').
  error_message                 TEXT,

  -- Timestamps.
  created_at                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at                    TIMESTAMPTZ,
  finished_at                   TIMESTAMPTZ,
  expires_at                    TIMESTAMPTZ  NOT NULL,

  CONSTRAINT export_jobs_external_id_unique UNIQUE (external_id),
  CONSTRAINT export_jobs_progress_done_consistent CHECK (
    status <> 'done' OR (
      progress = 100
      AND storage_container IS NOT NULL
      AND storage_key IS NOT NULL
      AND finished_at IS NOT NULL
    )
  ),
  CONSTRAINT export_jobs_failed_has_error CHECK (
    status NOT IN ('failed', 'cancelled') OR error_message IS NOT NULL
  )
);

-- Índices: "mis exports" (userId + recientes), monitoreo (queued/running),
-- cleanup cron (expires_at vencido en jobs done).
CREATE INDEX idx_export_jobs_user_recent
  ON export_jobs (requested_by_user_id, created_at DESC);

CREATE INDEX idx_export_jobs_status_pending
  ON export_jobs (status)
  WHERE status IN ('queued', 'running');

CREATE INDEX idx_export_jobs_expires
  ON export_jobs (expires_at)
  WHERE status = 'done';

CREATE INDEX idx_export_jobs_external_id
  ON export_jobs (external_id);

-- updated_at trigger no aplica — los timestamps relevantes (started_at,
-- finished_at) se setean explícitamente en transiciones de estado.

COMMENT ON TABLE export_jobs IS
  'Jobs de exportación async (BullMQ + worker). Estado vive en Postgres; Redis es solo cola. external_id = jobId BullMQ. TTL del archivo: 7 días.';

COMMENT ON COLUMN export_jobs.module IS
  'Tipo de export: incidents | cases | persons | vehicles | etc. Cada uno tiene su data provider en el processor del worker.';

COMMENT ON COLUMN export_jobs.filters IS
  'Snapshot de los filtros aplicados al momento de pedir el export. Permite reproducir el dataset exacto + auditoría legal (Ley 21.719) sobre qué datos personales fueron exportados.';

COMMENT ON COLUMN export_jobs.requested_by_organization_id IS
  'Organización del usuario al momento de la petición. Se conserva para auditoría aunque el usuario después cambie de org.';

COMMENT ON COLUMN export_jobs.expires_at IS
  'Timestamp tras el cual el blob se borra (cron diario). Default 7 días desde created_at — set en el use case que crea el job.';

COMMENT ON COLUMN export_jobs.storage_key IS
  'Path dentro de surp-reports. NULL hasta que el processor sube el archivo. Estructura canónica: incidents/{requesterId}/{yyyy}/{mm}/{uuid}-{filename}.';
