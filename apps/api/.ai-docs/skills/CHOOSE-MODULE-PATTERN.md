# Choose Module Pattern — SURP 2.0

> Decide si un módulo nuevo usa Pattern A (7-file clásico) o Pattern B (Clean Architecture).

---

## Flowchart de decisión

```
¿El módulo tiene alguna de estas características?
│
├── Reglas de negocio complejas (estado, pre-condiciones, invariantes)
├── Acciones no-CRUD (close, escalate, link, resolve)
├── Integraciones externas (MAAT, Azure Blob, email)
├── Orquestación de >2 aggregates
├── Máquina de estados (open → in_progress → closed)
│
└─── SÍ → Pattern B (Clean Architecture hexagonal)
└─── NO → Pattern A (7-file clásico)
```

---

## Pattern A — ejemplos en SURP

Módulos de catálogo y mantenedores simples:

- `catalog/zones` — Zonas Arauco (CRUD simple)
- `catalog/areas` — Áreas Arauco (CRUD simple)
- `catalog/incident-types` — Tipos de incidente (CRUD)
- `catalog/institutions` — Carabineros, PDI, Fiscalía, Tribunales
- `catalog/asset-types` — Tipos de bien afectado
- `catalog/communes`, `catalog/provinces`, `catalog/regions` — División territorial
- `users` — Gestión de usuarios (CRUD + activar/desactivar simple)

---

## Pattern B — ejemplos en SURP

Módulos con reglas de dominio:

- `incidents` — Máquina de estados, auto-asignación de predio, evidencias, alertas
- `complaints` — Denuncia formal, vinculación con incidente, institución, fiscal
- `cases` — Causa judicial, hitos, querella, abogados, resolución, formas de término
- `persons` — Personas con historial de vinculaciones, bloqueos, RUT
- `vehicles` — Vehículos con historial, vinculaciones cross-módulo
- `fires` — Incendios con documentos especializados (partes, oficios)
- `maat` — Medios incautados, integración con sistema externo MAAT
- `surveillance` — Seguimientos con rutas GPS, vinculación con vehículos

---

## Regla de convivencia

- Ambos patterns son válidos. Lo que NO es válido es un módulo "a medio camino".
- Si un módulo A suma reglas complejas con el tiempo → migrarlo a B (refactor controlado).
- Si un módulo B resulta sobreingeniería → bajarlo a A (también es válido).
- Documentar la decisión en el PR con el motivo.
