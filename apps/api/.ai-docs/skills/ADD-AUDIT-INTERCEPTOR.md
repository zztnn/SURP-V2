# Add Audit Interceptor — SURP 2.0

> Cómo implementar y usar auditoría en el backend SURP.

---

## Arquitectura de auditoría

La auditoría tiene dos capas complementarias:

### 1. Trigger automático (CRUD)

El trigger `fn_audit_row_change` en `database/schema/98_audit_triggers.sql` captura **automáticamente** INSERT, UPDATE y DELETE en las tablas aggregate-root. La app no necesita hacer nada para auditar estas operaciones.

Tablas cubiertos por el trigger (a definir al crear el schema, ejemplos):
- `incidents`, `complaints`, `cases`, `persons`, `vehicles`
- `fires`, `maat_records`, `patrol_routes`
- `users`, `roles`, `permissions`

### 2. `AuditInterceptor` NestJS (eventos de negocio)

Para acciones que no son CRUD puro (events de dominio), el `AuditInterceptor` y el `AuditLogger` se encargan:

| Acción | action_type_code |
|--------|-----------------|
| Login exitoso | `user_login` |
| Logout | `user_logout` |
| Intento de login fallido | `login_failed` |
| Incidente cerrado | `incident_closed` |
| Incidente escalado | `incident_escalated` |
| Causa cerrada | `case_closed` |
| Denuncia radicada | `complaint_filed` |
| Evidencia cargada | `evidence_uploaded` |
| Exportación generada | `export_generated` |
| Persona bloqueada | `person_blocked` |

---

## Setear GUCs de auditoría

El `AuditInterceptor` debe setear al inicio de cada request autenticada:

```typescript
// apps/api/src/common/interceptors/audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const ctx = request.requestContext as RequestContext;

    return new Observable((observer) => {
      this.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL app.current_user_id = ${ctx.userId}`);
        await tx.execute(sql`SET LOCAL app.session_id      = ${ctx.sessionId}`);
        await tx.execute(sql`SET LOCAL app.request_id      = ${ctx.requestId}`);

        next.handle().subscribe({
          next: (value) => observer.next(value),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });
      });
    });
  }
}
```

---

## Loggear eventos de negocio

```typescript
// Desde un use-case
await this.auditLogger.logEvent({
  actionCode: 'incident_closed',
  entityId: incident.id,
  entityTable: 'incidents',
  payload: { resolution: input.resolution },
  ctx,
});
```

Esto llama a la función PostgreSQL `fn_audit_log_event()`:

```sql
SELECT fn_audit_log_event(
  p_action_type_code := 'incident_closed',
  p_entity_table     := 'incidents',
  p_entity_id        := 42,
  p_payload          := '{"resolution": "Detenido por Carabineros"}'::jsonb,
  p_user_id          := current_setting('app.current_user_id')::bigint
);
```

---

## Regla anti-doble-auditoría

El trigger cubre CRUD (INSERT/UPDATE/DELETE). El interceptor/AuditLogger cubre **eventos de negocio**. **NO duplicar** — si una operación es solo un UPDATE, el trigger ya la captura. Solo llamar `fn_audit_log_event()` manualmente para eventos semánticamente distintos (close, escalate, block, etc.).

---

## Bypass para migraciones/imports masivos

```typescript
await tx.execute(sql`SET LOCAL app.skip_audit = 'true'`);
// ... operaciones masivas de carga de datos
```

Usar solo en jobs de migración del legacy. No en código productivo.
