# Suggestion Rules — Motor de sugerencias de escalamiento

> Módulo admin-only donde se configuran **reglas de sugerencia** para guiar
> la decisión humana sobre qué informes escalar a denuncia formal. El
> sistema **nunca decide por sí solo** — siempre propone y deja la
> decisión final al abogado o la URP.

---

## Por qué existe

Hoy los abogados URP deciden caso por caso si un informe se cierra sin escalar o se convierte en denuncia. La experiencia interna tiene heurísticas no escritas: "si el monto supera X, denunciamos"; "si la patente ya apareció en 3 incidentes, denunciamos aunque sea menor"; "todos los incendios van a Fiscalía". Estas reglas hoy viven en la cabeza del abogado y se aplican de forma inconsistente entre personas.

SURP 2.0 codifica esas heurísticas como **sugerencias configurables por el admin del sistema**, con dos propósitos:

1. **Consistencia**: cualquier abogado ve la misma sugerencia para un caso similar.
2. **Auditoría**: queda rastro de qué reglas aplicaron y si el abogado siguió o ignoró la sugerencia.
3. **Alerta temprana**: prevenir que un caso escalable prescriba por olvido (alertas pre-prescripción).

**Nunca automatiza la denuncia.** La decisión final es humana.

---

## Tipos de reglas soportadas

### 1. Regla por monto (threshold)

> "Si el valor total de bienes afectados supera **$X CLP**, sugerir escalar a denuncia."

Configurable por **tipo de incidente** (hurto vs. incendio pueden tener umbrales distintos) y por **zona** (valor de madera varía).

### 2. Regla por tipo de incidente

> "Todos los informes de tipo **Incendio** sugieren escalar."
> "Todos los informes de tipo **Amenazas Armadas** sugieren escalar sin importar monto."

Lista de tipos que se escalan siempre.

### 3. Regla por reincidencia

> "Si una **patente** aparece en ≥ 3 informes en los últimos 12 meses, sugerir escalar este informe."
> "Si un **RUT** aparece en ≥ 2 informes en los últimos 6 meses, sugerir escalar."

Configurable: umbral de conteo, ventana temporal, entidad (patente / RUT / ambos).

### 4. Regla por vinculación con lista negra

> "Si algún **RUT** del informe está bloqueado, sugerir escalar."
> "Si algún **vehículo** del informe tiene patente bloqueada, sugerir escalar."

### 5. Alerta por proximidad de prescripción

> "Informes con `occurred_at` > **4 años** para simple delito → alerta **amarilla**."
> "Informes con `occurred_at` > **4 años y 9 meses** para simple delito → alerta **roja** (acción urgente)."

Configurable por tipo de incidente (mapeo informe→prescripción viene de `/legal-procesal`).

### 6. Regla compuesta

Combinar condiciones con AND/OR:

> "Si **monto > $500.000** AND **algún sospechoso reincidente (≥2 incidentes)** → sugerir escalar con prioridad alta."

---

## Modelo de datos (propuesta inicial, a afinar al implementar)

```sql
CREATE TABLE suggestion_rules (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID UNIQUE DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  rule_type VARCHAR(30) NOT NULL,  -- 'amount', 'incident_type', 'reincidence', 'blocklist', 'prescription', 'composite'
  priority SMALLINT NOT NULL DEFAULT 100,  -- orden de evaluación
  active BOOLEAN NOT NULL DEFAULT true,
  applies_to_zones BIGINT[] NULL,  -- NULL = todas; si tiene valores, solo esas
  applies_to_incident_types BIGINT[] NULL,
  criteria JSONB NOT NULL,         -- parámetros específicos del rule_type
  suggestion_action VARCHAR(30) NOT NULL,  -- 'escalate' | 'alert_amber' | 'alert_red' | 'flag_review'
  suggestion_message TEXT NOT NULL,  -- texto que se muestra al abogado
  created_at, created_by_id, updated_at, updated_by_id
);

CREATE TABLE incident_suggestions (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id),
  rule_id BIGINT NOT NULL REFERENCES suggestion_rules(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by_user_id BIGINT REFERENCES users(id),
  dismiss_reason TEXT,
  followed BOOLEAN,  -- NULL = pendiente, true = el abogado escaló, false = cerró sin escalar
  UNIQUE (incident_id, rule_id)
);
```

Un informe evalúa todas las reglas activas aplicables; cada regla que matchea genera una fila en `incident_suggestions`. El abogado ve las sugerencias, actúa o descarta con motivo, y queda auditado.

---

## Quién configura

- **Administrador del sistema** (rol `administrator`).
- **Administrador URP** (rol `patrimonial_admin`), posiblemente con permiso adicional específico (a definir).
- Toda creación/edición/desactivación de regla se audita (`audit_logs`).
- Las reglas tienen **preview**: antes de activar, el admin puede ver "si esta regla estuviera activa, habría generado N sugerencias en los últimos 12 meses".

---

## Quién ve las sugerencias

- **Abogados** en la vista de detalle del informe: banner con sugerencias activas y botones "Aplicar" (escala a denuncia) / "Descartar con motivo".
- **URP admin** en vista de panel: "incidentes con sugerencia pendiente de acción".
- En el **listado de incidentes**, los que tienen sugerencias activas se destacan visualmente (badge).

---

## Evaluación

- **Al crear/editar un informe:** se evalúan todas las reglas aplicables y se insertan sugerencias nuevas.
- **Job periódico (cron):** reevalúa reglas dependientes del tiempo (prescripción, ventana de reincidencia rolling). Ejecutado por el worker BullMQ (cola `scheduled-digest` o similar). Frecuencia diaria inicial.
- **Cambios en reglas:** al activar una regla nueva, job de **backfill** evalúa todos los incidentes abiertos relevantes y genera las sugerencias correspondientes (no incluye incidentes `voided`).

---

## Cosas que este módulo NO hace

- **No cambia estados automáticamente.** Nunca pasa un informe de `under_review` a `escalated` sin acción humana.
- **No presenta denuncias.** Solo sugiere al abogado. El abogado usa el módulo `complaints` para la denuncia formal.
- **No reemplaza el criterio legal.** Las sugerencias son heurísticas operativas, no invariantes jurídicas. Un abogado puede descartar cualquiera con motivo.
- **No es un motor de reglas genérico** (tipo Drools / JSON Rules Engine complejo). Es un conjunto acotado de `rule_type` con `criteria` JSON; si una regla no encaja en los tipos soportados, se agrega tipo nuevo al código + UI admin.

---

## Implementación sugerida

- **Pattern B (use cases).** Use cases: `EvaluateIncidentSuggestionsUseCase`, `DismissSuggestionUseCase`, `CreateSuggestionRuleUseCase`, etc.
- Tests unitarios por `rule_type` con fixtures de incidentes que deberían/no deberían match.
- Job de evaluación periódica en `apps/api/src/modules/rules/infrastructure/evaluate-rules.processor.ts`.
- UI admin: `/admin/suggestion-rules` con CRUD + preview.
- UI abogado: banner en detalle del informe + filtro "con sugerencias pendientes" en listado.

---

## Fase de entrega

**Post-MVP temprano.** El MVP cierra con `incidents` operativo + denuncias manuales. Las sugerencias se suman como fase 1.1 una vez que hay data real para validar las reglas que propone Iván/URP. Arrancar con 3-4 reglas simples (monto, tipo, reincidencia básica) y extender.

**Ver:** `CLAUDE.md` (Reglas específicas del dominio — referencia a este módulo).
