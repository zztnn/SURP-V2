# Notifications — SURP 2.0 Backend

> Envío de notificaciones por correo electrónico usando **Azure Communication
> Services Email** con Managed Identity. Cola BullMQ + templates editables +
> auditoría + tracking de delivery vía Event Grid.
>
> **Reemplazó Google Workspaces SMTP** — ver ADR-B-021.

---

## Stack

- **Transport (prod/staging):** `@azure/communication-email` v1.x con `DefaultAzureCredential` (Managed Identity).
- **Transport (dev):** Nodemailer sobre MailHog (`localhost:1025` SMTP, `localhost:8025` UI). Conmutado por `MAIL_DRIVER=local`.
- **Cola:** BullMQ `notification-dispatch` (ver `BACKGROUND-JOBS.md`).
- **Templates:** MJML + Handlebars. MJML compila a HTML compatible con Outlook (que ignora CSS moderno).
- **Plain text fallback:** obligatorio — generado automáticamente desde MJML con `html-to-text`.
- **Tracking de delivery:** Event Grid Topic suscrito a eventos del ACS resource (`EmailDeliveryReportReceived`, `EmailEngagementTrackingReportReceived`). Actualiza `notifications.status` automáticamente.

Nada de SendGrid/Mailgun/Resend. Nada de Workspace SMTP (descartado en ADR-B-021).

---

## Configuración Azure Communication Services

### Provisioning (Bicep / `az` CLI)

```bash
# Resource group
az group create -n rg-surp-comm -l eastus

# Communication Services resource (datacenter por motivos de compliance Chile)
az communication create -n surp-comm -g rg-surp-comm \
  --location global --data-location chile

# Email service + dominio Azure-managed (sandbox MVP)
az communication email create -n surp-email -g rg-surp-comm \
  --location global --data-location chile

az communication email domain create -n AzureManagedDomain \
  --email-service-name surp-email -g rg-surp-comm \
  --location global --domain-management AzureManaged

# Production: dominio personalizado surp.cl (requiere DNS SPF/DKIM/DMARC)
az communication email domain create -n surp.cl \
  --email-service-name surp-email -g rg-surp-comm \
  --location global --domain-management CustomerManaged

# Asignar rol al Managed Identity de la Container App
az role assignment create \
  --assignee <container-app-mi-principal-id> \
  --role "Email Communication Services Domain Owner" \
  --scope <acs-resource-id>
```

DNS records que TI de Arauco debe agregar en `surp.cl` para validar el dominio:

- 1 CNAME para validation token (lo entrega ACS al crear el dominio).
- 1 TXT SPF (`v=spf1 include:_spf.azurecomm.net -all` o include en SPF existente).
- 2 CNAME DKIM (selectores `selector1` y `selector2` apuntando a ACS).
- 1 TXT DMARC (`v=DMARC1; p=quarantine; rua=mailto:dmarc@surp.cl`).

Sin dominio verificado, ACS solo permite enviar a casillas Microsoft (Outlook/Hotmail/Office365) — útil para sandbox interno; nunca para producción.

### Cliente SDK

```typescript
// apps/api/src/notifications/transports/azure-acs.transport.ts (esbozo)
import { EmailClient } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';

export class AzureAcsTransport implements EmailTransport {
  private readonly client: EmailClient;

  constructor(private readonly endpoint: string) {
    this.client = new EmailClient(endpoint, new DefaultAzureCredential());
  }

  async send(message: PreparedEmail): Promise<EmailSendResult> {
    const poller = await this.client.beginSend({
      senderAddress: message.from, // 'DoNotReply@surp.cl'
      recipients: { to: message.to.map((address) => ({ address })) },
      content: {
        subject: message.subject,
        html: message.html,
        plainText: message.plainText,
      },
      headers: {
        'X-SURP-Notification-Code': message.code, // p.ej. 'case.deadline_alert'
        'X-SURP-Job-Id': message.jobId,
      },
    });

    const result = await poller.pollUntilDone();
    return { id: result.id, status: result.status }; // status = 'Succeeded' | 'Failed'
  }
}
```

`endpoint` viene de `ACS_ENDPOINT` (env). Las credenciales NO se pasan: `DefaultAzureCredential` resuelve Managed Identity en Azure y `az login` en local.

### Driver dual

