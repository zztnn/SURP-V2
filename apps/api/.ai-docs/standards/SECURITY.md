# Security Standards — SURP 2.0 API

> Seguridad del backend SURP. Maneja datos sensibles: ubicaciones de incidentes, datos de imputados, RUTs, evidencias judiciales, causas, bloqueos. Lectura obligatoria antes de exponer cualquier endpoint.

Relacionado:

- `AUTHORIZATION.md` — Modelo multi-organización + RBAC dinámico
- ADR-B-009 — Auditoría CRUD + lecturas sensibles
- `memory/KNOWN-PITFALLS.md` — Errores heredados del legacy que NO se repiten

---

## 0. Lo que NO heredamos del legacy

El legacy SURP (ASP.NET Core 3.1) tiene vulnerabilidades graves. SURP 2.0 las corrige estructuralmente. **Estas son prohibiciones explícitas — no se relajan:**

| Vulnerabilidad legacy                                       | Evidencia                                                   | Mitigación SURP 2.0                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Connection strings hardcodeados con password en texto plano | `SACL.EF/SACLContext.cs:81-86`, `appsettings.json`          | Azure Key Vault para todos los secretos. `.env` local nunca se comitea.                                                             |
| Password "encriptado" con clave simétrica fija              | GUID `a392ef91-...` hardcodeado en múltiples archivos       | `argon2id` (password hashing irreversible). Nunca hay "desencriptar" en el código.                                                  |
| Controllers sin `[Authorize]`                               | `MaatController` accesible sin login                        | Guards globales (`JwtAuthGuard` + `PermissionGuard`) por defecto. Endpoints públicos requieren `@Public()` explícito.               |
| Autorización solo en menú                                   | `Views/Shared/Components/SideMenu/Default.cshtml`           | `PermissionGuard` en cada endpoint. El menú frontend es solo UX.                                                                    |
| Filtros de visibilidad comentados "temporal"                | `IncidentesController` tiene el filtro de empresa comentado | No se permite código comentado en main. Si hay un bug, se arregla o se revierte.                                                    |
| API con credenciales de usuario real en headers             | `usr`/`pwd` en `SURP.API/Controllers/*`                     | API keys por `api_consumer`, rotables, auditadas, rate-limited.                                                                     |
| Endpoint que devuelve lista completa sin filtrar            | `/araucaria/incidentes` devuelve todos los incidentes       | Prohibido. Toda lista va paginada + filtrada por scope del usuario. Listas completas solo para `principal` con paginación estricta. |
| Tabla `Permiso(Perfil, Controlador)` como código muerto     | Existe pero no se consulta                                  | RBAC dinámico real: `role_permissions` se consulta en cada autenticación.                                                           |
| Sin auditoría CRUD                                          | Ninguna tabla de audit para incidentes/denuncias/causas     | Trigger PostgreSQL + `AuditInterceptor` + decorador de lectura sensible.                                                            |
| Sin rate limit en API                                       | -                                                           | `@nestjs/throttler` global + límites custom por API key.                                                                            |
| Sin HSTS ni helmet                                          | -                                                           | `helmet` obligatorio con HSTS 1 año, CSP estricto.                                                                                  |

Si ves en un PR algún indicio de re-introducir estas fallas: **bloquear y escalar**.

---

## 1. Defensa en profundidad

Toda request autenticada pasa por estas capas:

1. **HTTPS + Helmet** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options.
2. **Rate limiting global** — `@nestjs/throttler` en todos los endpoints.
3. **Autenticación** — `JwtAuthGuard` (users) o `ApiKeyAuthGuard` (api_consumers).
4. **Autorización (RBAC)** — `PermissionGuard` valida el permiso declarado con `@RequirePermission(...)`.
5. **Organization scope** — `OrganizationScopeInterceptor` aplica filtros por org/zona.
6. **Validación de input** — `class-validator` + `buildValidationPipe()` (mensajes es-CL).
7. **Auditoría** — `AuditInterceptor` setea GUCs y audita lecturas sensibles.
8. **Secretos** — Azure Key Vault, nunca en código ni `.env` comiteado.

---

## 2. Autenticación de usuarios (web)

### 2.1 Login

- Credencial: email + password.
- Password se compara con `argon2.verify(hash, submitted)` — **nunca se desencripta**.
- Parámetros `argon2id`: `memoryCost=65536`, `timeCost=3`, `parallelism=4`. Revisar cada 6 meses.
- En login exitoso se emiten:
  - **Access token** — JWT firmado con RS256, TTL 15 min. Claims: `sub` (external_id), `userId`, `organizationId`, `organizationType`, `roleId`, `roleScope`, `permissions[]`, `sessionId`, `iat`, `exp`.
  - **Refresh token** — opaco (128 bytes random), TTL 30 días, en cookie `httpOnly; secure; sameSite=strict`. Rotado en cada uso. Guardado hasheado en `user_sessions.refresh_token_hash`.
