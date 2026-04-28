# Frontend AI Docs — apps/web (SURP 2.0)

> Documentación institucional del frontend Next.js de SURP 2.0.
> Leer antes de escribir código.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 6 (strict) · Tailwind CSS v4 ·
shadcn/ui (Radix UI) · React Hook Form + Zod · TanStack Query v5 · TanStack Table v8 ·
Zustand · Sonner · date-fns (es-CL) · Leaflet / MapLibre GL · Lucide · Framer Motion ·
next-themes · Vitest + Testing Library.

## Estructura

```
.ai-docs/
├── standards/     — Reglas no negociables (componentes, formularios, mapas, tablas…)
├── skills/        — Guías paso-a-paso (crear módulo CRUD, agregar mapa, filtros…)
├── checklists/    — Listas cortas (PR review, pre-commit, onboarding, campos de form…)
├── memory/        — ADRs + pitfalls aprendidos
└── README.md
```

## Orden de lectura recomendado

Antes de tocar código del frontend (primera vez):

1. **Raíz** — `CLAUDE.md` del proyecto.
2. **Este CLAUDE.md** — `apps/web/CLAUDE.md`.
3. `standards/CLEAN-CODE.md`
4. `standards/DESIGN-PATTERNS.md`
5. `standards/COMPONENT-ANATOMY.md`
6. `standards/USE-EFFECT-POLICY.md` — **lectura obligatoria antes de escribir cualquier `useEffect`**
7. `standards/LIST-VIEW-STANDARD.md` — **lectura obligatoria antes de tocar cualquier página-lista**
8. `standards/MAP-PATTERNS.md`
9. `standards/ERROR-HANDLING.md`
10. `standards/STYLING.md`
11. `memory/ARCHITECTURE-DECISIONS.md`
12. `memory/KNOWN-PITFALLS.md`

## Al empezar una tarea

| Tarea                                        | Leer primero                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Nuevo módulo CRUD                            | `skills/CREATE-CRUD-MODULE.md`                                   |
| Página de lista con filtros                  | `standards/LIST-VIEW-STANDARD.md` + `skills/CREATE-LIST-PAGE.md` |
| Formulario de creación/edición               | `skills/CREATE-FORM-PAGE.md`                                     |
| Agregar campo a un formulario                | `skills/ADD-FORM-FIELD.md`                                       |
| Visualización de mapa / incidentes geo       | `standards/MAP-PATTERNS.md`                                      |
| Exportación async (Excel, PDF)               | `skills/ADD-ASYNC-EXPORT.md`                                     |
| Trail de auditoría en detalle                | `skills/ADD-AUDIT-TRAIL.md`                                      |
| Errores de servidor en formularios           | `skills/HANDLE-SERVER-ERRORS-IN-FORMS.md`                        |
| Guard de cambios no guardados                | `skills/PREVENT-UNSAVED-CHANGES-LOSS.md`                         |
| Refactoring                                  | `skills/REFACTOR-CHECKLIST.md`                                   |
| Tocar `useEffect` (cualquier hook lifecycle) | `standards/USE-EFFECT-POLICY.md`                                 |

## Tareas comunes (referencia rápida)

```bash
# Correr checks antes de PR
pnpm check          # typecheck + lint
pnpm test           # vitest
pnpm build          # verificar que compila

# Verificar tamaño de bundles
pnpm check:filesize
```

## Origen y adaptaciones

Portado desde BML-ERP. Adaptaciones para SURP 2.0:

- **Nuevo `MAP-PATTERNS.md`:** visualización de incidentes en mapa (Leaflet/MapLibre), polígonos de predios y zonas, marcadores de incidentes, clustering.
- **Sin DTE:** eliminados skills de facturación/SII.
- **Sin módulos financieros:** eliminados patrones de ledger, pagos, monedas.
- **Dominio forestal:** entidades y patrones adaptados a incidentes, causas, personas, vehículos, seguimientos.
- **Página de mapa como vista de primera clase:** además de lista y detalle, los módulos de incidentes y predios tienen vista de mapa.
