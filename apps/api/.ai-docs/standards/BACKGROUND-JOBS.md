# Background Jobs — SURP 2.0 Backend

> Patrón de workers BullMQ para SURP 2.0. Inspirado en `iwarehouse-2.0`,
> adaptado al dominio URP (reportes, migración legacy, emails, procesamiento de evidencia).

---

## Stack y versiones

- **BullMQ** `^5.x`
- **@nestjs/bullmq** `^11.x`
- **ioredis** `^5.x`
- Redis 7+ (local vía Docker Compose, Azure Cache for Redis en producción)

No usar `bull` (v3 legacy) ni `agenda` — toda cola nueva es BullMQ.

---

## Arquitectura: misma imagen, dos procesos

**Decisión:** una sola imagen de contenedor con bootstrap condicional vía variable de entorno. Dos Azure Container Apps (`surp-api` y `surp-worker`) comparten la imagen pero arrancan con comandos distintos.

| Proceso | Variable                      | Módulo raíz    | HTTP listener                   |
| ------- | ----------------------------- | -------------- | ------------------------------- |
| API     | `WORKER_MODE=false` (default) | `AppModule`    | Sí (`app.listen()`)             |
| Worker  | `WORKER_MODE=true`            | `WorkerModule` | No (`createApplicationContext`) |

**Razón:**

- Un `Dockerfile` único simplifica CI/CD y versionado (ambos procesos siempre en sync).
- El worker no necesita el 70% de los módulos HTTP (controllers, guards web, swagger). `WorkerModule` importa solo lo indispensable — evita arranques lentos y footprint inútil.
- Escalado horizontal independiente: más workers en batch nocturno de reportes sin tocar la API.

```typescript
// apps/api/src/main.ts (esbozo)
async function bootstrap() {
  if (process.env.WORKER_MODE === 'true') {
    const app = await NestFactory.createApplicationContext(WorkerModule);
    await app.init();
    Logger.log('Worker arrancado — sin HTTP listener', 'Bootstrap');
    return;
  }

  const app = await NestFactory.create(AppModule);
  // ... middlewares, swagger, helmet, cors
  await app.listen(port);
}
bootstrap();
```

```typescript
// apps/api/src/worker.module.ts (esbozo)
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [bullConfig, azureConfig] }),
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        connection: { url: cfg.getOrThrow('REDIS_URL') },
      }),
      inject: [ConfigService],
    }),
    // Módulos que EXPONEN processors (no controllers)
    ReportsWorkerModule,
    NotificationsWorkerModule,
    MediaProcessingWorkerModule,
    LegacyEtlWorkerModule,
  ],
})
export class WorkerModule {}
```

---

## Catálogo de colas SURP

| Nombre de cola          | Propósito                                                                     | Productor típico                                        | Consumidor (processor)                                       |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `report-generation`     | Reportes estadísticos (Excel/PDF) pedidos por usuarios URP                    | `ReportsController`                                     | `ReportsProcessor`                                           |
| `export-excel`          | Exportación tabular de listados (incidentes, causas, personas)                | cualquier módulo con `/export`                          | `ExportExcelProcessor`                                       |
| `export-pdf`            | Exportación PDF (partes policiales, informes de causa)                        | `CasesController`, `ComplaintsController`               | `ExportPdfProcessor`                                         |
| `notification-dispatch` | Emails transaccionales (cuentas, resets, alertas, digest)                     | `AuditInterceptor`, `UsersService`, handlers de dominio | `NotificationsProcessor`                                     |
| `media-processing`      | Resize/thumb/EXIF-scrub de fotos de evidencia; validación antivirus           | `EvidenceService` al subir archivo                      | `MediaProcessingProcessor`                                   |
| `legacy-etl`            | Jobs one-shot de la migración desde SURP legacy (por tabla/módulo)            | `pnpm db:migrate:legacy`                                | `LegacyEtlProcessor` (solo corre en el worker, nunca en API) |
| `geo-import`            | Ingesta de KMZ/shapefile de zonas/áreas/predios proporcionados por el cliente | `GeoImportController`                                   | `GeoImportProcessor`                                         |
| `scheduled-digest`      | Digest diario/semanal de incidentes por zona/rol (cron)                       | Scheduler interno                                       | `ScheduledDigestProcessor`                                   |

