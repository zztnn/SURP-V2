# Prevent Unsaved Changes Loss — SURP 2.0

> Cómo proteger al usuario de perder trabajo no guardado.

---

## Hook `useFormCloseGuard`

Toda superficie con form editable monta este hook. Sin excepciones.

```typescript
// Uso básico
const { requestClose, safeNavigate } = useFormCloseGuard({
  isDirty: form.formState.isDirty,
  onConfirm: () => {
    form.reset();
    onClose?.();
  },
  message: '¿Descartar cambios no guardados?',
});
```

---

## Rutas de salida que hay que interceptar

| Ruta de salida | Cómo interceptar |
|----------------|-----------------|
| Botón X del modal | `onOpenChange={(open) => { if (!open) requestClose(); }}` |
| Botón Cancelar | `onClick={requestClose}` |
| ESC | Manejado por `FloatingActionBar` → `onCancel={requestClose}` |
| Navegar a otra página | `safeNavigate('/incidents')` en lugar de `router.push('/incidents')` |
| Backdrop del modal | `onPointerDownOutside={(e) => { e.preventDefault(); requestClose(); }}` |

---

## Implementación en un Dialog de create/edit

```tsx
function IncidentFormModal({ open, onClose }: IncidentFormModalProps) {
  const form = useForm<IncidentFormValues>({ ... });
  const { isDirty } = form.formState;

  const { requestClose } = useFormCloseGuard({
    isDirty,
    onConfirm: () => {
      form.reset();
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) requestClose();
      }}
    >
      <DialogContent onPointerDownOutside={(e) => { e.preventDefault(); requestClose(); }}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <IncidentFormFields form={form} />
          <FloatingActionBar
            isVisible={isDirty}
            mode="create"
            entityName="Incidente"
            onSubmit={form.handleSubmit(onSubmit)}
            onCancel={requestClose}
            isSubmitting={createMutation.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Confirmación modal

El `useFormCloseGuard` muestra automáticamente un `<AlertDialog>` de confirmación cuando `isDirty === true` y el usuario intenta salir. Copy: "¿Descartar cambios no guardados?" con botones "Descartar" y "Seguir editando".
