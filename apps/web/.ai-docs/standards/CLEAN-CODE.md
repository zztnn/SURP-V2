# Clean Code Standards — SURP 2.0 Frontend

> Aplica a todo código bajo `apps/web/src/`.

Regla 0: identificadores en **inglés**. UI, mensajes al usuario y comentarios en **español latinoamericano**.

---

## 1. Tamaño de archivo

- **Objetivo:** 200–400 líneas.
- **Límite duro:** 1000 líneas (ESLint enforces).

Overrides:
| Glob | Límite |
|------|--------|
| `**/*.generated.ts` | 1500 |
| `**/*.spec.tsx`, `**/*.test.tsx` | 1500 |

---

## 2. Naming conventions

**Archivos:** kebab-case.
```
incident-form.tsx
incident-columns.tsx
use-incident-map.ts
```

**Componentes:** PascalCase.
```
IncidentFormModal
PropertyMap
CoordinateInput
```

**Hooks:** camelCase con prefijo `use`.
```
useIncidentMap()
useFormCloseGuard()
useExportProgress()
```

**Variables:** camelCase. Booleans con prefijo `is`/`has`/`can`/`should`.
```typescript
const isLoading = query.isLoading;
const hasEvidence = incident.evidences.length > 0;
const canClose = ['open', 'in_progress'].includes(incident.status);
```

**Constantes:** UPPER_SNAKE_CASE.
```typescript
const ARAUCO_DEFAULT_CENTER: [number, number] = [-37.8, -72.7];
const MAX_MAP_FEATURES = 2000;
```

---

## 3. Reglas de componentes

- **Responsabilidad única:** un componente hace una cosa.
- **Props explícitas:** interfaz `Props` con JSDoc en propiedades no obvias.
- **Sin lógica de negocio en componentes** — extraer a hooks o utilities.
- **Sin `any`** en props o state.

---

## 4. Comentarios

Bueno — explica el **por qué**:
```typescript
// GeoJSON usa [lng, lat]; Leaflet usa [lat, lng]. Desempacar en este orden.
const [lng, lat] = feature.geometry.coordinates;
```

Malo:
```typescript
// mapeamos las coordenadas
const [lng, lat] = feature.geometry.coordinates;
```

---

## 5. TypeScript estricto

Nunca:
```
any            → usar tipos específicos o unknown
@ts-ignore     → arreglar el error
as SomeType    → estrechar con type guards
```

---

## 6. No console.log

En dev: usar React DevTools o el panel de TanStack Query Devtools.
En código: no `console.log`, no `console.error`, no `console.warn`.

---

## 7. Imports

```typescript
// 1. React y Next.js
// 2. Librerías externas (react-leaflet, date-fns, etc.)
// 3. Componentes internos (@/components/...)
// 4. Hooks internos (@/hooks/...)
// 5. Tipos (import type)
```