```typescript
// apps/api/src/notifications/transports/transport.factory.ts
const driver = config.MAIL_DRIVER; // 'local' | 'azure_acs'
return driver === 'local'
  ? new LocalSmtpTransport({ host: 'localhost', port: 1025 })
  : new AzureAcsTransport(config.ACS_ENDPOINT);
```

Ambos implementan el mismo puerto `EmailTransport`. El servicio de notifications no sabe cuál está activo — solo el factory.

---

## Cuentas emisoras

| Dirección            | Uso                                                             | Display name        |
| -------------------- | --------------------------------------------------------------- | ------------------- |
| `DoNotReply@surp.cl` | Notificaciones automáticas del sistema                          | `SURP — Arauco URP` |
| `alertas@surp.cl`    | Alertas operativas críticas (incidente, plazo en rojo, bloqueo) | `SURP Alertas`      |
| `reportes@surp.cl`   | Reportes y exports listos para descarga                         | `SURP Reportes`     |

Las tres se configuran como `MailFrom` addresses verificadas en el dominio `surp.cl` del ACS. No requieren cuenta humana detrás (a diferencia de Google donde había que impersonar `noreply@surp.cl`).

`Reply-To` por default a `soporte@surp.cl` (casilla humana de Workspace; sigue existiendo para responder).

---

## Cuotas y rate limit ACS

| Tier                                    | Cuota                                 |
| --------------------------------------- | ------------------------------------- |
| Sandbox (Azure-managed domain)          | 10 destinatarios/min, 100/día         |
| Custom domain verificado, sin solicitud | 200 destinatarios/min, 100k/día       |
| Custom domain con solicitud de aumento  | hasta 6.000/min vía soporte Microsoft |

**Estrategia MVP:**

- `notification-dispatch` con `limiter: { max: 100, duration: 60_000 }` (margen sobre cuota base).
- Alarma en Application Insights si el rate de envío supera el 80% de la cuota actual.
- Digest con muchos destinatarios se divide en lotes de 50 con backpressure.
- **Nunca adjuntar archivos.** Las notificaciones con archivo enlazan al backend con SAS de 7 días (ADR-B-016).

---

## Catálogo de notificaciones

Todas las notificaciones tienen un **código único** que identifica el template y la regla de envío. Guardados en `notification_templates (code, subject_template, body_mjml, plain_fallback, enabled, editable_by_admin, is_mandatory, locale)`.

### Cuenta y autenticación

| Código                           | Trigger                                              | Destinatario                | Mandatorio |
| -------------------------------- | ---------------------------------------------------- | --------------------------- | ---------- |
| `account.welcome`                | Admin crea usuario nuevo                             | Usuario creado              | sí         |
| `account.password_reset_request` | Usuario pide reset (o forzado tras migración legacy) | Usuario                     | sí         |
| `account.password_changed`       | Password cambiado                                    | Usuario                     | sí         |
| `account.email_changed`          | Email cambiado                                       | Email anterior + nuevo      | sí         |
| `account.login_new_device`       | Login desde IP/device desconocido                    | Usuario                     | sí         |
| `account.locked`                 | 5 intentos fallidos seguidos                         | Usuario + admin del sistema | sí         |
| `account.roles_changed`          | Admin modifica roles del usuario                     | Usuario afectado            | sí         |

### Incidentes y denuncias

| Código                      | Trigger                                                       | Destinatario                                     |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `incident.critical_created` | Incidente tipo `fire` o con flag `es_critico`                 | Rol `patrimonial_admin` + rol `fires_specialist` |
| `incident.assigned`         | Incidente asignado a un usuario                               | Asignado                                         |
| `complaint.filed`           | Denuncia creada (informa a URP + empresa de seguridad origen) | URP + autor                                      |
| `zone.reassigned`           | Zona reasignada de empresa A a B                              | Admins de ambas empresas                         |

### Causas judiciales