- En login fallido se incrementa `user_login_attempts` y se audita.

### 2.2 Bloqueo de cuenta

- 5 intentos fallidos en 10 minutos → `users.locked_until = now() + 15 minutes`.
- El desbloqueo es automático al expirar `locked_until` o manual por admin.
- Intentos de login a cuenta bloqueada se auditan con `action='login_locked'`.

### 2.3 Reset de password

- Usuario solicita reset por email. Token de reset: opaco (128 bytes), TTL 30 min, `single-use`.
- Email solo contiene el link; el token nunca se loggea.
- Al aplicar reset se invalidan todas las sesiones activas del usuario (todas las `user_sessions`).
- **Usuarios migrados del legacy** llegan con `must_reset_password=true`. El primer login redirige obligatoriamente al flujo de reset.

### 2.4 Sesiones

- Tabla `user_sessions (id, user_id, refresh_token_hash, ip, user_agent, issued_at, last_refreshed_at, expires_at, revoked_at)`.
- Admin puede revocar sesiones de un usuario (`/admin/users/:id/sessions/revoke-all`).
- Logout invalida el refresh token (marca `revoked_at`).

---

## 3. Autenticación de `api_consumer` (API externa)

### 3.1 API keys

- Formato: `sk_<prefix8>_<secret>` (ej. `sk_a7f2e9b1_k4h2...`).
- Guardado: `api_keys.prefix` (8 chars, indexado, visible para identificar) + `api_keys.key_hash` (argon2 del secret).
- Nunca se loggea la key completa.
- Entregada UNA sola vez al crearla; si se pierde, se rota.
- Header esperado: `Authorization: Bearer sk_...`. No se acepta en query string (aparecería en logs).

### 3.2 Scope de API keys

- Una API key pertenece a una `organizations.type='api_consumer'`.
- El `ApiKeyAuthGuard` resuelve `organization_id` y otorga el permiso fijo `queries.blocks.check`. **Ninguna otra capacidad.**
- Endpoints disponibles para `api_consumer`:
  - `GET /api/v1/blocks/check?rut=<RUT>` → `{ blocked: boolean, reason?: string }`
  - `GET /api/v1/blocks/check?plate=<patente>` → `{ blocked: boolean, reason?: string }`
- **Prohibido exponer listas.** El endpoint `/araucaria/incidentes` del legacy no se reimplementa. Si Arauco necesita proveer data agregada a un tercero, se discute caso por caso con contrato de datos explícito.

### 3.3 Rate limiting para API keys

- Default: 60 requests/min por key. Configurable por key en `api_keys.rate_limit_per_minute`.
- Exceso → HTTP 429 + header `Retry-After`. Se audita con `action='api_rate_limit_exceeded'`.

### 3.4 Rotación y expiración

- `api_keys.expires_at` opcional. Si está seteado, la key rechaza requests tras la fecha.
- `api_keys.revoked_at` permite invalidar inmediatamente.
- Un cron diario alerta por email cuando falta <30 días para `expires_at`.

---

## 4. Autorización — RBAC

Detalle completo en `AUTHORIZATION.md`. Resumen:

- **11 roles base de seed** (`is_system=true`) derivados del legacy.
- **Admin puede crear/editar roles** desde UI (`/admin/roles`). Los permisos son un catálogo fijo en código.
- **Scope del rol** (`principal_only` / `security_provider_only` / `api_consumer_only`) restringe qué tipo de organización puede tenerlo.
- **Decorador `@RequirePermission('modulo.recurso.accion')`** en cada endpoint.
- **`@Public()`** para los pocos endpoints sin auth (login, health, etc.).

---

## 5. Datos sensibles del dominio

### 5.1 Campos sensibles que requieren cuidado especial

