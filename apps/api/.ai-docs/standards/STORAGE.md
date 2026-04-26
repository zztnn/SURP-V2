# Storage — SURP 2.0 Backend

> Patrón de almacenamiento de archivos con conmutación local ↔ Azure Blob.
> Replica el `StorageService` de IGM y **no hereda** ninguno de los 7 anti-patrones
> detectados en el legacy.

---

## Contexto

El legacy SURP usa Azure Blob con 7 problemas graves (`/Users/jean/Projects/SURP/surp-legacy/SURP.WEB/Helpers/AlmacenadorArchivosAzStorage.cs`):

| #   | Anti-patrón legacy                                                        | Mitigación SURP 2.0                                                                                                   |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Account key en `appsettings.json` en texto plano                          | Azure Key Vault; Managed Identity en producción                                                                       |
| 2   | Containers con `PublicAccessType.Blob` (cualquiera con URL ve el archivo) | Containers **privados**, SAS tokens efímeros (15 min)                                                                 |
| 3   | Nombres `{GUID}.ext` sin carpetas → URLs planas predecibles               | Path estructurado `{entityType}/{entityId}/{yyyy}/{mm}/{uuid}.{ext}`                                                  |
| 4   | Sin validación MIME (solo extensión)                                      | Validación MIME real con `file-type` + whitelist por tipo de upload                                                   |
| 5   | Sin antivirus                                                             | Azure Defender for Storage habilitado + cola `media-processing` que hace el scan antes de marcar el blob como `ready` |
| 6   | Sin límite de tamaño en el backend                                        | Límite por tipo en DTO + multer config + Azure Blob content-length validado                                           |
| 7   | Sin auditoría de descargas                                                | `@AuditSensitiveRead()` en endpoints de download de evidencia (`audit_logs`)                                          |

SURP 2.0 además añade: **storage dual** — Azure Blob en producción, disco local en desarrollo. Patrón conmutable por env, tomado de IGM (`/Users/jean/Projects/IGM/backend/src/services/storage.service.ts`).

---

## Arquitectura

```
┌────────────────────────────────────────────────────────┐
│  Código de dominio                                      │
│  evidenceService.upload(...)                            │
│         │                                                │
│         ▼                                                │
│  StorageService  ◄─ interfaz única                      │
│         │                                                │
│         ▼                                                │
│  StorageProvider  ◄─ abstracción                        │
│       ╱     ╲                                            │
│      ╱       ╲                                           │
│  LocalProvider   AzureBlobProvider                      │
│  (dev/test)      (prod/staging)                         │
└────────────────────────────────────────────────────────┘
```

Selección por env:

```typescript
// apps/api/src/storage/storage.module.ts
{
  provide: STORAGE_PROVIDER,
  useFactory: (cfg: ConfigService) => {
    const driver = cfg.get<'local' | 'azure'>('STORAGE_DRIVER', 'local');
    if (driver === 'azure') return new AzureBlobStorageProvider(cfg);
    return new LocalStorageProvider(cfg);
  },
  inject: [ConfigService],
}
```

- `STORAGE_DRIVER=local` (default en dev, tests, CI): archivos en `./storage-data/`.
- `STORAGE_DRIVER=azure` (staging, prod): Azure Blob vía `@azure/storage-blob`.

**Nunca** hardcodear la decisión en código de dominio. Todo pasa por `StorageService`.

---

## Interfaz `StorageService`

```typescript
export interface StorageService {
  /** Sube un archivo. Retorna clave (no URL). */
  upload(input: UploadInput): Promise<StoredBlob>;

  /** Genera URL temporal para descarga (SAS en Azure, URL firmada local). */
  getDownloadUrl(
    key: string,
    opts?: { expiresInSeconds?: number; filename?: string },
  ): Promise<string>;

  /** Stream para descarga directa vía backend (ruta autenticada). */
  getStream(key: string): Promise<Readable>;

  /** Metadata (size, contentType, hash). */
  head(key: string): Promise<BlobMeta>;

  /** Elimina un blob. Soft delete lógico via `deleted_at` en la entidad dueña;
   *  este método es para casos reales de purga (p.ej. archivos huérfanos post-rollback). */
  delete(key: string): Promise<void>;

  /** Copia (usado en la migración legacy → SURP). */
  copy(sourceKey: string, destKey: string): Promise<StoredBlob>;
}

export interface UploadInput {
  container: SurpContainer; // enum — ver catálogo abajo
  entityType: string; // 'incidents' | 'cases' | 'fires' | ...
  entityId: string; // external_id (UUID)
  filename: string; // nombre original (para sanitize + Content-Disposition)
  contentType: string; // MIME real (detectado, no trust del cliente)
  source: Buffer | Readable | string; // buffer, stream o path local
  checksum?: string; // SHA-256 opcional (verificado en upload)
}

export interface StoredBlob {
  key: string; // 'surp-evidence/incidents/abc123/2026/04/xyz.jpg'
  container: SurpContainer;
  size: number;
  contentType: string;
  hash: string; // SHA-256
  uploadedAt: Date;
}
```

