# Create CRUD Module — SURP 2.0

> Guía de alto nivel para crear un módulo CRUD completo (backend ya listo).

---

## Decisión previa: Modal vs Página dedicada

| Usar Dialog/Sheet | Usar página dedicada |
|-------------------|---------------------|
| Entidad simple (<8 campos) | Entidad con tabs o sub-recursos |
| Sin sub-recursos | Tiene evidencias, hitos, documentos |
| CRUD rápido (mantenedor) | Flujo multi-paso |
| Ej: tipo de incidente, institución, zona | Ej: incidente, causa judicial, persona |

---

## Fase 1 — Backend + tipos + API client

1. Verificar que el endpoint del backend existe y está documentado en Swagger.
2. Crear el tipo TypeScript de la entidad en `src/types/{entity}.ts`.
3. Crear el schema Zod en `src/lib/validators/{entity}.ts`:
   ```typescript
   export const incidentFormSchema = z.object({
     incidentType: z.enum(['theft', 'fire', 'illegal_logging', ...]),
     occurredAt: z.string().date(),
     lat: z.number().min(-90).max(90),
     lng: z.number().min(-180).max(180),
     propertyId: z.string().uuid().nullable(),
     description: z.string().min(5).max(2000),
   });
   export type IncidentFormValues = z.infer<typeof incidentFormSchema>;
   ```
4. Agregar query keys en `src/lib/query-keys.ts`.
5. Crear API client functions en `src/lib/api/{entity}.ts`.

---

## Fase 2 — Formulario

1. Crear `src/components/forms/{entity}-form.tsx` con `{Entity}FormFields`.
2. Todos los campos con `data-field`, `<RequiredBadge>`, validación Zod.
3. Campos de fecha con `<DateInput>`, coordenadas con `<CoordinateInput>`.
4. Campos de texto libre con `<Textarea>` y `maxLength`.

---

## Fase 3 — Lista + detalle

1. Crear `src/components/tables/columns/{entity}-columns.tsx` con `use{Entity}Columns()`.
2. Crear `src/app/(protected)/{category}/{entity}/page.tsx` con Entity Page Pattern.
3. Si es módulo geoespacial: agregar toggle Lista/Mapa y `<{Entity}Map>`.
4. Crear `src/app/(protected)/{category}/{entity}/[id]/page.tsx` para el detalle.

---

## Fase 4 — Verificación

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- Probar en el browser: create, edit, delete, vaciar fields, errores del servidor.
- Si tiene mapa: verificar que los marcadores aparecen en la ubicación correcta.
- Verificar que `useFormCloseGuard` funciona (editar → intentar navegar → modal de confirmación).
