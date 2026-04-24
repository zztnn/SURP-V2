# Component Anatomy — SURP 2.0 Frontend

> Estructura estándar de un componente React en SURP.

---

## Orden de secciones en el archivo

```typescript
// 1. Imports (React → Next → libs externas → internos → tipos)

// 2. Types / Props interface (con JSDoc si hay props no obvias)
interface IncidentCardProps {
  incident: IncidentSummary;
  /** Callback cuando el usuario hace click en "Ver detalle" */
  onViewDetail: (externalId: string) => void;
  onEdit?: (externalId: string) => void;
}

// 3. Constantes del componente (si las hay)
const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  closed: 'Cerrado',
};

// 4. Componente principal
export function IncidentCard({ incident, onViewDetail, onEdit }: IncidentCardProps) {
  // a. Hooks de state (useState, useReducer)
  // b. Hooks de datos (useQuery, useMutation)
  // c. Hooks custom
  // d. Handlers (useCallback)
  // e. Derived state (useMemo)
  // f. Effects (mínimos, ver USE-EFFECT-POLICY.md)
  // g. Early returns (loading, error, empty)
  // h. Render principal

  return (
    <Card>
      {/* ... */}
    </Card>
  );
}

// 5. Skeleton de carga (si aplica)
export function IncidentCardSkeleton() {
  return <Card className="animate-pulse">...</Card>;
}

// 6. Sub-componentes (si aplica)
function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge>{STATUS_LABELS[status]}</Badge>;
}
```

---

## Reglas de exports

- **Exports nombrados** siempre (no default exports en componentes).
- El skeleton se exporta junto al componente: `export function {Component}Skeleton`.
- Los sub-componentes internos pueden ser locales al archivo (no exportados).

---

## Props

- Interfaz `Props` con sufijo del nombre del componente: `IncidentCardProps`.
- Callbacks nombrados `on{Event}`: `onClick`, `onViewDetail`, `onStatusChange`.
- Props opcionales con `?`.
- Sin props de estilos (no `className` a menos que sea necesario por composición).

---

## Reglas de render

- **Early returns** para loading/error/empty antes del render principal.
- **Sin JSX anidado > 3 niveles** en inline — extraer sub-componente.
- **Sin lógica compleja inline** en JSX — extraer a variable o función.

---

## Skeletons

Todo componente que cargue datos tiene su skeleton:

```typescript
export function IncidentCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );
}
```

Los skeletons se muestran mientras `isLoading` es true — eliminan el "jank" de contenido que aparece de repente.