Campo `key` **nunca** contiene el dominio ni el scheme — solo la ruta dentro del storage. La URL final se resuelve al pedir `getDownloadUrl`.

---

## Catálogo de containers SURP

Containers **privados** (sin acceso público anónimo). Nombres en inglés con prefijo `surp-`:

| Container            | Entidades                                                                          | Retención                                            | Notas                                    |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `surp-evidence`      | Fotos/videos/documentos de incidentes, evidencia de denuncias, evidencia de causas | Legal (mín. 7 años, indefinida para causas abiertas) | Más sensible — lectura auditada          |
| `surp-case-docs`     | Documentos judiciales formales (formalizaciones, sentencias, oficios)              | Permanente                                           | Solo roles con `cases.documents.read`    |
| `surp-reports`       | Reportes generados (XLSX/PDF) con TTL                                              | 30 días                                              | Regenerables; se purga con cron          |
| `surp-user-uploads`  | Avatares, firmas escaneadas de funcionarios                                        | Mientras usuario activo                              | Bajo volumen                             |
| `surp-vehicle-certs` | Certificados de vehículos, docs de desbloqueo (MAAT)                               | 7 años                                               | Hereda de legacy `surpcert`/`surpunlock` |
| `surp-person-docs`   | Documentos de personas (carnets escaneados, cartas)                                | 7 años                                               | Dato personal → cifrado en reposo        |
| `surp-scan-temp`     | Archivos en vuelo del flujo de escaneo móvil (ver `MOBILE-SCANNER.md`)             | 24 horas                                             | Purga agresiva vía cron                  |
| `surp-geo-imports`   | KMZ/shapefiles subidos para ingesta de zonas/áreas/predios                         | 90 días tras proceso                                 | Archivos fuente del cliente              |

**Correspondencia con containers legacy** (para migración):

| Legacy                      | SURP 2.0                                                  | Transformación                 |
| --------------------------- | --------------------------------------------------------- | ------------------------------ |
| `surpfotos`, `surpfotosext` | `surp-evidence` (path `incidents/{id}/...`)               | Re-namespace                   |
| `surpevidencias`            | `surp-evidence` (path `cases/{id}/...`)                   | Re-namespace                   |
| `surdocs`                   | `surp-person-docs` o `surp-evidence` según entidad origen | Decidir en ETL por tabla dueña |
| `surpcert`                  | `surp-vehicle-certs`                                      | Directo                        |
| `surpunlock`                | `surp-vehicle-certs` (subcarpeta `unlock/`)               | Subcarpeta                     |
| `surpguias`                 | `surp-evidence` (path `complaints/{id}/guides/`)          | Re-namespace                   |

El ETL legacy copia cada blob con `StorageService.copy(legacyKey, newKey)` y actualiza la referencia en la entidad nueva. Ver `DATA-MIGRATION.md`.

---

## Esquema de naming

```
{container}/{entity_type}/{entity_external_id}/{yyyy}/{mm}/{random_uuid}.{ext}
```

Ejemplo:

```
surp-evidence/incidents/9f2a1c04-e5b8-4d7d-9a5b-2c1f0f0e3b11/2026/04/
  8a93-evidence-cam-01.jpg
```

**Reglas:**

- El path incluye año/mes para facilitar navegación manual en caso de auditoría operativa.
- `random_uuid` va primero en el filename para evitar colisiones. Se preserva el nombre original sanitizado como sufijo (para Content-Disposition al descargar).
- **Nunca** exponer el `key` al frontend. El frontend ve `externalId` del adjunto; la API resuelve `key` internamente.
- **Nunca** GUID plano sin carpeta (el antipatrón legacy). Si alguien ve una URL SAS, no debe poder enumerar.

Función de sanitización (misma lógica IGM):

- `ñ → n`, quitar tildes, `[^\w.-]` → `_`, máximo 100 chars de base + 10 de extensión.

---

## Validación de uploads

**Pipeline obligatorio para todo upload:**

```
Cliente envía → multer (tamaño máx por ruta) →
  detección MIME real (file-type) →
    whitelist MIME por contexto →
      sanitize filename →
        compute SHA-256 →
          StorageService.upload →
            enqueue media-processing (virus scan + metadata strip)
```

