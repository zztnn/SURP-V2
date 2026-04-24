# New Developer Onboarding — Frontend SURP 2.0

> Guía de bienvenida al frontend. Leer en orden antes de escribir código.

---

## Setup inicial

```bash
cd /Users/jean/Projects/SURP
pnpm install
cp .env.example .env.local   # variables del frontend

pnpm dev:web                 # http://localhost:3000
```

---

## Lectura inicial obligatoria (en orden)

1. `CLAUDE.md` del proyecto raíz — contexto, stack, módulos del SURP
2. `apps/web/CLAUDE.md` — convenciones del frontend
3. `.ai-docs/standards/CLEAN-CODE.md`
4. `.ai-docs/standards/DESIGN-PATTERNS.md`
5. `.ai-docs/standards/COMPONENT-ANATOMY.md`
6. `.ai-docs/standards/MAP-PATTERNS.md` ← **nuevo en SURP, leer bien**
7. `.ai-docs/standards/ERROR-HANDLING.md`
8. `.ai-docs/standards/STYLING.md`
9. `.ai-docs/memory/ARCHITECTURE-DECISIONS.md`
10. `.ai-docs/memory/KNOWN-PITFALLS.md`

---

## Conceptos clave

### 1. Entity Page Pattern

Cada módulo sigue el mismo patrón: validator Zod en `@/lib/validators/`, columnas en `components/tables/columns/`, form fields en `components/forms/`, páginas en `app/(protected)/{category}/{entity}/`.

### 2. State management en 5 tipos

| Data | Tool |
|------|------|
| Server data (API) | TanStack Query |
| Global UI | Zustand |
| Form state | RHF + Zod |
| URL state | `useSearchParams` |
| Local UI | `useState` |

### 3. Mapas interactivos (nuevo en SURP)

Los módulos de incidentes y predios tienen vista de mapa con Leaflet. Todos los componentes Leaflet usan `dynamic(..., { ssr: false })`. GeoJSON usa `[lng, lat]`; Leaflet usa `[lat, lng]`. Ver `standards/MAP-PATTERNS.md`.

### 4. Localización chilena

Fechas `dd-MM-yyyy`, hora `HH:mm`, TZ `America/Santiago`, RUT formato `76.543.210-K`. Siempre `getLocaleConfig().locale` (retorna `'es-CL'`). Nunca `'en-GB'` hardcodeado.

### 5. Formularios con FloatingActionBar

Todo formulario que guarda usa `<FloatingActionBar>`. Con `useFormCloseGuard` para proteger cambios no guardados.

---

## Tareas comunes

| Tarea | Guía |
|-------|------|
| Crear módulo CRUD | `.ai-docs/skills/CREATE-CRUD-MODULE.md` |
| Crear página de lista | `.ai-docs/skills/CREATE-LIST-PAGE.md` |
| Agregar campo de formulario | `.ai-docs/skills/ADD-FORM-FIELD.md` |
| Vista de mapa | `.ai-docs/standards/MAP-PATTERNS.md` |
| Export async Excel/PDF | `.ai-docs/skills/ADD-ASYNC-EXPORT.md` |
| Guard de cambios no guardados | `.ai-docs/skills/PREVENT-UNSAVED-CHANGES-LOSS.md` |
| Errores del servidor en forms | `.ai-docs/skills/HANDLE-SERVER-ERRORS-IN-FORMS.md` |

---

## Checklist antes de tu primer PR

- [ ] Leí todos los archivos del paso "Lectura inicial"
- [ ] El frontend corre localmente en `localhost:3000`
- [ ] `pnpm check` pasa sin errores
- [ ] Entiendo el Entity Page Pattern
- [ ] Entiendo la diferencia entre los 5 tipos de state
- [ ] Entiendo por qué los mapas Leaflet usan `dynamic({ ssr: false })`
- [ ] Entiendo el orden de coordenadas GeoJSON vs Leaflet
