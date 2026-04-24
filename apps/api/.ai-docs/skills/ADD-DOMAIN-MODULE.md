# Add Domain Module — SURP 2.0

> Guía paso a paso para crear un módulo de dominio nuevo en `apps/api/`.

---

## Fase 0 — Análisis previo

Antes de escribir código, responder:

1. **¿Cuál es el bounded context?** (catalog, incidents, complaints, cases, persons, vehicles, fires, maat, surveillance, statistics, users)
2. **¿Pattern A o B?** — ver `skills/CHOOSE-MODULE-PATTERN.md`.
3. **¿Qué tablas necesita?** — consultar `surp-legacy/SACL.EF/Models/` para el modelo de datos del legacy.
4. **¿Qué permisos requiere?** — definir `modulo.recurso.accion` para cada operación.
5. **¿Tiene datos geoespaciales?** — si sí, columna `GEOMETRY` + índice GIST + leer `GEO-PATTERNS.md`.
6. **¿Se integra con MAAT, Azure Blob, o algún sistema externo?** — si sí, Pattern B obligatorio.

---

## Fase 1 — Schema de base de datos

1. Editar `/database/schema/XX_nombre.sql` (número siguente en la secuencia).
2. Definir la tabla con:
   - `id BIGSERIAL PRIMARY KEY`
   - `external_id UUID NOT NULL DEFAULT gen_random_uuid()`
   - Columnas de negocio (con dominios `d_rut`, `d_email` donde aplique)
   - Columnas geométricas con SRID explícito si aplica
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `created_by_id BIGINT REFERENCES users(id)`
   - `updated_at TIMESTAMPTZ`
   - `updated_by_id BIGINT REFERENCES users(id)`
   - `deleted_at TIMESTAMPTZ` (solo si el módulo usa soft delete)
3. Crear índices:
   - `UNIQUE` en `external_id`
   - `USING GIST` en columnas geométricas
   - Índices en FKs
4. Ejecutar `pnpm db:schema` para aplicar.

---

## Fase 2 — Módulo NestJS

### Pattern A (7 archivos)

```bash
mkdir -p src/modules/{bounded-context}/{entity}/{entities,dto}
touch src/modules/{bounded-context}/{entity}/{entity}.entity.ts
touch src/modules/{bounded-context}/{entity}/dto/create-{entity}.dto.ts
touch src/modules/{bounded-context}/{entity}/dto/update-{entity}.dto.ts
touch src/modules/{bounded-context}/{entity}/{entity}.repository.ts
touch src/modules/{bounded-context}/{entity}/{entity}.service.ts
touch src/modules/{bounded-context}/{entity}/{entity}.controller.ts
touch src/modules/{bounded-context}/{entity}/{entity}.module.ts
touch src/modules/{bounded-context}/{entity}/{entity}.service.spec.ts
```

### Pattern B (Clean Architecture)

```bash
mkdir -p src/modules/{bc}/{entity}/{domain,ports,use-cases,infrastructure,dto}
touch src/modules/{bc}/{entity}/domain/{entity}.ts
touch src/modules/{bc}/{entity}/ports/{entity}.repository.port.ts
touch src/modules/{bc}/{entity}/use-cases/create-{entity}.use-case.ts
touch src/modules/{bc}/{entity}/infrastructure/drizzle-{entity}.repository.ts
touch src/modules/{bc}/{entity}/infrastructure/{entity}.mapper.ts
touch src/modules/{bc}/{entity}/dto/create-{entity}.dto.ts
touch src/modules/{bc}/{entity}/{entity}.controller.ts
touch src/modules/{bc}/{entity}/{entity}.module.ts
touch src/modules/{bc}/{entity}/{entity}.use-case.spec.ts
```

---

## Fase 3 — Wiring

1. Agregar el módulo al bounded context module (ej. `incidents.module.ts`) o a `app.module.ts`.
2. Agregar el permiso al seed de roles (`database/seed/04_rbac_seed.sql`).
3. Registrar los permisos en `src/common/permissions/permission-registry.ts`.

---

## Fase 4 — Verificación

```bash
pnpm typecheck      # cero errores
pnpm lint           # cero errores
pnpm test           # todos los tests pasan
pnpm build          # compila
```

- Probar los endpoints con Swagger UI (`http://localhost:3001/api/docs`).
- Verificar que el índice GIST se usa con `EXPLAIN ANALYZE` si hay queries espaciales.
- Verificar que el permiso recién creado bloquea acceso a usuarios sin ese rol.
