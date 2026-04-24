# Add Async Export — SURP 2.0

> Cómo implementar exportaciones async (Excel, PDF) en el frontend.

---

## Por qué async

Datasets de incidentes, estadísticas o causas pueden tener miles de filas. Exportar síncrono desde el browser congela la UI.

**Contrato de 3 endpoints:**

1. `POST /incidents/export` → `{ jobId: "uuid" }` (inicia job BullMQ)
2. `GET /incidents/export/:jobId/status` → `{ status: 'pending'|'processing'|'done'|'error', progress: 0-100 }`
3. `GET /incidents/export/:jobId/download` → `Blob` (cuando `status === 'done'`)

---

## Componente `<ExportProgressModal>`

```tsx
<ExportProgressModal
  open={exportOpen}
  onOpenChange={setExportOpen}
  jobId={exportJobId}
  label="Exportar incidentes"
  onComplete={(blob) => {
    downloadFile(blob, `incidentes-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    setExportOpen(false);
  }}
/>
```

---

## Botón de exportación

```tsx
const exportMutation = useMutation({
  mutationFn: () => apiClient.post<{ jobId: string }>('/incidents/export', filters),
  onSuccess: ({ jobId }) => {
    setExportJobId(jobId);
    setExportOpen(true);
  },
  onError: () => {
    toast.error('No se pudo iniciar la exportación. Intente nuevamente.');
  },
});

// En el ListToolbar:
<Button
  variant="outline"
  onClick={() => exportMutation.mutate()}
  disabled={exportMutation.isPending}
>
  <Download className="h-4 w-4 mr-2" />
  Exportar Excel
</Button>
```

---

## Polling del status

El `<ExportProgressModal>` hace polling del status cada 2 segundos:

```typescript
const { data: status } = useQuery({
  queryKey: ['export-status', jobId],
  queryFn: () => apiClient.get<ExportStatus>(`/incidents/export/${jobId}/status`),
  enabled: open && !!jobId,
  refetchInterval: (data) => {
    if (data?.status === 'done' || data?.status === 'error') return false;
    return 2000; // poll cada 2 segundos mientras procesa
  },
});
```

---

## Reglas

- Export síncrono desde el browser está **BANEADO**.
- Label siempre específico del módulo: "Exportar incidentes", "Exportar estadísticas", no genérico "Excel".
- El modal tiene botón de cancelar que llama `POST /.../cancel` (si el backend lo soporta).
- Formato del nombre de archivo: `{modulo}-{YYYY-MM-DD}.xlsx`.
