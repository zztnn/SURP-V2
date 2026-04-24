# Error Handling Standards — SURP 2.0 API

> Contrato de errores del backend SURP. Mensajes al usuario siempre en
> **español latinoamericano**. Logs técnicos en inglés.

---

## Respuesta estructurada

Todo error devuelto al cliente sigue este contrato JSON:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "INVALID_RUT",
  "message": "El RUT ingresado no es válido.",
  "field": "rut",
  "requestId": "8f3b8c1a-2f9e-4c17-9e84-1a2b3c4d5e6f"
}
```

| Campo | Obligatorio | Descripción |
|-------|------------|-------------|
| `statusCode` | Sí | Código HTTP |
| `error` | Sí | Reason phrase HTTP |
| `code` | Sí | String-key estable para UX en frontend |
| `message` | Sí | Texto en español listo para mostrar al usuario |
| `field` | No | Campo que falló (solo errores de validación) |
| `errors` | No | Array de `{ field, code, message }` para múltiples campos |
| `requestId` | Sí | UUID de traza (correlación con logs) |

El `GlobalExceptionFilter` normaliza toda excepción al contrato anterior, loggea stack traces (sin exponerlos), e invoca `ErrorNotifierService` para errores 5xx.

---

## NestJS exceptions

| Exception | Cuándo usar | HTTP |
|-----------|------------|------|
| `BadRequestException` | Input inválido, regla de dominio violada | 400 |
| `UnauthorizedException` | Falta JWT o es inválido | 401 |
| `ForbiddenException` | JWT válido pero sin permiso | 403 |
| `NotFoundException` | Registro no existe | 404 |
| `ConflictException` | Duplicate key, conflicto de estado | 409 |
| `UnprocessableEntityException` | Validación que depende del estado del sistema | 422 |
| `InternalServerErrorException` | Error inesperado (dispara email) | 500 |

Siempre con objeto estructurado:

```typescript
throw new BadRequestException({
  code: 'INVALID_RUT',
  message: 'El RUT ingresado no es válido.',
  field: 'rut',
});
```

Nunca `throw new Error(...)` directo. Nunca strings sueltos.

---

## Catálogo de códigos estables

### Validación e input

| `code` | HTTP | Uso |
|--------|------|-----|
| `VALIDATION_FAILED` | 400 | Múltiples campos inválidos (class-validator) |
| `INVALID_RUT` | 400 | RUT rechazado por módulo 11 |
| `INVALID_DATE` | 400 | Fecha en formato incorrecto o fuera de rango |
| `INVALID_COORDINATES` | 400 | Lat/lng fuera de rango válido |
| `MISSING_REQUIRED` | 400 | Falta campo obligatorio |

### Recursos

| `code` | HTTP | Uso |
|--------|------|-----|
| `NOT_FOUND` | 404 | Entidad no existe o fue borrada |
| `DUPLICATE_KEY` | 409 | Unique constraint violada |
| `FK_VIOLATION` | 409 | Referencia a entidad inexistente |
| `INVALID_STATE` | 400 | Operación no permitida en el estado actual |

### AuthN / AuthZ

| `code` | HTTP | Uso |
|--------|------|-----|
| `UNAUTHORIZED` | 401 | Sin JWT o JWT inválido |
| `TOKEN_EXPIRED` | 401 | Access token expirado |
| `SESSION_REVOKED` | 401 | Sesión revocada |
| `ACCOUNT_LOCKED` | 401 | Cuenta bloqueada |
| `INSUFFICIENT_PERMISSIONS` | 403 | El perfil no incluye el permiso |

### Dominio SURP

| `code` | HTTP | Uso |
|--------|------|-----|
| `INCIDENT_CLOSED` | 400 | Intento de modificar un incidente cerrado |
| `CASE_FINALIZED` | 400 | Operación no permitida en causa finalizada |
| `EVIDENCE_IMMUTABLE` | 400 | Evidencias no pueden editarse tras carga |
| `MAAT_PROVIDER_ERROR` | 502 | El sistema MAAT respondió con error |
| `INVALID_GEOMETRY` | 400 | Geometría PostGIS inválida (ST_IsValid = false) |
| `RATE_LIMITED` | 429 | Throttler |

El catálogo completo se mantiene en `apps/api/src/common/errors/error-codes.ts` como enum const.

---

## Validación con class-validator

```typescript
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors) => formatValidationErrors(errors),
  });
}
```

---

## Patrones estándar

### findByExternalId

```typescript
async findByExternalId(externalId: string): Promise<Incident> {
  const row = await this.repo.findByExternalId(externalId);
  if (!row) {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'El incidente no existe o no tiene permiso para verlo.',
    });
  }
  return row;
}
```

### Guard de estado

```typescript
const EDITABLE_STATES: IncidentStatus[] = ['open', 'in_progress'];

if (!EDITABLE_STATES.includes(incident.status)) {
  throw new BadRequestException({
    code: 'INCIDENT_CLOSED',
    message: `No se puede modificar un incidente en estado "${incident.status}".`,
  });
}
```

### Integración externa (MAAT)

```typescript
try {
  const result = await this.maatProvider.sync(payload);
  return result;
} catch (err) {
  this.logger.error('MAAT provider failed', { err, incidentId: payload.externalId });
  throw new BadGatewayException({
    code: 'MAAT_PROVIDER_ERROR',
    message: 'El sistema MAAT no respondió correctamente. Intente más tarde.',
  });
}
```

---

## Errores de base de datos

| PG `code` | Mapea a | HTTP | `code` |
|-----------|---------|------|--------|
| `23505` | Unique violation | 409 | `DUPLICATE_KEY` |
| `23503` | FK violation | 409 | `FK_VIOLATION` |
| `23502` | Not null violation | 400 | `MISSING_REQUIRED` |
| `23514` | Check constraint (ej. `d_rut`) | 400 | depende del check |
| `P0001` | RAISE EXCEPTION (trigger/dominio) | 400 | `DOMAIN_ERROR` |

Nunca exponer el SQL ni nombres internos de constraints.

---

## Prohibiciones

- **No tragar errores en silencio** (`catch { /* nothing */ }`).
- **No exponer SQL, stack traces ni mensajes de pg** al cliente.
- **No lanzar `Error` genérico** — usar excepciones de NestJS.
- **No mezclar inglés y español** en `message`. Siempre español.
- **No devolver 200 con `{ error: ... }`** — usar el HTTP code correcto.

---

## Referencias

- Filter global: `apps/api/src/common/filters/global-exception.filter.ts`
- Validation pipe: `apps/api/src/shared/validation/validation-pipe.factory.ts`
- Error codes: `apps/api/src/common/errors/error-codes.ts`
