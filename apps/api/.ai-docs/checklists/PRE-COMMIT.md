# Pre-Commit Checklist — Backend SURP 2.0

> Correr antes de cada commit o PR al backend.

---

## Checks automáticos (obligatorios)

```bash
pnpm typecheck        # cero errores TypeScript
pnpm lint             # cero errores ESLint (incluyendo limit de líneas)
pnpm build            # compila sin errores
pnpm test             # todos los tests pasan
```

Si alguno falla: **arreglar antes de commitear**. No omitir con `--no-verify`.

---

## Revisión manual

### Código general

- [ ] Ningún `any`, `@ts-ignore`, `eslint-disable` nuevo
- [ ] Ningún `console.log` (usar `Logger` de NestJS)
- [ ] Identificadores en inglés; mensajes visibles al usuario en español
- [ ] Ningún secret ni credencial hardcodeada
- [ ] Ningún valor de dominio hardcodeado (tipos de incidente, perfiles, etc.)

### Base de datos

- [ ] Columnas geométricas con `USING GIST` (nunca BTREE)
- [ ] Todo SRID declarado explícitamente en EPSG:4326
- [ ] Nuevas FKs con índice correspondiente
- [ ] Siempre `TIMESTAMPTZ`, nunca `TIMESTAMP`
- [ ] Soft delete correcto (no DELETE físico en entidades con `deleted_at`)
- [ ] `WHERE deleted_at IS NULL` en queries de listado activo

### API y módulos

- [ ] DTOs con mensajes de class-validator en español
- [ ] Excepciones con `{ code, message }` estructurado (ver `ERROR-HANDLING.md`)
- [ ] Acciones no-CRUD expuestas como `POST /:externalId/{action}`
- [ ] URLs usando `external_id` (UUID), nunca `id` interno

### Geo / PostGIS

- [ ] Queries espaciales usan el cast `::geography` cuando la distancia es en metros
- [ ] `ST_AsGeoJSON` o coordenadas decimales al retornar geometrías (nunca WKB crudo)
- [ ] Validar geometrías de entrada con `ST_IsValid` antes de insertar

### Seguridad

- [ ] Ningún endpoint sin `@UseGuards(JwtAuthGuard, PermissionGuard)`
- [ ] Ningún `@RequirePermission` con permiso demasiado amplio (`*.*.read` está bien, `*.*.*` no)
- [ ] Datos de personas (RUT, nombres de imputados) no se loggean

### Tests

- [ ] Módulos Pattern B tienen tests de dominio (`*.domain.spec.ts`) sin mocks de NestJS
- [ ] Tests de integración geo-espaciales verifican con `EXPLAIN ANALYZE` que usan índice GIST
