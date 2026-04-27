-- =============================================================================
-- SURP 2.0 — schema/14_surveillance_actors.sql
--
-- Módulo surveillance — Ola 1: Actores y compliance
--
-- Modela el régimen DL 3.607 + DS 93/1985 + Circular OS-10 Carabineros,
-- aplicado al modelo Arauco: la URP no opera personal armado propio sino
-- que contrata empresas externas (organizations.type = 'security_provider').
-- La responsabilidad de Arauco es de fiscalización (culpa in eligendo /
-- in vigilando, CC arts. 2314-2322), por lo que el SURP necesita registrar:
--
--   1. security_contractor_compliance  Compliance corporativo del contratista
--                                      (OS-10 corp, autorización personal armado,
--                                      pólizas de seguros, contacto operativo).
--                                      1:1 con organizations(security_provider).
--
--   2. security_guards                 Personal de seguridad del contratista.
--                                      Categorías DS 867/1985: vigilante_privado,
--                                      guardia_seguridad, nochero, rondin, portero.
--                                      Vinculados a parties para RUT canónico.
--
--   3. security_certifications         Credenciales individuales del guardia
--                                      con vigencia (OS-10 individual, primeros
--                                      auxilios, uso de fuerza, manejo de armas,
--                                      protocolo forestal, otras).
--
--   4. compliance_audits               Auditorías que la URP realiza al
--                                      contratista (cumplimiento documental,
--                                      en terreno, de credenciales, etc.).
--
--   5. compliance_audit_findings       Hallazgos individuales con severidad,
--                                      categoría, plazo de resolución y estado.
--
-- Invariantes (legal-armas-vigilantes):
--   - is_armed_authorized=true requiere guard_type='vigilante_privado'.
--     Cualquier otra categoría que porte arma comete delito Ley 17.798.
--   - organization_id en estas tablas debe ser de tipo 'security_provider'.
--   - Hard delete prohibido en todas (registro regulatorio + auditoría OS-10).
--   - Auditoría cerrada (state='closed') congela campos clave.
--   - Finding resuelto requiere resolved_at + resolved_by_id + resolution_notes.
--   - Datos personales del guardia van bajo Ley 21.719 (base "ejecución de
--     contrato" con el contratista + "interés legítimo" de Arauco).
--
-- Cómo se enchufa con el resto del SURP:
--   - parties      ← party_id en security_guards (RUT canónico).
--   - organizations ← organization_id (security_provider).
--   - users        ← auditor_user_id, resolved_by_id (rol Arauco URP).
--   - audit_logs   ← fn_audit_attach() en todas las tablas.
--   - notifications ← se agrega categoría 'surveillance' al CHECK del template
--                     para emitir alertas de vencimiento (Ola 2 cubre eventos).
-- =============================================================================


-- La categoría 'surveillance' para notification_templates está declarada
-- centralmente en 13_notifications.sql. No reaplicar el CHECK aquí.

-- =============================================================================
-- 1. security_contractor_compliance — 1:1 con organizations(security_provider)
-- =============================================================================

CREATE TABLE security_contractor_compliance (
  organization_id              BIGINT PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  external_id                  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  -- OS-10 corporativo: autorización vigente para operar como empresa
  -- de seguridad privada (DL 3.607 + DS 93/1985).
  os10_authorization_number    VARCHAR(60) NULL,
  os10_authorized_at           DATE NULL,
  os10_expires_at              DATE NULL,
  os10_authority               VARCHAR(120) NOT NULL DEFAULT 'OS-10 Carabineros de Chile',

  -- Autorización de personal armado (separada de OS-10 corp). Solo aplicable
  -- a empresas que efectivamente desplieguen vigilantes privados armados.
  armed_personnel_authorized   BOOLEAN NOT NULL DEFAULT false,
  armed_authorization_number   VARCHAR(60) NULL,
  armed_authorized_at          DATE NULL,
  armed_expires_at             DATE NULL,

  -- Pólizas de seguros (responsabilidad civil obligatoria; fidelidad y vida
  -- típicas en contratos forestales). Se modelan en columnas planas porque son
  -- tres y los campos son simétricos; si más adelante aparecen ramos nuevos
  -- se promueve a tabla insurance_policies (ver TODO).
  rc_insurer                   VARCHAR(120) NULL,
  rc_policy_number             VARCHAR(60)  NULL,
  rc_coverage_uf               NUMERIC(14, 2) NULL,
  rc_expires_at                DATE NULL,

  fidelity_insurer             VARCHAR(120) NULL,
  fidelity_policy_number       VARCHAR(60)  NULL,
  fidelity_expires_at          DATE NULL,

  life_insurer                 VARCHAR(120) NULL,
  life_policy_number           VARCHAR(60)  NULL,
  life_expires_at              DATE NULL,

  -- Contacto operativo (jefe operacional contratista). Party para RUT canónico.
  operational_contact_party_id BIGINT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  operational_contact_phone    VARCHAR(40) NULL,
  operational_contact_email    VARCHAR(160) NULL,

  notes                        TEXT NULL,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id                BIGINT NULL REFERENCES users(id),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id                BIGINT NULL REFERENCES users(id),
  deleted_at                   TIMESTAMPTZ NULL,
  deleted_by_id                BIGINT NULL REFERENCES users(id),

  CONSTRAINT scc_os10_dates_ck CHECK (
    (os10_authorized_at IS NULL AND os10_expires_at IS NULL)
    OR (os10_authorized_at IS NOT NULL AND os10_expires_at IS NOT NULL
        AND os10_expires_at >= os10_authorized_at)
  ),
  CONSTRAINT scc_armed_consistency_ck CHECK (
    (armed_personnel_authorized = false
       AND armed_authorization_number IS NULL
       AND armed_authorized_at IS NULL
       AND armed_expires_at IS NULL)
    OR (armed_personnel_authorized = true
       AND armed_authorization_number IS NOT NULL
       AND armed_authorized_at IS NOT NULL
       AND armed_expires_at IS NOT NULL
       AND armed_expires_at >= armed_authorized_at)
  ),
  CONSTRAINT scc_rc_consistency_ck CHECK (
    (rc_policy_number IS NULL AND rc_insurer IS NULL AND rc_expires_at IS NULL)
    OR (rc_policy_number IS NOT NULL AND rc_insurer IS NOT NULL AND rc_expires_at IS NOT NULL)
  ),
  CONSTRAINT scc_fidelity_consistency_ck CHECK (
    (fidelity_policy_number IS NULL AND fidelity_insurer IS NULL AND fidelity_expires_at IS NULL)
    OR (fidelity_policy_number IS NOT NULL AND fidelity_insurer IS NOT NULL AND fidelity_expires_at IS NOT NULL)
  ),
  CONSTRAINT scc_life_consistency_ck CHECK (
    (life_policy_number IS NULL AND life_insurer IS NULL AND life_expires_at IS NULL)
    OR (life_policy_number IS NOT NULL AND life_insurer IS NOT NULL AND life_expires_at IS NOT NULL)
  ),
  CONSTRAINT scc_email_format_ck CHECK (
    operational_contact_email IS NULL
    OR operational_contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

CREATE TRIGGER scc_touch_updated_at
  BEFORE UPDATE ON security_contractor_compliance
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: la organización debe ser security_provider.
CREATE OR REPLACE FUNCTION fn_scc_validate_org_type()
RETURNS TRIGGER AS $$
DECLARE
  v_type VARCHAR(30);
BEGIN
  SELECT type INTO v_type FROM organizations WHERE id = NEW.organization_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'security_contractor_compliance: organización % no existe', NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_type <> 'security_provider' THEN
    RAISE EXCEPTION 'security_contractor_compliance solo aplica a organizations.type=security_provider (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scc_validate_org_type
  BEFORE INSERT OR UPDATE OF organization_id ON security_contractor_compliance
  FOR EACH ROW EXECUTE FUNCTION fn_scc_validate_org_type();

-- Hard delete prohibido (registro regulatorio).
CREATE OR REPLACE FUNCTION fn_scc_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_contractor_compliance: hard delete prohibido. Usar UPDATE deleted_at = now().';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scc_no_hard_delete
  BEFORE DELETE ON security_contractor_compliance
  FOR EACH ROW EXECUTE FUNCTION fn_scc_no_hard_delete();

CREATE INDEX idx_scc_os10_expires      ON security_contractor_compliance(os10_expires_at)     WHERE deleted_at IS NULL AND os10_expires_at IS NOT NULL;
CREATE INDEX idx_scc_armed_expires     ON security_contractor_compliance(armed_expires_at)    WHERE deleted_at IS NULL AND armed_expires_at IS NOT NULL;
CREATE INDEX idx_scc_rc_expires        ON security_contractor_compliance(rc_expires_at)       WHERE deleted_at IS NULL AND rc_expires_at IS NOT NULL;
CREATE INDEX idx_scc_fidelity_expires  ON security_contractor_compliance(fidelity_expires_at) WHERE deleted_at IS NULL AND fidelity_expires_at IS NOT NULL;
CREATE INDEX idx_scc_life_expires      ON security_contractor_compliance(life_expires_at)     WHERE deleted_at IS NULL AND life_expires_at IS NOT NULL;
CREATE INDEX idx_scc_op_contact_party  ON security_contractor_compliance(operational_contact_party_id) WHERE operational_contact_party_id IS NOT NULL;

COMMENT ON TABLE security_contractor_compliance IS
  'Compliance corporativo de la empresa de seguridad contratista. Cubre OS-10 corp, autorización de personal armado, pólizas RC/fidelidad/vida y contacto operativo. Una fila por organización security_provider. Hard delete prohibido.';
COMMENT ON COLUMN security_contractor_compliance.armed_personnel_authorized IS
  'true solo si la empresa tiene autorización vigente de OS-10 para desplegar personal armado. Independiente de OS-10 corp porque no toda empresa autorizada despliega personal armado.';
COMMENT ON COLUMN security_contractor_compliance.rc_coverage_uf IS
  'Cobertura de la póliza de responsabilidad civil expresada en UF (clausa contractual estándar Arauco).';


-- =============================================================================
-- 2. security_guards — personal de seguridad del contratista
-- =============================================================================

CREATE TABLE security_guards (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  party_id            BIGINT NOT NULL REFERENCES parties(id)        ON DELETE RESTRICT,

  guard_type          VARCHAR(30) NOT NULL,
  is_armed_authorized BOOLEAN NOT NULL DEFAULT false,

  hire_date           DATE NOT NULL,
  termination_date    DATE NULL,
  termination_reason  TEXT NULL,

  badge_number        VARCHAR(40) NULL,        -- número credencial interno empresa
  internal_role       VARCHAR(80) NULL,        -- rol interno asignado por la empresa
  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT sg_guard_type_ck CHECK (guard_type IN (
    'vigilante_privado', 'guardia_seguridad', 'nochero', 'rondin', 'portero'
  )),
  -- Solo el vigilante_privado puede portar arma. Cualquier otro tipo armado
  -- comete delito Ley 17.798. Modelado a nivel SQL.
  CONSTRAINT sg_armed_only_vigilante_ck CHECK (
    is_armed_authorized = false OR guard_type = 'vigilante_privado'
  ),
  CONSTRAINT sg_termination_dates_ck CHECK (
    termination_date IS NULL OR termination_date >= hire_date
  ),
  CONSTRAINT sg_termination_reason_ck CHECK (
    (termination_date IS NULL AND termination_reason IS NULL)
    OR (termination_date IS NOT NULL AND termination_reason IS NOT NULL)
  )
);

CREATE TRIGGER sg_touch_updated_at
  BEFORE UPDATE ON security_guards
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: la organización debe ser security_provider.
CREATE OR REPLACE FUNCTION fn_sg_validate_org_type()
RETURNS TRIGGER AS $$
DECLARE
  v_type VARCHAR(30);
BEGIN
  SELECT type INTO v_type FROM organizations WHERE id = NEW.organization_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'security_guards: organización % no existe', NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_type <> 'security_provider' THEN
    RAISE EXCEPTION 'security_guards solo aplica a organizations.type=security_provider (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sg_validate_org_type
  BEFORE INSERT OR UPDATE OF organization_id ON security_guards
  FOR EACH ROW EXECUTE FUNCTION fn_sg_validate_org_type();

-- Validación: party debe ser persona natural (no legal_entity).
CREATE OR REPLACE FUNCTION fn_sg_validate_party_natural()
RETURNS TRIGGER AS $$
DECLARE
  v_party_type VARCHAR(30);
BEGIN
  SELECT party_type INTO v_party_type FROM parties WHERE id = NEW.party_id;
  IF v_party_type IS NULL THEN
    RAISE EXCEPTION 'security_guards: party % no existe', NEW.party_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_party_type <> 'natural_person' THEN
    RAISE EXCEPTION 'security_guards: party_id debe ser party_type=natural_person (got %)', v_party_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sg_validate_party_natural
  BEFORE INSERT OR UPDATE OF party_id ON security_guards
  FOR EACH ROW EXECUTE FUNCTION fn_sg_validate_party_natural();

-- Hard delete prohibido (registro regulatorio).
CREATE OR REPLACE FUNCTION fn_sg_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_guards: hard delete prohibido. Usar UPDATE termination_date = ... + termination_reason o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sg_no_hard_delete
  BEFORE DELETE ON security_guards
  FOR EACH ROW EXECUTE FUNCTION fn_sg_no_hard_delete();

-- Un mismo party no puede ser guardia activo en dos organizaciones distintas
-- al mismo tiempo (regla operativa: el contratista debe darlo de baja antes
-- de que pase a otra empresa).
CREATE UNIQUE INDEX idx_sg_active_party_uq
  ON security_guards(party_id)
  WHERE deleted_at IS NULL AND termination_date IS NULL;

CREATE INDEX idx_sg_org             ON security_guards(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sg_org_active      ON security_guards(organization_id) WHERE deleted_at IS NULL AND termination_date IS NULL;
CREATE INDEX idx_sg_guard_type      ON security_guards(guard_type)      WHERE deleted_at IS NULL;
CREATE INDEX idx_sg_armed           ON security_guards(is_armed_authorized) WHERE deleted_at IS NULL AND is_armed_authorized = true;
CREATE INDEX idx_sg_party           ON security_guards(party_id)        WHERE deleted_at IS NULL;

COMMENT ON TABLE security_guards IS
  'Personal de seguridad del contratista. Categorías DS 867/1985. Solo vigilante_privado puede tener is_armed_authorized=true. Vinculado a parties para RUT canónico. Hard delete prohibido (registro regulatorio).';
COMMENT ON COLUMN security_guards.is_armed_authorized IS
  'true requiere guard_type=vigilante_privado. Constatación a posteriori cuando el guardia reporta incidente con arma (Ley 17.798).';
COMMENT ON COLUMN security_guards.badge_number IS
  'Número de credencial interno del contratista (NO la credencial OS-10 individual; esa va en security_certifications).';


-- =============================================================================
-- 3. security_certifications — credenciales individuales con vigencia
-- =============================================================================

CREATE TABLE security_certifications (
  id                       BIGSERIAL PRIMARY KEY,
  external_id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  guard_id                 BIGINT NOT NULL REFERENCES security_guards(id) ON DELETE RESTRICT,

  cert_type                VARCHAR(40) NOT NULL,
  certification_number     VARCHAR(80) NULL,
  issuing_entity           VARCHAR(200) NOT NULL,

  issued_at                DATE NOT NULL,
  expires_at               DATE NULL,                -- NULL = sin caducidad declarada
  status                   VARCHAR(20) NOT NULL DEFAULT 'vigente',

  document_url             TEXT NULL,                -- ruta StorageService
  notes                    TEXT NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id            BIGINT NULL REFERENCES users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id            BIGINT NULL REFERENCES users(id),
  deleted_at               TIMESTAMPTZ NULL,
  deleted_by_id            BIGINT NULL REFERENCES users(id),

  CONSTRAINT sec_cert_type_ck CHECK (cert_type IN (
    'os10_credential',         -- credencial OS-10 individual del vigilante privado
    'first_aid',               -- primeros auxilios
    'use_of_force',            -- uso de fuerza / contención
    'firearms',                -- manejo de armas (solo vigilante_privado)
    'forestry_protocol',       -- protocolo Arauco específico
    'fire_response',           -- respuesta inicial ante fuego
    'driving_license',         -- licencia de conducir (rondines vehiculares)
    'other'
  )),
  CONSTRAINT sec_cert_status_ck CHECK (status IN (
    'vigente', 'vencida', 'suspendida', 'revocada'
  )),
  CONSTRAINT sec_cert_dates_ck CHECK (
    expires_at IS NULL OR expires_at >= issued_at
  )
);

CREATE TRIGGER sec_cert_touch_updated_at
  BEFORE UPDATE ON security_certifications
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido (registro regulatorio).
CREATE OR REPLACE FUNCTION fn_sec_cert_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_certifications: hard delete prohibido. Usar UPDATE status=revocada/suspendida o deleted_at.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sec_cert_no_hard_delete
  BEFORE DELETE ON security_certifications
  FOR EACH ROW EXECUTE FUNCTION fn_sec_cert_no_hard_delete();

-- Una sola certificación 'vigente' del mismo cert_type por guard activo.
CREATE UNIQUE INDEX idx_sec_cert_one_active_per_type
  ON security_certifications(guard_id, cert_type)
  WHERE deleted_at IS NULL AND status = 'vigente';

CREATE INDEX idx_sec_cert_guard       ON security_certifications(guard_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_sec_cert_type        ON security_certifications(cert_type)  WHERE deleted_at IS NULL;
CREATE INDEX idx_sec_cert_status      ON security_certifications(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_sec_cert_expires     ON security_certifications(expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

COMMENT ON TABLE security_certifications IS
  'Credenciales individuales del guardia con vigencia. cert_type=os10_credential corresponde a la credencial OS-10 del vigilante privado armado (Ley 17.798 + DL 3.607). Hard delete prohibido.';


-- =============================================================================
-- 4. compliance_audits — auditorías URP al contratista
-- =============================================================================

CREATE TABLE compliance_audits (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  audit_date          DATE NOT NULL,
  audit_type          VARCHAR(30) NOT NULL,
  scope               TEXT NOT NULL,
  auditor_user_id     BIGINT NOT NULL REFERENCES users(id),

  state               VARCHAR(20) NOT NULL DEFAULT 'draft',
  overall_result      VARCHAR(30) NULL,                -- obligatorio al cerrar
  closed_at           TIMESTAMPTZ NULL,
  closed_by_id        BIGINT NULL REFERENCES users(id),

  notes               TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT ca_audit_type_ck CHECK (audit_type IN (
    'os10_documentation',      -- revisión documental OS-10
    'on_site',                 -- terreno (visita al predio)
    'guard_credentials',       -- revisión credenciales individuales
    'incident_review',         -- revisión de incidentes reportados
    'periodic'                 -- auditoría periódica programada
  )),
  CONSTRAINT ca_state_ck CHECK (state IN ('draft', 'in_progress', 'closed')),
  CONSTRAINT ca_overall_result_ck CHECK (
    overall_result IS NULL OR overall_result IN (
      'compliant', 'minor_findings', 'major_findings', 'non_compliant'
    )
  ),
  CONSTRAINT ca_closed_consistency_ck CHECK (
    (state = 'closed' AND closed_at IS NOT NULL AND closed_by_id IS NOT NULL AND overall_result IS NOT NULL)
    OR (state <> 'closed' AND closed_at IS NULL AND closed_by_id IS NULL)
  )
);

CREATE TRIGGER ca_touch_updated_at
  BEFORE UPDATE ON compliance_audits
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Validación: la organización auditada debe ser security_provider.
CREATE OR REPLACE FUNCTION fn_ca_validate_org_type()
RETURNS TRIGGER AS $$
DECLARE
  v_type VARCHAR(30);
BEGIN
  SELECT type INTO v_type FROM organizations WHERE id = NEW.organization_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'compliance_audits: organización % no existe', NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_type <> 'security_provider' THEN
    RAISE EXCEPTION 'compliance_audits solo aplica a organizations.type=security_provider (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ca_validate_org_type
  BEFORE INSERT OR UPDATE OF organization_id ON compliance_audits
  FOR EACH ROW EXECUTE FUNCTION fn_ca_validate_org_type();

-- Cuando state pasa a 'closed' se congelan campos clave: organization_id,
-- audit_date, audit_type, scope, auditor_user_id, overall_result. notes
-- y findings asociados pueden seguir editándose (anexos post-cierre).
CREATE OR REPLACE FUNCTION fn_ca_immutable_when_closed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state = 'closed' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.audit_date     IS DISTINCT FROM OLD.audit_date
       OR NEW.audit_type     IS DISTINCT FROM OLD.audit_type
       OR NEW.scope          IS DISTINCT FROM OLD.scope
       OR NEW.auditor_user_id IS DISTINCT FROM OLD.auditor_user_id
       OR NEW.overall_result IS DISTINCT FROM OLD.overall_result
       OR NEW.closed_at      IS DISTINCT FROM OLD.closed_at
       OR NEW.closed_by_id   IS DISTINCT FROM OLD.closed_by_id THEN
      RAISE EXCEPTION 'compliance_audits: campos clave inmutables tras cierre. Para corrección abrir auditoría nueva o usar notes.';
    END IF;
    -- No se puede reabrir.
    IF NEW.state <> 'closed' THEN
      RAISE EXCEPTION 'compliance_audits: una auditoría cerrada no se puede reabrir.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ca_immutable_when_closed
  BEFORE UPDATE ON compliance_audits
  FOR EACH ROW EXECUTE FUNCTION fn_ca_immutable_when_closed();

-- Hard delete prohibido (auditoría regulatoria + responsabilidad URP).
CREATE OR REPLACE FUNCTION fn_ca_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'compliance_audits: hard delete prohibido. Usar UPDATE deleted_at = now().';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ca_no_hard_delete
  BEFORE DELETE ON compliance_audits
  FOR EACH ROW EXECUTE FUNCTION fn_ca_no_hard_delete();

CREATE INDEX idx_ca_org             ON compliance_audits(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ca_audit_date      ON compliance_audits(audit_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ca_state           ON compliance_audits(state)           WHERE deleted_at IS NULL;
CREATE INDEX idx_ca_overall_result  ON compliance_audits(overall_result)  WHERE deleted_at IS NULL AND overall_result IS NOT NULL;

COMMENT ON TABLE compliance_audits IS
  'Auditorías URP al contratista de seguridad. Cubre culpa in vigilando (CC art. 2320). Se cierra con overall_result obligatorio. Tras cierre, campos clave son inmutables.';


-- =============================================================================
-- 5. compliance_audit_findings — hallazgos individuales
-- =============================================================================

CREATE TABLE compliance_audit_findings (
  id                  BIGSERIAL PRIMARY KEY,
  external_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  audit_id            BIGINT NOT NULL REFERENCES compliance_audits(id) ON DELETE RESTRICT,

  severity            VARCHAR(20) NOT NULL,
  category            VARCHAR(40) NOT NULL,
  description         TEXT NOT NULL,
  recommendation      TEXT NULL,

  -- Plazo de resolución acordado con el contratista.
  due_at              DATE NULL,

  status              VARCHAR(30) NOT NULL DEFAULT 'open',
  resolved_at         TIMESTAMPTZ NULL,
  resolved_by_id      BIGINT NULL REFERENCES users(id),
  resolution_notes    TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id       BIGINT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_id       BIGINT NULL REFERENCES users(id),
  deleted_at          TIMESTAMPTZ NULL,
  deleted_by_id       BIGINT NULL REFERENCES users(id),

  CONSTRAINT caf_severity_ck CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT caf_category_ck CHECK (category IN (
    'os10_expired',
    'os10_missing',
    'cert_expired',
    'cert_missing',
    'unauthorized_arm',         -- guardia portó arma sin autorización
    'training_gap',
    'documentation',
    'unsafe_practice',          -- conducta contraria a protocolo
    'reporting_delay',          -- reporte de incidente fuera de plazo contractual
    'insurance_gap',
    'other'
  )),
  CONSTRAINT caf_status_ck CHECK (status IN (
    'open', 'in_progress', 'resolved', 'accepted_risk'
  )),
  CONSTRAINT caf_resolution_consistency_ck CHECK (
    (status NOT IN ('resolved', 'accepted_risk')
       AND resolved_at IS NULL AND resolved_by_id IS NULL AND resolution_notes IS NULL)
    OR (status IN ('resolved', 'accepted_risk')
       AND resolved_at IS NOT NULL AND resolved_by_id IS NOT NULL AND resolution_notes IS NOT NULL)
  )
);

CREATE TRIGGER caf_touch_updated_at
  BEFORE UPDATE ON compliance_audit_findings
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Hard delete prohibido.
CREATE OR REPLACE FUNCTION fn_caf_no_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'compliance_audit_findings: hard delete prohibido. Usar UPDATE deleted_at o status=accepted_risk.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER caf_no_hard_delete
  BEFORE DELETE ON compliance_audit_findings
  FOR EACH ROW EXECUTE FUNCTION fn_caf_no_hard_delete();

-- audit_id es inmutable: un hallazgo no se traspasa de una auditoría a otra.
CREATE OR REPLACE FUNCTION fn_caf_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.audit_id IS DISTINCT FROM OLD.audit_id THEN
    RAISE EXCEPTION 'compliance_audit_findings: audit_id es inmutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER caf_audit_immutable
  BEFORE UPDATE ON compliance_audit_findings
  FOR EACH ROW EXECUTE FUNCTION fn_caf_audit_immutable();

CREATE INDEX idx_caf_audit         ON compliance_audit_findings(audit_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_caf_severity      ON compliance_audit_findings(severity)  WHERE deleted_at IS NULL;
CREATE INDEX idx_caf_category      ON compliance_audit_findings(category)  WHERE deleted_at IS NULL;
CREATE INDEX idx_caf_status        ON compliance_audit_findings(status)    WHERE deleted_at IS NULL;
CREATE INDEX idx_caf_due           ON compliance_audit_findings(due_at)    WHERE deleted_at IS NULL AND status IN ('open', 'in_progress') AND due_at IS NOT NULL;

COMMENT ON TABLE compliance_audit_findings IS
  'Hallazgos de auditoría URP. Severity + category determinan urgencia. Cuando status=resolved/accepted_risk se exigen resolved_at + resolved_by_id + resolution_notes.';


-- =============================================================================
-- 6. Auditoría
-- =============================================================================

SELECT fn_audit_attach('security_contractor_compliance', 'organization_id');
SELECT fn_audit_attach('security_guards');
SELECT fn_audit_attach('security_certifications');
SELECT fn_audit_attach('compliance_audits');
SELECT fn_audit_attach('compliance_audit_findings');