**No** meter en BullMQ: operaciones < 100 ms o que el usuario espera ver en la misma request (buscar, crear CRUD simple, leer detalle). BullMQ es para cosas que llevan segundos o bloquean si se hacen sync.

---

## Patrón de encolado (productor)

```typescript
// apps/api/src/reports/reports-jobs.service.ts
@Injectable()
export class ReportsJobsService {
  constructor(
    @InjectQueue('report-generation') private readonly queue: Queue,
    private readonly db: KyselyDb,
  ) {}

  async enqueue(dto: GenerateReportDto, requester: AuthContext): Promise<ReportJobDto> {
    const jobId = randomUUID();
    const payload: ReportJobPayload = {
      jobId,
      reportKey: dto.reportKey,
      filters: dto.filters,
      requesterId: requester.userId,
      organizationId: requester.organizationId,
      requestedAt: new Date().toISOString(),
    };

    await this.db
      .insertInto('report_jobs')
      .values({
        external_id: jobId,
        status: 'queued',
        requested_by_id: requester.userId,
        payload,
      })
      .execute();

    await this.queue.add('generate', payload, {
      jobId,
      removeOnComplete: { age: 3600 }, // 1h tras éxito
      removeOnFail: { age: 86400 }, // 24h tras fallo (debug)
      attempts: 1, // ⚠️ reportes NO idempotentes → un intento
    });

    return { externalId: jobId, status: 'queued' };
  }
}
```

Patrón clave:

- **Registro en BD antes de encolar** — la tabla `report_jobs` es fuente de verdad del estado (queued/running/done/failed/cancelled). El usuario consulta esa tabla, no BullMQ directo.
- **`jobId` explícito** (UUID) = `external_id` de la fila → cruce trivial entre Redis y Postgres.
- **`attempts: 1` para jobs no-idempotentes**. Solo subir a 2+ si el processor es idempotente (ej. `media-processing` resize, que puede reintentarse sin efectos colaterales).

---

## Patrón de processor (consumidor)

```typescript
// apps/api/src/reports/reports.processor.ts
@Processor('report-generation')
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(
    private readonly db: KyselyDb,
    private readonly storage: StorageService,
    private readonly providers: ReportProviderRegistry,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job<ReportJobPayload>): Promise<ReportJobResult> {
    const { jobId, reportKey, filters, requesterId } = job.data;
    await this.markRunning(jobId);

    const provider = this.providers.get(reportKey);
    const stream = provider.buildStream(filters);
    const totalRows = await provider.count(filters);

    let rowsDone = 0;
    const tmpPath = `/tmp/${jobId}.xlsx`;
    const writer = createExcelWriter(tmpPath, provider.columns);

    for await (const chunk of stream) {
      if (await this.wasCancelled(jobId)) {
        throw new JobCancelledError(jobId);
      }
      writer.writeChunk(chunk);
      rowsDone += chunk.length;
      await job.updateProgress({
        pct: (rowsDone / totalRows) * 100,
        rowsDone,
        rowsTotal: totalRows,
      });
    }
    await writer.close();

    // Sube al StorageService (privado, SAS emitida al descargar)
    const blob = await this.storage.upload({
      container: 'surp-reports',
      path: `${requesterId}/${jobId}.xlsx`,
      source: tmpPath,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await this.markDone(jobId, blob.key);
    return { blobKey: blob.key, rows: rowsDone };
  }

  // Cancelación cooperativa: la API escribe una clave Redis; el processor la chequea entre chunks.
  private async wasCancelled(jobId: string): Promise<boolean> {
    return (await this.redis.get(`jobs:cancel:${jobId}`)) === '1';
  }
}
```

**Patrón de cancelación** (mismo que iwarehouse-2.0):

