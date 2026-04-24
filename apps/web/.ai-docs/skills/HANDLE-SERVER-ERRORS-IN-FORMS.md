# Handle Server Errors in Forms — SURP 2.0

> Cómo procesar errores del backend en formularios.

---

## Regla fundamental

**Siempre los dos:** error inline en el campo (`form.setError`) **Y** toast (`toast.error`).

Nunca solo uno.

---

## Helper `applyServerErrorToForm`

```typescript
// src/lib/form-helpers.ts
import type { UseFormReturn } from 'react-hook-form';
import type { ApiError } from '@/types/api';

export function applyServerErrorToForm<T extends Record<string, unknown>>(
  form: UseFormReturn<T>,
  error: ApiError,
): void {
  if (error.errors) {
    // Múltiples errores de campo
    for (const fieldError of error.errors) {
      form.setError(fieldError.field as keyof T, {
        type: 'server',
        message: fieldError.message,
      });
      // Scroll al primer campo con error
      const el = document.querySelector(`[data-field="${fieldError.field}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (error.field) {
    // Error de un solo campo
    form.setError(error.field as keyof T, {
      type: 'server',
      message: error.message,
    });
    const el = document.querySelector(`[data-field="${error.field}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

---

## Uso en mutación

```typescript
const createMutation = useMutation({
  mutationFn: (values: CreateIncidentPayload) =>
    apiClient.post<Incident>('/incidents', values),

  onSuccess: (data) => {
    surgicalUpdateListCache(queryClient, { list: queryKeys.incidents.all }, data);
    toast.success('Incidente registrado exitosamente');
    setFormOpen(false);
  },

  onError: (error: ApiError) => {
    // 1. Error inline en el campo que falló
    applyServerErrorToForm(form, error);

    // 2. Toast con el mensaje en español del backend
    toast.error(error.message ?? 'Ocurrió un error al guardar el incidente.');
  },
});
```

---

## Errores de estado del sistema (sin campo)

Para errores como `INCIDENT_CLOSED`, `CASE_FINALIZED` que no son de campo:

```typescript
onError: (error: ApiError) => {
  switch (error.code) {
    case 'INCIDENT_CLOSED':
      toast.error('Este incidente está cerrado y no puede modificarse.');
      break;
    case 'DUPLICATE_KEY':
      toast.error('Ya existe un registro con esa información.');
      break;
    default:
      toast.error(error.message ?? 'Ocurrió un error inesperado.');
  }
}
```

---

## Errores de validación Zod (frontend)

RHF con Zod muestra errores inline automáticamente. Para el toast:

```typescript
const onSubmit = form.handleSubmit(
  async (values) => {
    await createMutation.mutateAsync(values);
  },
  (errors) => {
    // Primer error de validación como toast
    const firstError = Object.values(errors)[0];
    if (firstError?.message) {
      toast.error(firstError.message as string);
    }
  }
);
```
