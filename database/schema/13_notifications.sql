-- =============================================================================
-- SURP 2.0 — schema/13_notifications.sql
--
-- Módulo notifications — infraestructura transversal de email:
--
--   - notification_templates    Catálogo editable por admin (MJML + Handlebars)
--   - notifications             Instancias enviadas (antes "notification_dispatches")
--   - user_notification_prefs   Opt-out por user/code/channel
--
-- Transport: Azure Communication Services Email con Managed Identity (prod)
-- y MailHog (dev). Cola BullMQ `notification-dispatch`. Tracking de delivery
-- vía Event Grid actualiza `notifications.delivery_status`.
--
-- Referencia: NOTIFICATIONS.md, ADR-B-021.
-- =============================================================================


-- =============================================================================
-- 1. notification_templates
-- =============================================================================

CREATE TABLE notification_templates (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code                     VARCHAR(80) NOT NULL UNIQUE,

  subject_template         TEXT NOT NULL,
  body_mjml                TEXT NOT NULL,
  plain_fallback_template  TEXT NULL,            -- si NULL se autogenera con html-to-text

  enabled                  BOOLEAN NOT NULL DEFAULT true,
  editable_by_admin        BOOLEAN NOT NULL DEFAULT true,
  is_mandatory             BOOLEAN NOT NULL DEFAULT false,

  locale                   VARCHAR(10) NOT NULL DEFAULT 'es-CL',
  available_vars           JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Sender por defecto: DoNotReply, alertas, reportes (configurables por template)
  sender_address           VARCHAR(120) NOT NULL DEFAULT 'DoNotReply@surp.cl',
  sender_display_name      VARCHAR(100) NOT NULL DEFAULT 'SURP — Arauco URP',
  reply_to                 VARCHAR(120) NULL DEFAULT 'soporte@surp.cl',

  category                 VARCHAR(40) NOT NULL,
  is_system                BOOLEAN NOT NULL DEFAULT false,
  order_index              INT NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),

  -- Catálogo cerrado de categorías de notificación. Cuando se agrega un
  -- módulo nuevo (`statistics`, `rules`, `fires`, `surveillance`, …) que
  -- emite plantillas, se extiende esta lista — NO se reaplica el CHECK
  -- desde otro archivo de schema (patrón viejo era acumulativo y frágil:
  -- si un módulo olvidaba re-listar las categorías anteriores, dejaba el
  -- CHECK incompleto). Mantener este CHECK como única fuente de verdad.
  CONSTRAINT nt_category_ck CHECK (category IN (
    'account', 'incident', 'complaint', 'case',
    'hearing', 'deadline', 'task', 'querella', 'appeal', 'resolution',
    'report', 'export', 'api', 'digest', 'pjud', 'system',
    'surveillance', 'statistics', 'rules', 'fires'
  )),
  CONSTRAINT nt_subject_not_empty_ck CHECK (length(trim(subject_template)) > 0),
  CONSTRAINT nt_body_not_empty_ck CHECK (length(trim(body_mjml)) > 0),
  CONSTRAINT nt_available_vars_array_ck CHECK (jsonb_typeof(available_vars) = 'array'),
  CONSTRAINT nt_locale_ck CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT nt_sender_format_ck CHECK (sender_address ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE TRIGGER nt_touch_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Si is_mandatory=true, no se puede setear enabled=false (un mandatorio
-- desactivado equivale a violar la regla regulatoria/operativa).
CREATE OR REPLACE FUNCTION fn_nt_validate_mandatory()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_mandatory = true AND NEW.enabled = false THEN
    RAISE EXCEPTION 'notification_templates: template mandatorio (%) no se puede desactivar', NEW.code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nt_validate_mandatory
  BEFORE INSERT OR UPDATE OF is_mandatory, enabled ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION fn_nt_validate_mandatory();

-- Si editable_by_admin=false y is_system=true, los cambios solo via despliegue.
-- Reusamos fn_protect_system_catalog_rows pero NO sobre los campos editables
-- (subject_template, body_mjml). Solo bloquea DELETE y cambio de code.
CREATE OR REPLACE FUNCTION fn_nt_protect_system()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'notification_templates: no se puede eliminar template del sistema (code=%)', OLD.code;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'notification_templates: no se puede cambiar code de template del sistema';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'notification_templates: no se puede desmarcar is_system';
  END IF;
  -- Bloquear edición de body/subject si editable_by_admin=false
  IF TG_OP = 'UPDATE' AND OLD.editable_by_admin = false THEN
    IF NEW.subject_template IS DISTINCT FROM OLD.subject_template
       OR NEW.body_mjml IS DISTINCT FROM OLD.body_mjml THEN
      RAISE EXCEPTION 'notification_templates: template % es editable_by_admin=false; cambios solo via despliegue', OLD.code;
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nt_protect_system
  BEFORE UPDATE OR DELETE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION fn_nt_protect_system();

CREATE INDEX idx_nt_category   ON notification_templates(category);
CREATE INDEX idx_nt_enabled    ON notification_templates(enabled);
CREATE INDEX idx_nt_mandatory  ON notification_templates(is_mandatory);

COMMENT ON TABLE notification_templates IS 'Catálogo de templates de email. MJML + Handlebars. Editables por administrador desde /admin/notifications/templates salvo editable_by_admin=false. is_mandatory=true ignora user_notification_prefs (auth, alertas críticas, plazos en rojo).';


-- =============================================================================
-- 2. notifications — instancias enviadas
-- =============================================================================

CREATE TABLE notifications (
  id                          BIGSERIAL PRIMARY KEY,
  external_id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  -- Template y contexto al momento del envío
  code                        VARCHAR(80) NOT NULL REFERENCES notification_templates(code),
  recipients_snapshot         JSONB NOT NULL,       -- [ { user_id?, email } ]
  context_snapshot            JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_subject            TEXT NULL,            -- guardado solo si falla render
  -- (no guardamos rendered_body por privacidad — Ley 21.719)

  -- Estado del envío
  status                      VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts                    INT NOT NULL DEFAULT 0,
  last_error                  TEXT NULL,

  -- IDs externos
  acs_message_id              VARCHAR(100) NULL,    -- ACS retorna un GUID
  smtp_message_id             VARCHAR(200) NULL,    -- MailHog/Nodemailer retorna un Message-ID

  -- Tracking de delivery (Event Grid)
  delivery_status             VARCHAR(30) NULL,
  delivered_at                TIMESTAMPTZ NULL,
  bounced_at                  TIMESTAMPTZ NULL,
  bounce_reason               TEXT NULL,
  complained_at               TIMESTAMPTZ NULL,
  engagement_opened_at        TIMESTAMPTZ NULL,
  engagement_clicked_at       TIMESTAMPTZ NULL,

  -- Driver usado en el envío (para auditoría / debug)
  transport_driver            VARCHAR(20) NOT NULL,

  -- Auditoría temporal
  queued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at                     TIMESTAMPTZ NULL,
  failed_at                   TIMESTAMPTZ NULL,
  triggered_by_user_id        BIGINT NULL REFERENCES users(id),

  CONSTRAINT notifications_status_ck CHECK (status IN (
    'queued', 'sending', 'sent', 'failed', 'cancelled'
  )),
  CONSTRAINT notifications_delivery_status_ck CHECK (
    delivery_status IS NULL OR delivery_status IN (
      'delivered', 'bounced', 'complained', 'quarantined',
      'expanded_failed', 'suppressed', 'unknown'
    )
  ),
  CONSTRAINT notifications_transport_ck CHECK (transport_driver IN (
    'local', 'azure_acs'
  )),
  CONSTRAINT notifications_recipients_array_ck CHECK (jsonb_typeof(recipients_snapshot) = 'array'),
  CONSTRAINT notifications_recipients_nonempty_ck CHECK (jsonb_array_length(recipients_snapshot) > 0),
  CONSTRAINT notifications_sent_consistency_ck CHECK (
    (status = 'sent'   AND sent_at IS NOT NULL) OR
    (status = 'failed' AND failed_at IS NOT NULL) OR
    (status NOT IN ('sent', 'failed'))
  ),
  CONSTRAINT notifications_attempts_positive_ck CHECK (attempts >= 0)
);

-- Inmutabilidad de columnas críticas post-INSERT (idempotencia del job)
CREATE OR REPLACE FUNCTION fn_notifications_immutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'notifications: code es inmutable post-encolado';
  END IF;
  IF NEW.recipients_snapshot IS DISTINCT FROM OLD.recipients_snapshot THEN
    RAISE EXCEPTION 'notifications: recipients_snapshot es inmutable post-encolado';
  END IF;
  IF NEW.context_snapshot IS DISTINCT FROM OLD.context_snapshot THEN
    RAISE EXCEPTION 'notifications: context_snapshot es inmutable post-encolado';
  END IF;
  IF NEW.queued_at IS DISTINCT FROM OLD.queued_at THEN
    RAISE EXCEPTION 'notifications: queued_at es inmutable';
  END IF;
  IF NEW.transport_driver IS DISTINCT FROM OLD.transport_driver THEN
    RAISE EXCEPTION 'notifications: transport_driver es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_immutable_columns
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION fn_notifications_immutable_columns();

-- Hard delete prohibido (auditoría retención mínima)
CREATE OR REPLACE FUNCTION fn_notifications_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'notifications: hard delete prohibido (auditoría regulatoria).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_no_hard_delete
  BEFORE DELETE ON notifications
  FOR EACH ROW EXECUTE FUNCTION fn_notifications_no_hard_delete();

CREATE INDEX idx_notifications_code              ON notifications(code);
CREATE INDEX idx_notifications_status            ON notifications(status);
CREATE INDEX idx_notifications_queued_pending    ON notifications(queued_at) WHERE status = 'queued';
CREATE INDEX idx_notifications_sent_recent       ON notifications(sent_at DESC) WHERE status = 'sent';
CREATE INDEX idx_notifications_failed            ON notifications(failed_at DESC) WHERE status = 'failed';
CREATE INDEX idx_notifications_acs_message_id    ON notifications(acs_message_id) WHERE acs_message_id IS NOT NULL;
CREATE INDEX idx_notifications_delivery_status   ON notifications(delivery_status) WHERE delivery_status IS NOT NULL;
CREATE INDEX idx_notifications_triggered_by      ON notifications(triggered_by_user_id) WHERE triggered_by_user_id IS NOT NULL;

COMMENT ON TABLE notifications IS 'Cada notificación encolada/enviada. recipients_snapshot y context_snapshot son inmutables — el job es idempotente. Tracking de delivery vía Event Grid actualiza delivery_status. NO almacena el body renderizado (Ley 21.719: minimización).';


-- =============================================================================
-- 3. user_notification_prefs — opt-out por usuario
-- =============================================================================

CREATE TABLE user_notification_prefs (
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_code    VARCHAR(80) NOT NULL REFERENCES notification_templates(code) ON DELETE CASCADE,
  channel          VARCHAR(20) NOT NULL DEFAULT 'email',
  enabled          BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id    BIGINT NULL REFERENCES users(id),

  PRIMARY KEY (user_id, template_code, channel),

  CONSTRAINT unp_channel_ck CHECK (channel IN ('email', 'in_app', 'sms'))
);

CREATE TRIGGER unp_touch_updated_at
  BEFORE UPDATE ON user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validar: no permitir desactivar templates mandatorios
CREATE OR REPLACE FUNCTION fn_unp_block_mandatory_optout()
RETURNS TRIGGER AS $$
DECLARE
  v_is_mandatory BOOLEAN;
BEGIN
  IF NEW.enabled = true THEN
    RETURN NEW;  -- activación siempre permitida
  END IF;

  SELECT is_mandatory INTO v_is_mandatory
  FROM notification_templates WHERE code = NEW.template_code;

  IF v_is_mandatory = true THEN
    RAISE EXCEPTION 'user_notification_prefs: el template % es mandatorio y no se puede desactivar', NEW.template_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER unp_block_mandatory_optout
  BEFORE INSERT OR UPDATE OF enabled ON user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION fn_unp_block_mandatory_optout();

CREATE INDEX idx_unp_user      ON user_notification_prefs(user_id);
CREATE INDEX idx_unp_template  ON user_notification_prefs(template_code);

COMMENT ON TABLE user_notification_prefs IS 'Preferencias de cada usuario por template. Si no hay fila → asumir enabled=true (default opt-in). Templates con is_mandatory=true ignoran esta tabla y siempre se envían.';


-- =============================================================================
-- 4. Auditoría
-- =============================================================================

SELECT fn_audit_attach('notification_templates');
SELECT fn_audit_attach('notifications');
SELECT fn_audit_attach('user_notification_prefs', 'user_id');
