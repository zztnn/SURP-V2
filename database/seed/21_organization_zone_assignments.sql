-- =============================================================================
-- 21_organization_zone_assignments.sql — INTENCIONALMENTE VACÍO en MVP.
--
-- `organization_zone_assignments` solo aplica a `organizations.type =
-- 'security_provider'` (validado por `fn_org_zone_assignments_check_org_type`).
-- Arauco (`type='principal'`) tiene visibilidad sobre TODAS las zonas por
-- defecto — no necesita filas en esta tabla.
--
-- Las 3 security providers reales del proyecto (Green America, Maxcon,
-- Tralkan — ver memoria del usuario) se crean junto con sus asignaciones de
-- zonas en el seed que las modele, fuera del scope de F12.1.
-- =============================================================================

-- (Sin sentencias DML — placeholder explicativo.)
SELECT 1;