1. API recibe `DELETE /reports/:jobId` → setea `redis.set('jobs:cancel:' + jobId, '1', 'EX', 3600)`.
2. Processor chequea la clave entre chunks y lanza `JobCancelledError`.
3. El `try/catch` del WorkerHost marca el job como `failed` con `reason='cancelled'`; la fila `report_jobs.status = 'cancelled'`.

No usar `job.remove()` desde la API — el processor puede estar procesando y deja inconsistencia.

---

## Reintentos, TTL, dead-letter

- **Reintentos por default: `attempts: 1`.** Reportes y exports son operaciones costosas no-idempotentes: rehacer con un reintento ciego gasta recursos.
- **Jobs idempotentes** (resize de foto, OCR, notificación): `attempts: 3, backoff: { type: 'exponential', delay: 5000 }`.
- **TTL en éxito:** `removeOnComplete: { age: 3600 }` (1 hora). El estado persiste en Postgres — Redis es transitorio.
- **TTL en fallo:** `removeOnFail: { age: 86400 }` (24 horas) para permitir inspección.
- **Dead-letter explícita:** tabla `failed_jobs (job_id, queue, payload, error, failed_at)` escrita desde el `OnQueueEvent('failed')`. Permite reprocesar manualmente desde el admin.

---

## Rate limit por cola

Límites por cola (configurables en env):

| Cola                    | Concurrency | Rate limit                                                     |
| ----------------------- | ----------- | -------------------------------------------------------------- |
| `report-generation`     | 2           | 30/min                                                         |
| `export-excel`          | 4           | 60/min                                                         |
| `notification-dispatch` | 8           | 100/min (debajo del límite Workspace — ver `NOTIFICATIONS.md`) |
| `media-processing`      | 4           | —                                                              |
| `legacy-etl`            | 1           | — (secuencial por diseño)                                      |
| `geo-import`            | 1           | —                                                              |

Aplicar con opciones de `Worker` al registrar el processor:

```typescript
BullModule.registerQueue({
  name: 'notification-dispatch',
  limiter: { max: 100, duration: 60_000 },
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});
```

---

## Monitoreo

**`bull-board`** montado en `/admin/queues`, protegido por `PermissionGuard('system.queues.view')`. Sin excepción — sin dashboard, las colas se vuelven invisibles.

- Access solo a roles `principal_only` con permiso `system.queues.view` (típicamente Administrador del sistema).
- Toda acción (retry, remove, pause) se audita vía `AuditService.logEvent({ action: 'queue_action', ... })`.

Además: cada processor emite métricas a Application Insights (`trackMetric('queue.report-generation.duration', ms)`).

---

## Testing

- **Unit tests de processors**: mockear dependencias (`StorageService`, `KyselyDb`), invocar `processor.process(mockJob)` directamente. No levantar Redis.
- **Integration tests de encolado**: usar `ioredis-mock` o un contenedor Redis efímero en Testcontainers.
- **No testear BullMQ en sí** — asumir que la librería funciona.

---

## Reglas

1. **Todo job persiste su estado en Postgres**. Nunca consultar el estado desde BullMQ directo — BullMQ es infra, Postgres es fuente de verdad.
2. **Los processors viven solo en el worker** — si un processor se registra en `AppModule` corre en la API (antipatrón). Validar con asserts.
3. **No encolar objetos pesados**. El payload del job debe caber en pocos KB. Pasar referencias (`blobKey`, `externalId`) y que el processor relea del storage.
4. **Nunca encolar secretos**. Los payloads se persisten en Redis en texto plano.
5. **Idempotencia explícita**. Si `attempts > 1`, el processor debe tolerar re-procesar sin duplicar efectos (upsert por `external_id`, no insert).
6. **Cancelación cooperativa**. Todo processor que procese más de 5 segundos debe chequear la clave de cancelación entre steps.
7. **Logs estructurados**. `Logger` de NestJS con `jobId` en cada línea. Nada de `console.log`.
8. **Shut down limpio**. El worker debe capturar `SIGTERM` y llamar `worker.close()` — BullMQ espera a que los jobs en vuelo terminen.
