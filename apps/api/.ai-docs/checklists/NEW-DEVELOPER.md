# New Developer Onboarding — Backend SURP 2.0

> Guía de bienvenida al backend. Leer en orden antes de escribir código.

---

## Setup inicial

```bash
# 1. Clonar el repo y entrar al directorio
cd /Users/jean/Projects/SURP

# 2. Instalar dependencias
pnpm install

# 3. Variables de entorno
cp .env.example .env
# Editar .env con tu configuración local

# 4. Levantar base de datos + redis
pnpm db:up

# 5. Aplicar schema (DDL)
pnpm db:schema

# 6. Cargar seed inicial
pnpm db:seed

# 7. Levantar el backend
pnpm dev:api
```

---

## Lectura inicial obligatoria (en orden)

1. `CLAUDE.md` del proyecto raíz — contexto de SURP 2.0, stack, módulos
2. `apps/api/CLAUDE.md` — convenciones específicas del backend
3. `.ai-docs/standards/CLEAN-CODE.md`
4. `.ai-docs/standards/MODULE-ANATOMY.md`
5. `.ai-docs/standards/POSTGIS-PATTERNS.md` ← **lee este bien**
6. `.ai-docs/standards/GEO-PATTERNS.md`
7. `.ai-docs/standards/ERROR-HANDLING.md`
8. `.ai-docs/standards/SECURITY.md`
9. `.ai-docs/memory/ARCHITECTURE-DECISIONS.md`
10. `.ai-docs/memory/KNOWN-PITFALLS.md`

---

## Conceptos clave

### 1. Single-org (no multi-tenant)

SURP sirve a una sola organización (Arauco). No hay `tenant_id`. El aislamiento es por RBAC (perfiles y permisos), no por RLS.

### 2. PostGIS — geolocalización como primer ciudadano

Cada incidente tiene un punto GPS. Los predios, zonas y áreas tienen polígonos. **Todo** en EPSG:4326 (WGS84). Las queries espaciales usan `ST_DWithin`, `ST_Within`, `ST_Intersects` con índices GIST. Nunca calcular distancias manualmente con fórmulas Haversine.

### 3. Pattern A vs Pattern B

Los módulos simples (mantenedores de catálogo) usan Pattern A (7 archivos). Los módulos complejos (incidentes, causas, personas) usan Pattern B (Clean Architecture hexagonal). Ver `skills/CHOOSE-MODULE-PATTERN.md`.

### 4. Dominio forestal

El negocio core es gestión de incidentes de seguridad forestal: robos de madera, intrusiones, tala ilegal, incendios, ocupaciones. Las causas judiciales se tramitan ante Carabineros, PDI y Fiscalía. Leer `surp-legacy/` para entender el dominio antes de modelar cualquier entidad.

### 5. Evidencia digital

Fotos, videos y documentos se guardan en Azure Blob Storage. La BD solo guarda metadatos (URL, tipo, tamaño, hash SHA256). Nunca almacenar binarios en la BD.

---

## Tareas comunes

| Tarea | Guía |
|-------|------|
| Crear un módulo nuevo | `.ai-docs/skills/ADD-DOMAIN-MODULE.md` |
| Elegir Pattern A o B | `.ai-docs/skills/CHOOSE-MODULE-PATTERN.md` |
| Agregar query geoespacial | `.ai-docs/standards/GEO-PATTERNS.md` |
| Configurar auditoría | `.ai-docs/skills/ADD-AUDIT-INTERCEPTOR.md` |
| Agregar una exportación async | `.ai-docs/skills/ADD-ASYNC-EXPORT.md` |
| Ver el legacy para referencia | `surp-legacy/SURP.WEB/Controllers/` |

---

## Checklist antes de tu primer PR

- [ ] Leí todos los archivos del paso "Lectura inicial"
- [ ] El backend corre localmente (`pnpm dev:api`)
- [ ] `pnpm check` pasa sin errores
- [ ] Entiendo la diferencia entre Pattern A y B
- [ ] Entiendo por qué se usa GIST (no BTREE) para columnas geométricas
- [ ] Entiendo que no hay `tenant_id` en SURP
