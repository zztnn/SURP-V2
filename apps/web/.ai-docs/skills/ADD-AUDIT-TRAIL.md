# Add Audit Trail — SURP 2.0

> Cómo mostrar el historial de auditoría en la vista de detalle.

---

## Cuándo usar

Todo detalle de entidad principal (incidente, causa, persona, vehículo) muestra el `<AuditTrail>` en la **última sección** del detalle.

---

## Componente `<AuditTrail>`

```tsx
// Siempre al final del detalle
<AuditTrail
  entityId={incident.externalId}
  entityTable="incidents"
  variant="panel"  // 'panel' (colapsable) o 'full' (siempre visible)
/>
```

---

## Endpoint del backend

```
GET /audit-logs?entityTable=incidents&entityId=:externalId
```

Retorna:
```json
{
  "data": [
    {
      "actionCode": "incident_closed",
      "actionLabel": "Incidente cerrado",
      "userId": "...",
      "userName": "Juan Pérez",
      "occurredAt": "2026-04-23T14:30:00Z",
      "payload": { "resolution": "Detenido por Carabineros" }
    }
  ]
}
```

---

## Header de auditoría (campos fijos)

El `<AuditTrail>` siempre muestra en el header:

- Creado por: `{userName}` el `{dd-MM-yyyy HH:mm}`
- Última modificación: `{userName}` el `{dd-MM-yyyy HH:mm}`

Estos datos vienen de `createdByName`, `createdAt`, `updatedByName`, `updatedAt` en la entidad principal.

---

## Reglas

- `<AuditTrail>` siempre en la **última sección** del detalle. Nunca al medio.
- No mostrar en vistas read-only simples (listados, popovers).
- Los timestamps se muestran en `America/Santiago` con formato `dd-MM-yyyy HH:mm`.