### Límites y whitelist por contexto

| Contexto                            | Tamaño máx | MIMEs permitidos                                                                              |
| ----------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| Evidencia foto (incidente/denuncia) | 15 MB      | `image/jpeg`, `image/png`, `image/heic`, `image/webp`                                         |
| Evidencia video                     | 200 MB     | `video/mp4`, `video/quicktime`                                                                |
| Documento escaneado                 | 30 MB      | `application/pdf`, `image/jpeg`, `image/png`                                                  |
| Documento de causa                  | 30 MB      | `application/pdf`                                                                             |
| Avatar/firma usuario                | 2 MB       | `image/jpeg`, `image/png`, `image/webp`                                                       |
| KMZ/Shapefile (geo-import)          | 100 MB     | `application/vnd.google-earth.kmz`, `application/zip`, `application/vnd.google-earth.kml+xml` |

### Detección MIME real, no confiar en `Content-Type`

```typescript
import { fileTypeFromBuffer } from 'file-type';

const detected = await fileTypeFromBuffer(buffer.subarray(0, 4100));
if (!detected || !allowedMimes.includes(detected.mime)) {
  throw new BadRequestException('Tipo de archivo no permitido.');
}
```

El `Content-Type` del cliente es trivial de falsificar. `file-type` lee el magic number real del archivo.

### Metadata strip (EXIF, GPS)

Para **fotos de evidencia**: conservamos EXIF (timestamp, device, GPS) porque **es evidencia**. Guardarlo en columnas estructuradas de la fila de adjunto (`evidence_photos.exif_datetime`, `exif_lat`, `exif_lng`, `exif_device`).

Para **avatares, firmas, documentos de apoyo**: **strip completo** de EXIF con `sharp()` o `exiftool`. Un avatar no debe filtrar coordenadas del funcionario.

Decisión por contexto en la cola `media-processing`.

### Virus scan

- Azure Defender for Storage escanea automáticamente al subir (Azure nativo).
- Adicionalmente, en local y como segunda capa en prod: processor `media-processing` descarga el blob, ejecuta `clamav` (contenedor sidecar), marca `evidence_files.scan_status = 'clean'|'infected'`.
- Un archivo `infected` se mueve a `surp-quarantine` y se dispara alerta por email al admin del sistema.
- El frontend nunca descarga un archivo con `scan_status != 'clean'`. La URL SAS no se genera hasta confirmación.

---

## Descargas: SAS tokens, no blobs públicos

Endpoint de descarga:

```
GET /incidents/:externalId/evidence/:evidenceExternalId/download
```

Pipeline:

1. `PermissionGuard('incidents.evidence.read')`.
2. `OrganizationScopeGuard` — verifica que la `security_provider` tenga la zona asignada, o que el usuario sea del `principal`.
3. Resuelve `key` desde `evidence_files`.
4. `StorageService.getDownloadUrl(key, { expiresInSeconds: 900, filename: originalName })` → genera SAS 15 min.
5. `@AuditSensitiveRead({ entity: 'evidence', action: 'download' })` registra el acceso.
6. Responde `302` a la URL SAS, **o** streamea directo desde backend si el archivo es pequeño y preferimos no exponer SAS.

**Opciones de SAS:**

- `BlobSASPermissions.parse('r')` — solo lectura.
- `expiresOn` — 15 minutos máximo.
- `contentDisposition` — forzar descarga con nombre original sanitizado.
- `protocol: SASProtocol.Https` — nunca HTTP.
- Restricción de IP opcional para exports muy sensibles.

No cachear la URL SAS en el frontend (cada click llama al endpoint de nuevo).

---

## Provider: Azure Blob

```typescript
// apps/api/src/storage/providers/azure-blob.provider.ts (esbozo)
@Injectable()
export class AzureBlobStorageProvider implements StorageProvider {
  private readonly client: BlobServiceClient;

  constructor(cfg: ConfigService) {
    const accountUrl = cfg.getOrThrow<string>('AZURE_STORAGE_ACCOUNT_URL');
    // Managed Identity en prod; DefaultAzureCredential resuelve en orden:
    // env vars → Managed Identity → Azure CLI → VS Code
    this.client = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
  }

  async upload(input: UploadInput): Promise<StoredBlob> {
    const key = this.buildKey(input);
    const container = this.client.getContainerClient(input.container);
    const blob = container.getBlockBlobClient(key);
    const buf = await this.materialize(input.source);
    const hash = createHash('sha256').update(buf).digest('hex');
    await blob.uploadData(buf, {
      blobHTTPHeaders: { blobContentType: input.contentType },
      metadata: { entityType: input.entityType, entityId: input.entityId, sha256: hash },
    });
    return {
      key,
      container: input.container,
      size: buf.length,
      contentType: input.contentType,
      hash,
      uploadedAt: new Date(),
    };
  }

  async getDownloadUrl(key: string, opts?): Promise<string> {
    const [containerName, ...pathParts] = key.split('/');
    const container = this.client.getContainerClient(containerName);
    const blob = container.getBlobClient(pathParts.join('/'));
    const sasOptions: BlobGenerateSasUrlOptions = {
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + (opts?.expiresInSeconds ?? 900) * 1000),
      protocol: SASProtocol.Https,
      contentDisposition: opts?.filename ? `attachment; filename="${opts.filename}"` : undefined,
    };
    return blob.generateSasUrl(sasOptions);
  }
  // ... head, getStream, delete, copy
}
```