| Código                              | Trigger                                               | Destinatario                                     |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `case.assigned`                     | Abogado asignado a causa                              | Abogado                                          |
| `case.attorney_changed`             | Cambio de titular                                     | Titular nuevo + saliente + Abogado Administrador |
| `case.stage.advanced`               | Cambio de instancia procesal                          | Abogados asignados                               |
| `case.closed`                       | Cierre de causa                                       | Abogados asignados + Abogado Administrador       |
| `hearing.scheduled`                 | Audiencia programada                                  | Abogados asignados                               |
| `hearing.reminder.24h`              | 24h antes de audiencia                                | Abogados asignados                               |
| `hearing.reminder.1h`               | 1h antes de audiencia                                 | Abogados asignados                               |
| `hearing.completed.pending_outcome` | Hora de audiencia pasó sin outcome registrado         | Abogado titular                                  |
| `case.deadline.alert`               | Plazo procesal próximo (según severidad del catálogo) | Abogados asignados                               |
| `case.deadline.overdue`             | Plazo vencido sin cumplimiento                        | Abogados asignados + Abogado Administrador       |
| `resolution.issued`                 | Resolución cargada                                    | Abogados asignados                               |
| `task.assigned`                     | Tarea asignada                                        | User asignado                                    |
| `task.due`                          | Tarea por vencer                                      | User asignado                                    |
| `querella.filed`                    | Querella presentada                                   | Abogado Administrador                            |
| `appeal.filed`                      | Recurso presentado                                    | Abogado Administrador                            |
| `pjud.update.detected`              | (post-MVP) Pull PJUD detectó movimiento               | Abogado titular                                  |

### Reportes y exports

| Código          | Trigger                       | Destinatario                |
| --------------- | ----------------------------- | --------------------------- |
| `report.ready`  | Reporte generado exitosamente | Solicitante                 |
| `report.failed` | Reporte falló                 | Solicitante + admin sistema |
| `export.ready`  | Export Excel/PDF listo        | Solicitante                 |

### API externa (api_consumer)

| Código                    | Trigger                                 | Destinatario                            |
| ------------------------- | --------------------------------------- | --------------------------------------- |
| `api.key_issued`          | Admin emite nueva API key a consumidor  | Admin técnico de la empresa consumidora |
| `api.key_revoked`         | Admin revoca API key                    | Ídem                                    |
| `api.rate_limit_exceeded` | Consumidor supera 95% del límite diario | Admin técnico + alertas@surp.cl         |

### Digests periódicos

| Código                           | Cadencia                      | Destinatario                              |
| -------------------------------- | ----------------------------- | ----------------------------------------- |
| `digest.daily_incidents_by_zone` | Diario 07:00 America/Santiago | Supervisores por zona + patrimonial_admin |
| `digest.weekly_cases_status`     | Lunes 08:00                   | lawyer_admin                              |
| `digest.monthly_statistics`      | Día 1 de mes                  | patrimonial_admin + Dirección             |

**Usuario puede desactivar digests individualmente** en `/perfil/notificaciones`. Notificaciones marcadas mandatorias ignoran la preferencia (auth, alertas críticas, plazos procesales).

**Lista de mandatorias (no desactivables):**
`account.password_reset_request`, `account.password_changed`, `account.locked`, `account.login_new_device`, `incident.critical_created`, `case.deadline.alert` (severidad critical), `hearing.reminder.1h`, `api.rate_limit_exceeded`.

---

## Servicio y cola

```typescript
// apps/api/src/notifications/notifications.service.ts (esbozo)
@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notification-dispatch') private readonly queue: Queue,
    private readonly db: KyselyDb,
    private readonly templates: TemplatesRegistry,
  ) {}

  async send(code: NotificationCode, to: string | string[], context: object): Promise<void> {
    const recipients = Array.isArray(to) ? to : [to];
    const template = await this.templates.get(code);
    if (!template.enabled) return; // desactivada globalmente

    const jobId = randomUUID();
    await this.db
      .insertInto('notifications')
      .values({
        external_id: jobId,
        code,
        recipients_snapshot: recipients,
        context,
        status: 'queued',
      })
      .execute();

    await this.queue.add(
      'dispatch',
      { jobId, code, recipients, context },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      },
    );
  }
}
```

El processor:

1. Lee el template de BD (editable por admin — ver abajo).
2. Renderiza subject (Handlebars sobre `subject_template`) y body (MJML → HTML → minify).
3. Genera plain text fallback con `html-to-text`.
4. Llama `transport.send(...)` (driver `local` o `azure_acs`).
5. Actualiza `notifications.status = 'sent' | 'failed'` + guarda `external_message_id` retornado por ACS.
6. Registra en `audit_logs` con `source='event'`, `action='notification_sent'`.

### Tracking de delivery (Event Grid → BullMQ)

ACS emite eventos a un Event Grid Topic. Una Azure Function HTTP-triggered o un endpoint REST del SURP (`POST /webhooks/acs/email-delivery`) los recibe y publica jobs en una segunda cola `notification-delivery-tracking`. El processor de esa cola actualiza:

