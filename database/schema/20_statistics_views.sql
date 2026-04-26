-- =============================================================================
-- SURP 2.0 — schema/20_statistics_views.sql
--
-- Statistics — Ola 2: Materialized Views
--
-- Capa de denormalización agregada para alimentar los 19 reportes del catálogo.
-- Refrescadas nightly por worker BullMQ vía fn_refresh_statistics_views().
--
-- Convenciones:
--   - Nombre `mv_<dominio>_<resumen>`.
--   - Cada MV tiene UNIQUE INDEX para soportar REFRESH CONCURRENTLY.
--   - Sin FK (es un MV; las FKs se infieren de las tablas fuente).
--   - Las queries respetan deleted_at = NULL en todas las tablas fuente.
--   - Joins a través de natural_persons / parties para display_name de
--     abogados (users.party_id → parties.display_name).
--
-- MVs:
--   1. mv_incidents_summary_by_zone_month   incidents agregados (zone, mes, tipo)
--   2. mv_avaluo_summary_by_zone_month      avaluo bienes afectados agregado
--   3. mv_cases_summary                     una fila por causa con denormalización
--   4. mv_case_imputados_summary            count imputados/etc por causa
--   5. mv_attorney_workload                 una fila por abogado con cargas
--   6. mv_complaints_followup               denuncias con follow-up activo
--   7. mv_surveillance_shifts_kpis          KPIs de turnos por (org, zone, mes)
--   8. mv_surveillance_critical_events_summary  eventos críticos agregados
--   9. mv_compliance_expiring_summary       compliance con vencimientos próximos
--
-- Helper:
--   fn_refresh_statistics_views()           refresca todas; retorna metrics.
-- =============================================================================


-- =============================================================================
-- 1. mv_incidents_summary_by_zone_month
-- =============================================================================
-- Alimenta: incidents.hallazgos_por_zona, general.estadistica_mensual
-- Granularidad: (zone_id, year, month, incident_type_id) → count + state breakdown.