**Autenticación:** en producción, **Managed Identity** de Azure Container Apps. Nunca connection string con account key en variables de entorno. En staging se puede aceptar connection string vía Key Vault; en dev local se usa LocalStorageProvider.

---

## Provider: local

```typescript
// apps/api/src/storage/providers/local.provider.ts (esbozo)
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(cfg: ConfigService) {
    this.root = cfg.get('LOCAL_STORAGE_ROOT', './storage-data');
    this.publicBaseUrl = cfg.get('LOCAL_STORAGE_BASE_URL', 'http://localhost:4000/storage');
  }

  async upload(input): Promise<StoredBlob> {
    const key = this.buildKey(input);
    const fullPath = path.join(this.root, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, await this.materialize(input.source));
    // ... hash, return StoredBlob
  }

  async getDownloadUrl(key: string, opts?): Promise<string> {
    // Firma HMAC local con expiración — imita SAS
    const expires = Math.floor(Date.now() / 1000) + (opts?.expiresInSeconds ?? 900);
    const sig = hmacSha256(`${key}:${expires}`, process.env.LOCAL_STORAGE_SIGNING_KEY!);
    return `${this.publicBaseUrl}/${key}?exp=${expires}&sig=${sig}`;
  }
}
```

**Ruta pública del backend** (`GET /storage/*`) valida la firma HMAC antes de streamear el archivo. No se sirve estático directo — queremos el mismo contrato que SAS (URL expira).

- `LOCAL_STORAGE_ROOT` por default `./storage-data/` (relativo al cwd del proceso). Está en `.gitignore`.
- `LOCAL_STORAGE_SIGNING_KEY` en `.env` local — arbitraria para dev.
- Subfolders replican el esquema `{container}/{path}`.

---

## Azurite (emulador Azure) en desarrollo

Alternativa a `LocalStorageProvider`: **Azurite** (emulador oficial Azure Storage) vía Docker Compose. Mismo SDK `@azure/storage-blob` que en prod → paridad ~100%.

```yaml
# docker-compose.yml
azurite:
  image: mcr.microsoft.com/azure-storage/azurite:latest
  ports: ['10000:10000', '10001:10001', '10002:10002']
  volumes: ['azurite-data:/data']
  command: azurite-blob --blobHost 0.0.0.0 --loose
```

Con Azurite se usa `STORAGE_DRIVER=azure` + `AZURE_STORAGE_ACCOUNT_URL=http://127.0.0.1:10000/devstoreaccount1` + credenciales de desarrollo bien conocidas del emulador. Útil para probar SAS antes de desplegar.

**Recomendación:** `local` para la mayoría del desarrollo (simple, sin docker-compose corriendo el emulador); `azure+azurite` cuando se prueba específicamente el comportamiento SAS/managed identity.

---

## Reglas

1. **Nunca** exponer URLs directas de Azure Blob sin SAS. Containers privados, siempre.
2. **Nunca** confiar en `Content-Type` del cliente. Detección MIME real con `file-type`.
3. **Nunca** guardar archivos en la base de datos. Ni siquiera avatares.
4. **Siempre** validar MIME, tamaño y magic number antes de subir.
5. **Siempre** auditar descarga de evidencia (`@AuditSensitiveRead`).
6. **Siempre** pasar por el virus scan antes de marcar el archivo como `ready`. Archivos `pending_scan` no se pueden descargar.
7. **EXIF de evidencia se preserva** como dato estructurado; EXIF de avatares/firmas se remueve.
8. **Key es interno**, nunca se expone al frontend. El frontend habla en `externalId` de la entidad de adjunto.
9. **SAS máximo 15 minutos**; cada download llama al endpoint de nuevo.
10. **Migración legacy**: `copy(legacyKey, newKey)` preserva hash; filas huérfanas quedan con `file_missing=true` y se reportan.