| Dato                                      | Regla                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| RUT de imputados, testigos, víctimas      | Permiso `persons.imputados.read` (sensible). No loguear. No exponer en URL path.                                                   |
| Coordenadas de incidentes                 | Solo usuarios con `incidents.incidents.read` las reciben. No loguear coordenadas en Application Insights.                          |
| Evidencias judiciales (fotos/videos/docs) | Permiso `incidents.evidence.download`. Toda descarga se audita como lectura sensible con `entity_external_id` y `reason` opcional. |
| Datos de causas judiciales                | Permiso `cases.cases.read` (sensible). Solo usuarios `principal` con rol lawyer/admin.                                             |
| MAAT records                              | Permiso `maat.records.read` / `maat.records.manage`. Solo asignado a personal autorizado.                                          |
| Password hash                             | Nunca se devuelve en ninguna respuesta. Campo excluido explícitamente en el mapper.                                                |
| Refresh tokens                            | Nunca en respuesta JSON. Solo cookie httpOnly.                                                                                     |

### 5.2 Auditoría de lecturas sensibles

Ver ADR-B-009. Toda invocación a un endpoint con `@RequirePermission(...)` cuyo permiso tenga `is_sensitive=true` genera una fila en `audit_logs`:

```json
{
  "occurred_at": "...",
  "user_id": 123,
  "organization_id": 1,
  "source": "sensitive_read",
  "action": "evidence_download",
  "entity_type": "incident_evidences",
  "entity_external_id": "...",
  "metadata": { "file_name": "foto_01.jpg", "file_size_bytes": 245000 },
  "ip": "...",
  "user_agent": "..."
}
```

---

## 6. Almacenamiento de secretos

- **Producción:** Azure Key Vault. La API lee secretos al arrancar (o lazy al primer uso). Cada secret tiene rotación documentada.
- **Desarrollo local:** `.env` (no comiteado). `.env.example` lista las variables sin valores reales.
- **CI/CD:** Azure DevOps / GitHub Actions lee de Key Vault con Managed Identity.
- **JWT signing key:** par RSA generado por ambiente, rotado cada 90 días. La API valida tokens firmados por la key anterior durante la ventana de rotación (`kid` claim).
- **Cualquier PR que introduzca un string que parezca secreto** (patrón ConnectionString, `Bearer`, password=, etc.) es bloqueado por el hook de pre-commit `detect-secrets`.

---

## 7. Headers HTTP (Helmet)

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // tailwind inline ok
        imgSrc: ["'self'", 'data:', 'https://*.blob.core.windows.net'], // fotos de evidencia
        connectSrc: ["'self'", 'https://dc.services.visualstudio.com'], // App Insights
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
  }),
);
```

---

## 8. Rate limiting

```typescript
// Global default
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]);  // 120 req/min por IP

// Overrides por endpoint
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('auth/login')                                       // 5 intentos/min por IP
```

API keys llevan un throttle separado (sección 3.3) indexado por `organization_id`.

---

## 9. Validación de input

- Todos los DTOs usan `class-validator` con mensajes en español.
- RUT: decorador `@IsRut()` (valida módulo 11) en toda columna de RUT.
- Coordenadas: `@IsLatitude()`, `@IsLongitude()` + validación de rango razonable para Chile (`lat: -56 to -17`, `lng: -76 to -66`).
- Uploads: validar mime type + magic bytes (no confiar en `content-type` del cliente).
- **Nunca** interpolar strings de usuario en queries SQL. Kysely parametriza automáticamente cuando usás el query builder (`.where('col', '=', value)`) y la plantilla `sql\`... ${value} ...\``— los valores van como bind parameters. **Nunca** construir queries con concatenación de strings ni con`sql.raw(userInput)`.

---

## 10. Auditoría y observabilidad

- `AuditInterceptor` setea GUCs al inicio de cada request autenticada (ver ADR-B-009).
- Logs operativos: `Logger` de NestJS con estructura JSON, enviados a Application Insights.
- Nunca loguear: password, token, refresh token, API key, RUT en claro, coordenadas en claro.
- Alertas automáticas (Application Insights) para: login bruteforce, uso de API key desde IP no habitual, errores 500 en endpoints críticos, auditoría del admin (cambios a roles o permisos).

---

## 11. Prohibiciones (resumen)

- **No usar `any`** — TypeScript strict, `unknown` + type guards o tipos específicos.
- **No exponer `id` interno** — siempre `external_id` (UUID).
- **No loggear PII** (RUT, nombres de imputados, coordenadas precisas).
- **No exponer stack traces** al cliente (`GlobalExceptionFilter` los suprime).
- **No conectar a producción** desde dev sin autorización explícita.
- **No hardcodear credenciales, URLs de producción, claves de encriptación** en código.
- **No re-introducir** ninguna de las vulnerabilidades listadas en la sección 0.
- **No implementar** endpoints de admin sin `@RequirePermission('*.manage')` y auditoría.
- **No dejar** un endpoint sin guard — `@Public()` es explícito y justificable.