CREATE MATERIALIZED VIEW mv_incidents_summary_by_zone_month AS
SELECT
  z.id                                                          AS zone_id,
  z.name                                                        AS zone_name,
  z.short_code                                                  AS zone_short_code,
  EXTRACT(YEAR  FROM i.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS year,
  EXTRACT(MONTH FROM i.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS month,
  it.id                                                         AS incident_type_id,
  it.code                                                       AS incident_type_code,
  it.name                                                       AS incident_type_name,
  count(*)                                                      AS incidents_count,
  count(*) FILTER (WHERE i.state = 'draft')                     AS incidents_draft,
  count(*) FILTER (WHERE i.state = 'submitted')                 AS incidents_submitted,
  count(*) FILTER (WHERE i.state = 'voided')                    AS incidents_voided
FROM incidents i
JOIN zones z              ON z.id  = i.zone_id           AND z.deleted_at  IS NULL
JOIN incident_types it    ON it.id = i.incident_type_id
WHERE i.deleted_at IS NULL
GROUP BY z.id, z.name, z.short_code,
         EXTRACT(YEAR  FROM i.occurred_at AT TIME ZONE 'America/Santiago'),
         EXTRACT(MONTH FROM i.occurred_at AT TIME ZONE 'America/Santiago'),
         it.id, it.code, it.name
WITH NO DATA;

CREATE UNIQUE INDEX mv_incidents_summary_zone_month_uq
  ON mv_incidents_summary_by_zone_month (zone_id, year, month, incident_type_id);
CREATE INDEX mv_incidents_summary_year_month_ix
  ON mv_incidents_summary_by_zone_month (year, month);
CREATE INDEX mv_incidents_summary_zone_ix
  ON mv_incidents_summary_by_zone_month (zone_id);

COMMENT ON MATERIALIZED VIEW mv_incidents_summary_by_zone_month IS
  'Incidentes agregados por (zona, año, mes, tipo). Alimenta hallazgos_por_zona y estadistica_mensual.';


-- =============================================================================
-- 2. mv_avaluo_summary_by_zone_month
-- =============================================================================
-- Alimenta: incidents.avaluo_por_zona, general.estadistica_mensual
-- Sum de estimated_value_clp y recovered_value_clp agrupado por
-- (zone_id, year, month, asset_type_id) usando occurred_at del incidente.

CREATE MATERIALIZED VIEW mv_avaluo_summary_by_zone_month AS
SELECT
  z.id                                                          AS zone_id,
  z.name                                                        AS zone_name,
  z.short_code                                                  AS zone_short_code,
  EXTRACT(YEAR  FROM i.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS year,
  EXTRACT(MONTH FROM i.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS month,
  at.id                                                         AS asset_type_id,
  at.code                                                       AS asset_type_code,
  at.name                                                       AS asset_type_name,
  count(*)                                                      AS records_count,
  COALESCE(sum(aa.estimated_value_clp), 0)                      AS estimated_value_total_clp,
  COALESCE(sum(aa.recovered_value_clp), 0)                      AS recovered_value_total_clp,
  count(*) FILTER (WHERE aa.recovery_status = 'full')           AS recoveries_full,
  count(*) FILTER (WHERE aa.recovery_status = 'partial')        AS recoveries_partial,
  count(*) FILTER (WHERE aa.recovery_status = 'not_recovered')  AS recoveries_none
FROM assets_affected aa
JOIN incidents i          ON i.id  = aa.incident_id      AND i.deleted_at  IS NULL
JOIN zones z              ON z.id  = i.zone_id           AND z.deleted_at  IS NULL
JOIN asset_types at       ON at.id = aa.asset_type_id
WHERE aa.deleted_at IS NULL
GROUP BY z.id, z.name, z.short_code,
         EXTRACT(YEAR  FROM i.occurred_at AT TIME ZONE 'America/Santiago'),
         EXTRACT(MONTH FROM i.occurred_at AT TIME ZONE 'America/Santiago'),
         at.id, at.code, at.name
WITH NO DATA;

CREATE UNIQUE INDEX mv_avaluo_summary_zone_month_uq
  ON mv_avaluo_summary_by_zone_month (zone_id, year, month, asset_type_id);
CREATE INDEX mv_avaluo_summary_year_month_ix
  ON mv_avaluo_summary_by_zone_month (year, month);

COMMENT ON MATERIALIZED VIEW mv_avaluo_summary_by_zone_month IS
  'Avaluo bienes afectados agregado por (zona, mes, tipo). Suma estimado y recuperado en CLP.';


-- =============================================================================
-- 3. mv_cases_summary
-- =============================================================================
-- Alimenta: cases.causas_por_zona, causas_terminadas, gestion_legal, etc.
-- Una fila por causa con denormalización: zona principal (vía incidente más
-- antiguo del caso), abogado titular activo, prosecutor, materia, tribunal.

CREATE MATERIALIZED VIEW mv_cases_summary AS
WITH case_zones AS (
  -- Zona del incidente más antiguo del caso (heurística "zona principal").
  SELECT DISTINCT ON (ci.case_id)
    ci.case_id,
    i.zone_id
  FROM case_incidents ci
  JOIN incidents i ON i.id = ci.incident_id AND i.deleted_at IS NULL
  ORDER BY ci.case_id, i.occurred_at ASC
),
case_titular AS (
  SELECT
    ca.case_id,
    ca.attorney_user_id,
    p.display_name AS attorney_display_name
  FROM case_attorneys ca
  LEFT JOIN users  u ON u.id = ca.attorney_user_id
  LEFT JOIN parties p ON p.id = u.party_id
  WHERE ca.role_code = 'TITULAR' AND ca.assigned_until IS NULL
)
SELECT
  c.id                                AS case_id,
  c.internal_code,
  c.rit,
  c.ruc,
  c.matter_id,
  cm.code                             AS matter_code,
  cm.name                             AS matter_name,
  c.court_id,
  ct.name                             AS court_name,
  c.prosecutor_id,
  c.state                             AS case_state,
  c.closure_form,
  c.procedural_stage,
  c.started_at,
  c.closed_at,
  c.monto_demandado_clp,
  c.monto_otorgado_clp,
  c.monto_cobrado_clp,
  cz.zone_id                          AS primary_zone_id,
  z.name                              AS primary_zone_name,
  z.short_code                        AS primary_zone_short_code,
  cti.attorney_user_id                AS titular_attorney_user_id,
  cti.attorney_display_name           AS titular_attorney_display_name,
  EXTRACT(YEAR  FROM c.started_at AT TIME ZONE 'America/Santiago')::INT  AS started_year,
  EXTRACT(MONTH FROM c.started_at AT TIME ZONE 'America/Santiago')::INT  AS started_month,
  EXTRACT(YEAR  FROM c.closed_at  AT TIME ZONE 'America/Santiago')::INT  AS closed_year,
  EXTRACT(MONTH FROM c.closed_at  AT TIME ZONE 'America/Santiago')::INT  AS closed_month
FROM cases c
JOIN case_matters cm ON cm.id = c.matter_id
LEFT JOIN courts ct  ON ct.id = c.court_id
LEFT JOIN case_zones cz ON cz.case_id = c.id
LEFT JOIN zones z       ON z.id = cz.zone_id
LEFT JOIN case_titular cti ON cti.case_id = c.id
WHERE c.deleted_at IS NULL
WITH NO DATA;

CREATE UNIQUE INDEX mv_cases_summary_pk
  ON mv_cases_summary (case_id);
CREATE INDEX mv_cases_summary_state_ix         ON mv_cases_summary (case_state);
CREATE INDEX mv_cases_summary_closure_form_ix  ON mv_cases_summary (closure_form) WHERE closure_form IS NOT NULL;
CREATE INDEX mv_cases_summary_zone_ix          ON mv_cases_summary (primary_zone_id);
CREATE INDEX mv_cases_summary_titular_ix       ON mv_cases_summary (titular_attorney_user_id);
CREATE INDEX mv_cases_summary_started_ix       ON mv_cases_summary (started_year, started_month);
CREATE INDEX mv_cases_summary_closed_ix        ON mv_cases_summary (closed_year, closed_month);

COMMENT ON MATERIALIZED VIEW mv_cases_summary IS
  'Resumen de causas: una fila por case_id con zona principal (incidente más antiguo), abogado titular activo, materia, tribunal. Alimenta los reportes de cases.';


-- =============================================================================
-- 4. mv_case_imputados_summary
-- =============================================================================
-- Alimenta: cases.numero_imputados, cases.abogados_causa_imputados.
-- Cuenta imputados (rol procesal IMPUTADO/FORMALIZED/ACCUSED) por causa.

CREATE MATERIALIZED VIEW mv_case_imputados_summary AS
SELECT
  cp.case_id,
  count(*) FILTER (WHERE cp.role_code IN ('IMPUTADO', 'FORMALIZED', 'ACCUSED', 'CONVICTED')) AS imputados_total,
  count(*) FILTER (WHERE cp.role_code = 'IMPUTADO')        AS imputados_status_imputado,
  count(*) FILTER (WHERE cp.role_code = 'FORMALIZED')      AS imputados_status_formalized,
  count(*) FILTER (WHERE cp.role_code = 'ACCUSED')         AS imputados_status_accused,
  count(*) FILTER (WHERE cp.role_code = 'CONVICTED')       AS imputados_status_convicted,
  count(*) FILTER (WHERE cp.role_code = 'WITNESS')         AS witnesses_count,
  count(*) FILTER (WHERE cp.role_code = 'VICTIMA')         AS victims_count
FROM case_parties cp
WHERE cp.left_at IS NULL
GROUP BY cp.case_id
WITH NO DATA;

CREATE UNIQUE INDEX mv_case_imputados_summary_pk ON mv_case_imputados_summary (case_id);

COMMENT ON MATERIALIZED VIEW mv_case_imputados_summary IS
  'Conteo de personas vinculadas a una causa por rol procesal. Solo cuenta vínculos sin left_at (vigentes).';


-- =============================================================================
-- 5. mv_attorney_workload
-- =============================================================================
-- Alimenta: cases.causas_por_abogado, abogados_ultimos_6_meses,
-- abogados_causa_imputados, gestion_legal.
-- Una fila por abogado con: causas activas, cerradas en 6 meses, total
-- imputados en sus causas activas.

CREATE MATERIALIZED VIEW mv_attorney_workload AS
WITH attorney_cases AS (
  SELECT
    ca.attorney_user_id,
    ca.case_id,
    ca.role_code,
    ca.assigned_from,
    ca.assigned_until,
    cs.case_state,
    cs.closed_at,
    cs.primary_zone_id
  FROM case_attorneys ca
  JOIN mv_cases_summary cs ON cs.case_id = ca.case_id
)
SELECT
  u.id                                  AS attorney_user_id,
  u.email                               AS attorney_email,
  u.display_name                        AS attorney_display_name,
  u.organization_id                     AS attorney_organization_id,
  count(*) FILTER (WHERE ac.assigned_until IS NULL AND ac.case_state = 'active' AND ac.role_code = 'TITULAR')
                                        AS active_cases_titular,
  count(*) FILTER (WHERE ac.assigned_until IS NULL AND ac.case_state = 'active' AND ac.role_code = 'APOYO')
                                        AS active_cases_support,
  count(DISTINCT ac.case_id) FILTER (WHERE ac.case_state = 'closed' AND ac.closed_at >= now() - INTERVAL '180 days')
                                        AS closed_cases_last_180_days,
  count(DISTINCT ac.primary_zone_id) FILTER (WHERE ac.assigned_until IS NULL AND ac.case_state = 'active' AND ac.primary_zone_id IS NOT NULL)
                                        AS active_zones_count,
  count(DISTINCT ac.case_id)            AS total_cases_ever
FROM users u
LEFT JOIN attorney_cases ac ON ac.attorney_user_id = u.id
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id
    AND r.name IN ('lawyer', 'lawyer_admin', 'field_lawyer', 'external_lawyer')
)
GROUP BY u.id, u.email, u.display_name, u.organization_id
WITH NO DATA;

CREATE UNIQUE INDEX mv_attorney_workload_pk ON mv_attorney_workload (attorney_user_id);
CREATE INDEX mv_attorney_workload_active_ix ON mv_attorney_workload (active_cases_titular DESC);

COMMENT ON MATERIALIZED VIEW mv_attorney_workload IS
  'Carga de trabajo por abogado: causas activas (titular/apoyo), cerradas últimos 180 días, zonas distintas. Solo usuarios con rol lawyer*.';


-- =============================================================================
-- 6. mv_complaints_followup
-- =============================================================================
-- Alimenta: complaints.followup_status.
-- Denuncias con seguimiento penal activo + plazos próximos.

CREATE MATERIALIZED VIEW mv_complaints_followup AS
SELECT
  c.id                                AS complaint_id,
  c.complaint_number,
  c.institution,
  c.filed_at,
  c.formalization_date,
  c.state                             AS complaint_state,
  c.penal_followup,
  c.penal_followup_started_at,
  EXTRACT(DAY FROM now() - c.filed_at)::INT AS days_since_filed,
  CASE
    WHEN c.formalization_date IS NULL THEN
      EXTRACT(DAY FROM now() - c.filed_at)::INT
    ELSE
      EXTRACT(DAY FROM now() - c.formalization_date)::INT
  END                                 AS days_in_followup,
  i.zone_id                           AS incident_zone_id,
  z.name                              AS incident_zone_name,
  z.short_code                        AS incident_zone_short_code,
  pu.id                               AS police_unit_id,
  pu.name                             AS police_unit_name,
  po.id                               AS prosecutor_office_id,
  po.name                             AS prosecutor_office_name
FROM complaints c
LEFT JOIN incidents i        ON i.id  = c.incident_id          AND i.deleted_at  IS NULL
LEFT JOIN zones z            ON z.id  = i.zone_id              AND z.deleted_at  IS NULL
LEFT JOIN police_units pu    ON pu.id = c.police_unit_id       AND pu.deleted_at IS NULL
LEFT JOIN prosecutor_offices po ON po.id = c.prosecutor_office_id AND po.deleted_at IS NULL
WHERE c.deleted_at IS NULL
WITH NO DATA;

CREATE UNIQUE INDEX mv_complaints_followup_pk ON mv_complaints_followup (complaint_id);
CREATE INDEX mv_complaints_followup_followup_ix ON mv_complaints_followup (penal_followup);
CREATE INDEX mv_complaints_followup_state_ix ON mv_complaints_followup (complaint_state);
CREATE INDEX mv_complaints_followup_days_ix ON mv_complaints_followup (days_in_followup DESC);

COMMENT ON MATERIALIZED VIEW mv_complaints_followup IS
  'Denuncias con denormalización de zona/unidad/fiscalía + cálculo de días desde filing y desde formalización.';


-- =============================================================================
-- 7. mv_surveillance_shifts_kpis
-- =============================================================================
-- Alimenta: surveillance.shift_completion.
-- KPIs por (organization, zone, year, month, shift_type): planned, executed,
-- no_shows, completed, avg duration.

CREATE MATERIALIZED VIEW mv_surveillance_shifts_kpis AS
SELECT
  sg.organization_id,
  o.name                              AS organization_name,
  ss.zone_id,
  z.name                              AS zone_name,
  z.short_code                        AS zone_short_code,
  EXTRACT(YEAR  FROM ss.planned_start_at AT TIME ZONE 'America/Santiago')::INT  AS year,
  EXTRACT(MONTH FROM ss.planned_start_at AT TIME ZONE 'America/Santiago')::INT  AS month,
  ss.shift_type,
  count(*)                            AS shifts_total,
  count(*) FILTER (WHERE ss.status = 'scheduled')   AS shifts_scheduled,
  count(*) FILTER (WHERE ss.status = 'in_progress') AS shifts_in_progress,
  count(*) FILTER (WHERE ss.status = 'completed')   AS shifts_completed,
  count(*) FILTER (WHERE ss.status = 'no_show')     AS shifts_no_show,
  count(*) FILTER (WHERE ss.status = 'cancelled')   AS shifts_cancelled,
  COALESCE(
    avg(EXTRACT(EPOCH FROM (ss.actual_end_at - ss.actual_start_at)))
      FILTER (WHERE ss.status = 'completed'), 0
  )::INT                              AS avg_actual_duration_sec
FROM security_shifts ss
JOIN security_guards sg ON sg.id = ss.guard_id
JOIN organizations o    ON o.id = sg.organization_id
JOIN zones z            ON z.id = ss.zone_id           AND z.deleted_at IS NULL
WHERE ss.deleted_at IS NULL
GROUP BY sg.organization_id, o.name, ss.zone_id, z.name, z.short_code,
         EXTRACT(YEAR  FROM ss.planned_start_at AT TIME ZONE 'America/Santiago'),
         EXTRACT(MONTH FROM ss.planned_start_at AT TIME ZONE 'America/Santiago'),
         ss.shift_type
WITH NO DATA;

CREATE UNIQUE INDEX mv_surveillance_shifts_kpis_uq
  ON mv_surveillance_shifts_kpis (organization_id, zone_id, year, month, shift_type);

COMMENT ON MATERIALIZED VIEW mv_surveillance_shifts_kpis IS
  'Métricas mensuales de turnos por contratista, zona y tipo. Tasa de cumplimiento = completed/total.';


-- =============================================================================
-- 8. mv_surveillance_critical_events_summary
-- =============================================================================
-- Alimenta: surveillance.critical_events_summary.

-- Para soportar REFRESH CONCURRENTLY el UNIQUE INDEX exige columnas NOT NULL.
-- Por eso derivamos zone_id desde shift O desde incident, y excluimos las
-- filas sin ninguna fuente de zona conocida (caso atípico — un evento crítico
-- siempre se da en territorio operativo). Si en el futuro aparecen eventos
-- sin zona, hay que decidir si bucketizarlos o ignorarlos en este reporte.
CREATE MATERIALIZED VIEW mv_surveillance_critical_events_summary AS
SELECT
  sg.organization_id,
  o.name                              AS organization_name,
  COALESCE(ss.zone_id, i.zone_id)     AS zone_id,
  COALESCE(zs.name, zi.name)          AS zone_name,
  EXTRACT(YEAR  FROM sce.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS year,
  EXTRACT(MONTH FROM sce.occurred_at AT TIME ZONE 'America/Santiago')::INT  AS month,
  sce.event_type,
  count(*)                            AS events_count,
  count(*) FILTER (WHERE sce.third_parties_injured = true) AS events_with_injuries,
  count(*) FILTER (WHERE sce.guard_injured = true)        AS events_guard_injured,
  count(*) FILTER (WHERE sce.police_unit_notified = false) AS events_unnotified_police,
  count(*) FILTER (WHERE sce.guard_suspended = true)      AS events_with_suspension
FROM security_critical_events sce
JOIN security_guards sg ON sg.id = sce.guard_id
JOIN organizations o    ON o.id = sg.organization_id
LEFT JOIN security_shifts ss ON ss.id = sce.shift_id
LEFT JOIN incidents i        ON i.id = sce.incident_id
LEFT JOIN zones zs      ON zs.id = ss.zone_id
LEFT JOIN zones zi      ON zi.id = i.zone_id
WHERE sce.deleted_at IS NULL
  AND COALESCE(ss.zone_id, i.zone_id) IS NOT NULL
GROUP BY sg.organization_id, o.name,
         COALESCE(ss.zone_id, i.zone_id),
         COALESCE(zs.name, zi.name),
         EXTRACT(YEAR  FROM sce.occurred_at AT TIME ZONE 'America/Santiago'),
         EXTRACT(MONTH FROM sce.occurred_at AT TIME ZONE 'America/Santiago'),
         sce.event_type
WITH NO DATA;

CREATE UNIQUE INDEX mv_surv_critical_events_uq
  ON mv_surveillance_critical_events_summary (organization_id, zone_id, year, month, event_type);

COMMENT ON MATERIALIZED VIEW mv_surveillance_critical_events_summary IS
  'Eventos críticos (disparo, fuerza, flagrancia) agregados por contratista, zona y tipo.';


-- =============================================================================
-- 9. mv_compliance_expiring_summary
-- =============================================================================
-- Alimenta: compliance.expiring_credentials.
-- Una fila por contratista con próximos vencimientos.

CREATE MATERIALIZED VIEW mv_compliance_expiring_summary AS
SELECT
  o.id                              AS organization_id,
  o.name                            AS organization_name,
  scc.os10_authorization_number,
  scc.os10_expires_at,
  CASE
    WHEN scc.os10_expires_at IS NOT NULL
    THEN (scc.os10_expires_at - CURRENT_DATE)::INT
    ELSE NULL
  END                               AS os10_days_to_expire,
  scc.armed_personnel_authorized,
  scc.armed_expires_at,
  CASE
    WHEN scc.armed_expires_at IS NOT NULL
    THEN (scc.armed_expires_at - CURRENT_DATE)::INT
    ELSE NULL
  END                               AS armed_days_to_expire,
  scc.rc_expires_at,
  CASE
    WHEN scc.rc_expires_at IS NOT NULL
    THEN (scc.rc_expires_at - CURRENT_DATE)::INT
    ELSE NULL
  END                               AS rc_days_to_expire,
  scc.fidelity_expires_at,
  CASE
    WHEN scc.fidelity_expires_at IS NOT NULL
    THEN (scc.fidelity_expires_at - CURRENT_DATE)::INT
    ELSE NULL
  END                               AS fidelity_days_to_expire,
  scc.life_expires_at,
  CASE
    WHEN scc.life_expires_at IS NOT NULL
    THEN (scc.life_expires_at - CURRENT_DATE)::INT
    ELSE NULL
  END                               AS life_days_to_expire,
  -- Conteo de credenciales individuales próximas a vencer (90 días).
  (
    SELECT count(*)
    FROM security_certifications sc
    JOIN security_guards sg ON sg.id = sc.guard_id
    WHERE sg.organization_id = o.id
      AND sc.deleted_at IS NULL
      AND sg.deleted_at IS NULL
      AND sg.termination_date IS NULL
      AND sc.status = 'vigente'
      AND sc.expires_at IS NOT NULL
      AND sc.expires_at <= CURRENT_DATE + INTERVAL '90 days'
  )                                 AS individual_certs_expiring_90d
FROM organizations o
JOIN security_contractor_compliance scc ON scc.organization_id = o.id
WHERE o.type = 'security_provider'
  AND o.deleted_at IS NULL
  AND scc.deleted_at IS NULL
WITH NO DATA;

CREATE UNIQUE INDEX mv_compliance_expiring_pk ON mv_compliance_expiring_summary (organization_id);

COMMENT ON MATERIALIZED VIEW mv_compliance_expiring_summary IS
  'Estado de compliance de contratistas con días al vencimiento de OS-10, autorización armada, pólizas y certs individuales.';


-- =============================================================================
-- 10. fn_refresh_statistics_views — refresca todas las MVs y devuelve métricas
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_refresh_statistics_views(p_concurrent BOOLEAN DEFAULT true)
RETURNS TABLE (
  view_name TEXT,
  refresh_ms INT,
  row_count BIGINT,
  status TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_views TEXT[] := ARRAY[
    'mv_incidents_summary_by_zone_month',
    'mv_avaluo_summary_by_zone_month',
    'mv_cases_summary',
    'mv_case_imputados_summary',
    'mv_attorney_workload',
    'mv_complaints_followup',
    'mv_surveillance_shifts_kpis',
    'mv_surveillance_critical_events_summary',
    'mv_compliance_expiring_summary'
  ];
  v_view TEXT;
  v_start TIMESTAMPTZ;
  v_count BIGINT;
  v_sql TEXT;
BEGIN
  FOREACH v_view IN ARRAY v_views LOOP
    v_start := clock_timestamp();
    BEGIN
      IF p_concurrent THEN
        v_sql := format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', v_view);
      ELSE
        v_sql := format('REFRESH MATERIALIZED VIEW %I', v_view);
      END IF;
      EXECUTE v_sql;

      EXECUTE format('SELECT count(*) FROM %I', v_view) INTO v_count;

      view_name := v_view;
      refresh_ms := GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::INT, 0);
      row_count := v_count;
      status := 'ok';
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      view_name := v_view;
      refresh_ms := GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::INT, 0);
      row_count := NULL;
      status := 'error';
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_refresh_statistics_views(BOOLEAN) IS
  'Refresca todas las MVs de statistics. Pasar p_concurrent=false la primera vez (CONCURRENTLY requiere data inicial). Retorna tabla con métricas por MV.';


-- =============================================================================
-- 11. Refresh inicial (sin CONCURRENTLY — primera carga)
-- =============================================================================
-- Necesario porque WITH NO DATA deja las MVs vacías y CONCURRENTLY exige
-- que la MV ya tenga snapshot.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM fn_refresh_statistics_views(false) LOOP
    RAISE NOTICE 'MV % → status=% rows=% ms=%', r.view_name, r.status, r.row_count, r.refresh_ms;
    IF r.status = 'error' THEN
      RAISE EXCEPTION 'Refresh inicial falló para %: %', r.view_name, r.error_message;
    END IF;
  END LOOP;
END;
$$;
