# PR Review Checklist — Backend SURP 2.0

> Checklist para el revisor. Un PR no se aprueba si falla algún ítem crítico (🔴).

---

## Quality gates

- 🔴 `pnpm typecheck` pasa sin errores
- 🔴 `pnpm lint` pasa sin errores
- 🔴 `pnpm build` pasa sin errores
- 🟡 Tests nuevos para funcionalidad nueva

---

## Estructura del módulo

- 🔴 Patrón A o B aplicado correctamente (sin módulos "a medio camino")
- 🔴 Entity file con tipos Drizzle `InferSelectModel` / `InferInsertModel`
- 🔴 DTOs con class-validator y mensajes en español
- 🔴 Repository: solo acceso a datos, sin lógica de negocio
- 🔴 Controller delgado: delega al service o use cases
- 🟡 Module exporta solo lo que otros módulos necesitan

---

## Contrato de API

- 🔴 URLs usan `external_id` (UUID), nunca `id` interno
- 🔴 Acciones no-CRUD en `POST /:externalId/{action}`, no como flags en PATCH
- 🔴 Respuestas de error con `{ code, message }` estructurado en español
- 🔴 Swagger decorado (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`)

---

## Geo / PostGIS

- 🔴 Columnas geométricas con índice GIST (no BTREE)
- 🔴 SRID explícito `4326` en toda definición de columna y función espacial
- 🔴 Geometrías retornadas como GeoJSON o coordenadas decimales (no WKB)
- 🔴 `::geography` en `ST_DWithin`/`ST_Distance` cuando se trabaja en metros
- 🟡 Nuevas queries espaciales verificadas con `EXPLAIN ANALYZE`

---

## Seguridad

- 🔴 Todos los endpoints protegidos con `JwtAuthGuard` + `PermissionGuard`
- 🔴 Permisos específicos en `@RequirePermission` (ej. `incidents.incidents.create`)
- 🔴 Sin credenciales ni secrets hardcodeados
- 🔴 Datos sensibles de personas (RUT, nombres) no aparecen en logs

---

## Base de datos

- 🔴 Siempre `TIMESTAMPTZ`, nunca `TIMESTAMP`
- 🔴 Nuevas FKs con índice
- 🔴 Soft delete con `deleted_at`, no DELETE físico en entidades auditables
- 🟡 Migraciones reversibles (comentario de rollback en el SQL)

---

## Integraciones externas

- 🔴 Llamadas a MAAT vía interfaz `MaatProvider` inyectada (no `axios` directo)
- 🔴 Llamadas a Azure Blob vía `BlobStorageService` (no SDK directo inline)

---

## Tests

- 🟡 Pattern B: tests de dominio puro sin dependencias de NestJS
- 🟡 Casos edge cubiertos: no-encontrado, estado inválido, coordenadas fuera de rango
