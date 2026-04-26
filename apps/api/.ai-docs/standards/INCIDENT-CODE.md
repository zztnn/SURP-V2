# Incident Code — Código correlativo del informe de incidente

> Documentación del **código humano** del informe de incidente SURP 2.0.
> Es un requerimiento **crítico** del dominio — el folio debe ser secuencial,
> sin brechas, por zona y por año. Rompe este invariante rompe trazabilidad
> forense y procesos internos URP.

---

## Formato

```
{NN}-{YYYY}-Z{XX}
```

- `NN` — número correlativo, comienza en `1` cada año y por cada zona.
- `YYYY` — año calendario de cuatro dígitos.
- `Z{XX}` — prefijo `Z` fijo + sigla de **2 letras** de la zona.

**Ejemplo:** `19-2026-ZVA` = informe número 19 del año 2026 en la zona VA.

El formato viene del legacy y se mantiene idéntico para continuidad operativa y visual.

---

## Invariantes duros

1. **Sin brechas en el correlativo por zona+año.** Si existe el 47, debe existir también el 46, 45, …, 1 (aunque algunos estén en estado `voided`). Este es el invariante más delicado del módulo de incidentes.
2. **Correlativo por año del evento.** Si un evento ocurre el 31-dic-2026 y se sincroniza el 02-ene-2027, el código usa **2026** (año del evento) — el correlativo del año anterior **puede** recibir un número más al sincronizar.
3. **Zona la decide quien ingresa el informe.** Aunque el guardia esté físicamente en la zona A, si declara que el evento ocurrió en la zona B, el código usa la sigla de B.
4. **Asignación server-side al sincronizar.** Offline no hay código. El celular muestra "PENDIENTE" hasta que se sincroniza; al llegar al servidor, se asigna el próximo correlativo bajo lock transaccional.
5. **Colisión offline se resuelve por orden de llegada al servidor.** Dos guardias distintos sincronizando al mismo tiempo para la misma zona+año obtienen números consecutivos según cuál llegue primero al lock.
6. **Anular NO libera el número.** Un informe `voided` mantiene su correlativo ocupado. En la UI default no aparece (filtrado por estado); admin con filtro "incluir anulados" lo ve tachado con su motivo.
7. **Nunca hard-delete** de incidentes `submitted`. La eliminación física rompería el invariante 1. Solo soft-delete vía `voided`.

---

## Implementación

### Tabla de catálogo de zonas

La zona expone dos columnas:

- `code VARCHAR(10)` — código interno (sacado del legacy al migrar).
- `short_code VARCHAR(2)` — sigla de 2 letras para el código de incidente (ej. `VA`, `AR`, `SM`).

Las siglas oficiales se cargan en el seed desde el legacy; **no inventar**.

### Contador por zona+año

Tabla `incident_sequences`:

```sql
CREATE TABLE incident_sequences (
  zone_id     BIGINT NOT NULL REFERENCES zones(id),
  year        SMALLINT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (zone_id, year)
);
```

### Asignación atómica

```typescript
await db.transaction().execute(async (tx) => {
  const row = await tx
    .insertInto('incident_sequences')
    .values({ zone_id: zoneId, year: eventYear, last_number: 1 })
    .onConflict((oc) =>
      oc
        .columns(['zone_id', 'year'])
        .doUpdateSet({ last_number: sql`incident_sequences.last_number + 1` }),
    )
    .returning('last_number')
    .executeTakeFirstOrThrow();

  const code = `${row.last_number}-${eventYear}-Z${zoneShortCode}`;

  await tx
    .insertInto('incidents')
    .values({
      external_id: incidentUuid,
      code,
      sequence_number: row.last_number,
      sequence_year: eventYear,
      zone_id: zoneId,
      occurred_at: occurredAt,
      // ... resto del payload
    })
    .execute();
});
```

Puntos:

- El `onConflict` atómico evita condiciones de carrera con múltiples sincronizaciones simultáneas.
- El `RETURNING` da el próximo número sin SELECT adicional.
- El código se **arma en memoria** después del `returning`, se inserta en la misma transacción.
- `incidents.code` lleva UNIQUE constraint (`zone_id + year + sequence_number` también UNIQUE como seguridad adicional).

### ¿Por qué no `SERIAL` / `BIGSERIAL`?

Un `SERIAL` global no sirve: el correlativo es **por zona + año**, no global. Y `SERIAL` permite brechas (rollback consume un valor) — acá no se tolera ni una brecha. Usamos la tabla `incident_sequences` como contador explícito con lock transaccional.

### ¿Por qué no `row_number()` calculado al vuelo?

Porque dos sincronizaciones simultáneas de dos zonas distintas podrían salir en orden inverso y asignar el mismo número si se calcula al momento de lectura. La fuente de verdad del número debe ser una fila persistente actualizada bajo lock.

---

## UX offline

1. El guardia captura el incidente en el celular.
2. Hasta sincronizar, la UI muestra `PENDIENTE DE NUMERACIÓN`.
3. Al sincronizar, se asigna el correlativo y la UI lo refleja en la próxima consulta.
4. Si la sincronización falla (error de red, validación), el incidente queda en `draft` sin código. El guardia puede reintentar.

**El guardia NO puede alterar el código** — es server-assigned, inmutable una vez asignado.

---

## Renumeración histórica

**Nunca.** Cambiar un código rompe todos los documentos oficiales, partes policiales, denuncias ya presentadas y queda inconsistente con la memoria del equipo URP. No hay casos de uso legítimos para renumerar un informe.

Si un informe está mal (duplicado, error grave), se **anula** (`voided`), el número queda ocupado, y se crea un informe nuevo con el siguiente correlativo. La UI debe dejar clara la relación entre el anulado y su reemplazo (campo `replaced_by_incident_id` opcional).

---

## Migración legacy

En el legacy, la tabla `Incidentes` tiene:

- `Numero INT` — correlativo por zona+año.
- `Codigo VARCHAR` — representación textual (`{Numero}-{Año}-Z{ShortZona}`).

Ambos se migran **idénticos** al SURP 2.0: `incidents.sequence_number = Numero`, `incidents.code = Codigo`. Se inicializa `incident_sequences(zone_id, year, last_number = max(Numero por zona+año)` para cada (zona, año) migrado, de forma que la próxima numeración después del go-live continúe desde donde quedó el legacy.

**Validación pre-cutover:** verificar que todos los pares (zona, año, número) son únicos en el legacy. Si hay duplicados o brechas pre-existentes en legacy, se reportan pero **no se corrigen** — se heredan como están (los documentos oficiales de Arauco ya referencian esos números).

---

## Invariantes de test

Tests de integración obligatorios del módulo `incidents`:

1. Dos sincronizaciones concurrentes para la misma zona+año dan números distintos consecutivos.
2. Sincronización con `occurred_at` del año anterior agrega al correlativo de ese año, no al actual.
3. Anular un incidente no libera el número.
4. El número del incidente es inmutable una vez asignado.
5. Migrar legacy inicializa `incident_sequences` correctamente para continuar la numeración.
