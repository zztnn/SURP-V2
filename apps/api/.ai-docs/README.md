# Backend AI Docs — apps/api (SURP 2.0)

> Documentación institucional del backend NestJS de SURP 2.0.
> Leer antes de escribir código.

## Stack

NestJS 11 · TypeScript 6 (strict) · PostgreSQL 16 + PostGIS 3 (multi-organización: principal / security_provider / api_consumer, sin RLS de aislamiento) ·
Drizzle ORM · BullMQ + ioredis · Passport + JWT · class-validator + class-transformer ·
@nestjs/swagger · Nodemailer · Jest. Azure Key Vault + Blob Storage para secretos y archivos.

## Estructura

```
.ai-docs/
├── standards/     — Reglas no negociables (módulos, errores, PostgreSQL+PostGIS, geo, seguridad…)
├── skills/        — Guías paso-a-paso (crear módulo, auditar, exportar…)
├── checklists/    — Listas cortas (PR review, pre-commit, onboarding…)
├── memory/        — ADRs + pitfalls aprendidos
└── README.md
```

## Orden de lectura recomendado

Antes de tocar código del backend (primera vez):

1. **Raíz** — `CLAUDE.md` del proyecto (en `/Users/jean/Projects/SURP/CLAUDE.md`).
2. **Este CLAUDE.md** — `apps/api/CLAUDE.md`.
3. `standards/CLEAN-CODE.md`
4. `standards/MODULE-ANATOMY.md`
5. `standards/AUTHORIZATION.md` — **modelo multi-organización + RBAC dinámico**
6. `standards/SECURITY.md` — prohibiciones heredadas del legacy + defensas nuevas
7. `standards/POSTGIS-PATTERNS.md`
8. `standards/GEO-PATTERNS.md`
9. `standards/ERROR-HANDLING.md`
10. `standards/DATA-MIGRATION.md` — mapeo legacy → SURP 2.0 (todo schema nuevo debe tener path de migración)
11. `memory/ARCHITECTURE-DECISIONS.md`
12. `memory/KNOWN-PITFALLS.md`

## Al empezar una tarea

| Tarea | Leer primero |
|-------|-------------|
| Elegir pattern del módulo (A o B) | `skills/CHOOSE-MODULE-PATTERN.md` |
| Nuevo módulo de dominio | `skills/ADD-DOMAIN-MODULE.md` |
| Autorizar un endpoint nuevo | `standards/AUTHORIZATION.md` + `standards/SECURITY.md` |
| Agregar permiso al catálogo | `standards/AUTHORIZATION.md` §3 + `ADR-B-007` |
| Diseñar una tabla nueva | `standards/AUTHORIZATION.md` §7.3 (scope) + `standards/DATA-MIGRATION.md` |
| Wiring del AuditInterceptor | `skills/ADD-AUDIT-INTERCEPTOR.md` + `ADR-B-009` |
| Módulo geoespacial (búsqueda por zona, polígono) | `standards/GEO-PATTERNS.md` |
| Generación async de reportes/exportaciones | `skills/ADD-ASYNC-EXPORT.md` |
| Notificaciones por email | `standards/ERROR-HANDLING.md` |
| Refactoring | `skills/REFACTOR-CHECKLIST.md` |
| Script de migración desde legacy | `standards/DATA-MIGRATION.md` |

## Origen y adaptaciones

Base documental portada desde el proyecto BML-ERP (iWarehouse 2.0). Adaptaciones para SURP 2.0:

- **Modelo multi-organización (3 tipos):** formaliza la entidad `Empresa` del legacy. Ver `standards/AUTHORIZATION.md` y `ADR-B-003`. No hay RLS de aislamiento: la segregación se hace en la capa de aplicación (guards + filtros por zona asignada).
- **RBAC dinámico:** roles editables por admin en BD, permisos como catálogo fijo en código. Ver `ADR-B-007`.
- **Migración desde legacy es requisito transversal:** cada tabla nueva debe tener path documentado en `standards/DATA-MIGRATION.md`. Ver `ADR-B-015`.
- **PostGIS obligatorio:** nuevo `POSTGIS-PATTERNS.md` (tipos geométricos, índices GIST, queries espaciales).
- **Nuevo `GEO-PATTERNS.md`:** patrones de dominio geoespacial (incidentes con punto, predios con polígono, búsqueda por radio, intersección con zona).
- **Sin DTE:** eliminado `DTE-INTEGRATION.md`. SURP no emite ni recibe documentos tributarios.
- **Sin dual ledger:** eliminado. SURP no es un sistema contable.
- **Dominio de seguridad forestal:** reemplazó bounded contexts de ERP (procura, finanzas, contratos) por los del SURP: incidents, complaints, cases, persons, vehicles, fires, maat, surveillance.
- **Integración MAAT:** interfaz para el sistema externo de medios incautados (ver `standards/MAAT-INTEGRATION.md`).
