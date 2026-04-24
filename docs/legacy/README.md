# Documentación del SURP Legacy

> Investigación exhaustiva del sistema SURP legacy (ASP.NET Core 3.1 + EF Core + SQL Server) ubicado en `/Users/jean/Projects/SURP/surp-legacy/`.
>
> Propósito: entender el sistema actual de punta a punta para migrar **todos** los datos y rediseñar la funcionalidad en SURP 2.0. El código legacy NO se modifica — es fuente de verdad funcional (no de diseño técnico).

## Índice

| Documento | Contenido |
|-----------|-----------|
| [schema.md](schema.md) | Schema completo de la BD: tablas, columnas, FKs, índices, enums, seeds |
| [entities.md](entities.md) | Las 57 entidades EF con sus DataAnnotations, relaciones navegacionales, enums |
| [controllers.md](controllers.md) | Todos los controllers (SURP.WEB + SURP.API): endpoints, autorización, filtrado |
| [modules.md](modules.md) | Flujos de negocio end-to-end: incidentes, denuncias, causas, MAAT, API, etc. |
| [views.md](views.md) | Vistas Razor: mantenedores, vistas custom, mapa al frontend Next.js |

## Resumen del legacy

- **3 proyectos .NET:** `SURP.WEB` (Razor MVC), `SURP.API` (API externa), `SACL.EF` (EF Core + DbContext).
- **58 controllers, 57 entidades, ~281 vistas Razor** (conteos previos — confirmar en los docs específicos).
- **11 perfiles de usuario** hardcodeados como enum `SACL.EF/Enums/Perfil.cs`.
- **Fuentes de verdad del código:**
  - DbContext: `SACL.EF/SACLContext.cs`
  - Entidades: `SACL.EF/Entidades/*.cs`
  - Enums: `SACL.EF/Enums/*.cs`

## Contexto de uso

El SURP está desplegado y en uso productivo por Arauco hace años. La BD legacy (SQL Server) contiene años de historia operativa:
- Incidentes de seguridad forestal (robos de madera, intrusiones, tala ilegal, ocupaciones).
- Denuncias levantadas ante Carabineros / PDI / Fiscalía.
- Causas judiciales en distintos estados.
- Personas y vehículos registrados, algunos bloqueados para consulta por API.
- Registros MAAT (medios incautados).

**Todos los datos se migran a SURP 2.0** (ver `apps/api/.ai-docs/standards/DATA-MIGRATION.md`).

## Acceso a la BD

Credenciales fuera del repo en `/Users/jean/Projects/SURP/.env.legacy.local` (ignorado por `.gitignore`). Política de acceso: **solo lectura**, nunca INSERT/UPDATE/DELETE/DDL.

## Problemas conocidos del legacy (no heredar)

Síntesis de las debilidades estructurales identificadas — ver `apps/api/.ai-docs/memory/KNOWN-PITFALLS.md` (pitfalls B-017 a B-029) para el detalle con evidencia:

1. Autorización declarada solo en el menú (URLs directas bypassean).
2. Passwords con encriptación reversible (clave simétrica hardcodeada).
3. Connection strings en texto plano dentro del código.
4. Filtros de visibilidad comentados "temporalmente" (bug en producción).
5. `MaatController` sin `[Authorize]`.
6. API externa con credenciales de usuario en headers HTTP.
7. Endpoint `/araucaria/incidentes` devuelve lista completa sin filtrar.
8. Tabla `Permiso(Perfil, Controlador)` es código muerto.
9. Sin auditoría CRUD (solo `AddUser/ChgUser` sin historia).
10. Entidades operativas sin FK directa a empresa (join indirecto por creador).
11. Perfiles hardcodeados como enum (no editables sin deploy).
12. Mismos perfiles mezclan usuarios Arauco y contratistas.