- `notifications.delivery_status` (`delivered`, `bounced`, `complained`, `quarantined`, `expanded_failed`).
- `notifications.delivered_at`, `bounced_at`, `engagement_opened_at`, `engagement_clicked_at`.

Esto da auditoría real de entrega — saber si el correo llegó a la casilla del destinatario, no solo si ACS aceptó el mensaje.

---

## Templates editables por el admin

Decisión: el **contenido** de los templates (MJML body, subject) **es editable por admin** desde la UI (`/admin/notifications/templates`). El **código** (trigger, destinatarios, contexto disponible) se define en código.

```sql
notification_templates (
  id BIGSERIAL PK,
  code VARCHAR(80) UNIQUE NOT NULL,         -- 'case.deadline.alert'
  subject_template TEXT NOT NULL,            -- Handlebars
  body_mjml TEXT NOT NULL,                   -- MJML con Handlebars
  plain_fallback_template TEXT,              -- opcional; si null, se genera de body
  enabled BOOLEAN DEFAULT TRUE,
  editable_by_admin BOOLEAN DEFAULT TRUE,    -- algunos (legales, compliance) no son editables
  is_mandatory BOOLEAN DEFAULT FALSE,        -- ignora preferencias del usuario
  locale VARCHAR(10) DEFAULT 'es-CL',
  available_vars JSONB,                      -- documentación de variables disponibles
  sender_address VARCHAR(120) NOT NULL,      -- 'DoNotReply@surp.cl' / 'alertas@surp.cl' / etc.
  updated_at, updated_by_id
)
```

- Seed inicial con todos los templates listos.
- La UI muestra editor MJML con preview en tiempo real + lista de variables disponibles.
- Cambios se auditan en `audit_logs`.
- Templates `editable_by_admin=false` (p.ej. emails con texto legal de datos personales) solo se cambian por despliegue.
- Variables del contexto se validan contra `available_vars`; Handlebars falla si el template referencia una variable inexistente.

---

## Respetar preferencias del usuario

Tabla `user_notification_prefs (user_id, code, channel, enabled)`:

- Para cada código de notificación, cada usuario puede activar/desactivar.
- Códigos marcados `is_mandatory=true` en `notification_templates` ignoran la preferencia.
- Digests son opt-out (default ON por rol); alertas operativas críticas son **mandatorias** y no se pueden silenciar.

---

## Auditoría

Cada envío registra en `audit_logs`:

- `source='event'`, `action='notification_sent'` (o `notification_failed`).
- `entity_table='notifications'`, `entity_external_id` del job.
- `metadata`: `{ code, recipients, acsMessageId, attemptsUsed, transport }`.

Esto permite responder "¿se envió el correo X al usuario Y?" en auditorías.

**No guardar el cuerpo final renderizado.** El template + contexto son suficientes para reconstruirlo si hace falta. Guardar el body expandido infla `audit_logs` innecesariamente y duplica datos personales (Ley 21.719).

---

## Reglas

1. **Toda notificación pasa por la cola `notification-dispatch`.** Prohibido enviar email síncrono en código de dominio.
2. **Toda notificación tiene un `code`** en el catálogo. No construir subject/body ad-hoc en servicios.
3. **Plain text fallback obligatorio**. Algunos clientes (lectores para accesibilidad, filtros corporativos) solo procesan plain text.
4. **Nunca adjuntar archivos** directo al email. Enlazar al backend con SAS.
5. **Respetar preferencias del usuario**; mandatorias solo las listadas.
6. **Managed Identity en prod, sin connection strings en código.**
7. **Monitoreo de cuota ACS**: alarma al 80% del límite del tier actual.
8. **Datos personales mínimos en el cuerpo**. Los correos viven en casillas de destinatarios — evitar RUT, dirección, coordenadas precisas. Enlazar al sistema para ver detalle con auth.
9. **Textos en español de Chile**. Los templates son parte del producto (para el usuario final).
10. **Testear con MailHog** en dev (`MAIL_DRIVER=local`). Jamás apuntar al ACS real sin `NODE_ENV=production` + autorización explícita.
11. **Verificación del dominio `surp.cl` en ACS antes del go-live.** Sin SPF/DKIM/DMARC válidos, los correos caen en spam. Coordinación con TI Arauco.
