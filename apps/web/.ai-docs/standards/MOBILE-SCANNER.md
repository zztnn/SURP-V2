# Mobile Scanner — SURP 2.0 Frontend

> Flujo de escaneo con celular para capturar evidencia, documentos físicos
> y códigos QR / placas. Inspirado en el patrón de sesión efímera + QR de
> IGM (`/Users/jean/Projects/IGM/frontend/app/scan`).

---

## Por qué existe

El equipo URP y los guardias de empresas de seguridad operan mayoritariamente en terreno con celular. El sistema corre en desktop (oficinas y tablets robustos), pero el personal en terreno necesita:

1. **Fotografiar evidencia** de un incidente en el momento (fuga de madera, vehículo sospechoso, daño a cerca).
2. **Escanear documentos físicos** (parte de Carabineros, informe escrito a mano, guía de despacho firmada).
3. **Leer códigos QR / patentes** (código QR de parte digital, OCR de placa para consulta rápida de bloqueos).

El flujo es siempre el mismo: **el usuario inicia desde el desktop, escanea un QR con el celular, completa la captura en el celular y el resultado aparece en el desktop en tiempo real.** El celular **no requiere login** — accede vía token efímero.

---

## Qué NO hace el scanner (por diseño)

**No escanea cédulas de identidad chilenas.** Los guardias de empresas de seguridad privada (régimen OS-10 / DL 3.607) **no tienen atribución legal** para exigir, capturar ni almacenar fotografías de cédulas. Solo personal con facultades específicas (Carabineros, PDI) puede hacerlo. El modo `chilean_id` que existía conceptualmente en el diseño inicial se **eliminó** por este motivo.

Si un flujo puntual del personal URP requiere capturar una cédula en terreno con acompañamiento de autoridad (por ejemplo, en el marco de una denuncia ya formalizada), eso se diseña como módulo aparte fuera del scanner genérico — con permisos específicos, auditoría reforzada y justificación documentada. **No es MVP.**

Cuando un usuario necesita registrar el RUT de una persona identificada (sospechoso, testigo, involucrado), lo ingresa **a mano** con validación local de módulo 11. La vinculación persona↔incidente se hace con el RUT, sin necesidad de cédula física.

---

## Arquitectura de alto nivel

```
Desktop (autenticado)                     Celular (anónimo, token en URL)
─────────────────────                     ───────────────────────────────
1. click "Escanear"          ───┐
                                 │
2. POST /scan-sessions      ────┘
   ← { sessionId, token, qrPng }
3. muestra QR + SSE listener     ────────►  4. escanea QR
                                             5. abre /scan/{sessionId}?t={token}
                                             6. POST /validate
                                                (token verificado)
                                             7. usuario elige modalidad:
                                                 [Foto] [Documento] [QR]
                                             8. captura / procesa en cliente
                                             9. POST /files (incremental)
        SSE: "file-added" ◄──────────────────┘
10. desktop actualiza strip de thumbnails
                                             11. "Terminar"
                                             12. POST /complete
        SSE: "session-completed" ◄───────────┘
13. desktop asocia resultado a la entidad
    (incidente, denuncia, etc.)
```

**Componentes:**

- Backend: tabla `scan_sessions (id, external_id, token_hash, mode, entity_type, entity_id, requester_id, status, expires_at, created_at)` + tabla `scan_session_files (session_id, external_id, storage_key, kind, metadata_jsonb)`.
- Endpoints públicos con token: `POST /scan-sessions/:id/validate`, `POST /scan-sessions/:id/files`, `POST /scan-sessions/:id/complete`.
- Endpoints autenticados: `POST /scan-sessions` (desktop crea), `GET /scan-sessions/:id/events` (SSE), `POST /scan-sessions/:id/process` (desktop cierra y asocia).
- Storage temporal: container `surp-scan-temp` (ver `STORAGE.md`), purga 24h.

**TTL de sesión:** 10 minutos desde creación. Después se descarta (archivos también). Si el celular no entra en ese tiempo, se regenera.

---

## Modalidades

El usuario del celular elige qué va a capturar. Cada modalidad usa una librería distinta.

### 1. Foto de evidencia (modo `photo_evidence`)

- **Librería:** nativa `navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } })`.
- **Procesamiento cliente:** ninguno (preservar EXIF y GPS es requisito — es evidencia).
- **GPS:** `navigator.geolocation.getCurrentPosition()` al capturar → metadata anexa a la foto.
- **Upload:** JPEG tal cual, max 20 MB. HEIC (iOS) y WEBP también aceptados. Backend valida MIME real, preserva EXIF original en `surp-evidence`, extrae timestamp/GPS/device en columnas estructuradas (ver `STORAGE.md`). La versión sanitizada sin EXIF se genera solo cuando se exporta a PDF de denuncia.
- **Multi-captura:** strip de thumbnails, reordenable, borrable antes de enviar.
- **Offline-first:** si no hay señal, la foto se guarda en IndexedDB con su metadata (GPS, timestamp) y se sincroniza al volver la conexión. El incidente recibe su número correlativo **al sincronizar**, no al capturar (ver `apps/api/.ai-docs/standards/INCIDENT-CODE.md`).
- **Flash:** toggle on/off (`track.applyConstraints({ advanced: [{ torch: true }] })` — soportado en Android, parcial iOS).

### 2. Documento físico (modo `physical_document`)

- **Librería:** **`jscanify`** (la misma que IGM). Detecta bordes del papel en tiempo real, corrige perspectiva, genera imagen rectificada.
- **Procesamiento cliente:** `jscanify.extractPaper(canvas, ...)` → imagen rectificada.
- **Procesamiento servidor:** cola `media-processing` ensambla múltiples páginas en un PDF con `pdfkit` + `sharp` (resize + grayscale opcional).
- **UX:** igual que IGM — overlay que resalta el documento detectado; usuario captura, revisa la corrección, acepta o rechaza.
- **Multi-página:** strip de páginas en orden; el PDF final se genera en backend al cerrar la sesión.
- **EXIF:** se hace strip (el documento es "generado", no evidencia fotográfica).

### 3. QR / código de barras / placa (modo `qr_or_plate`)

- **Librería:** `@zxing/browser` para QR, EAN, Code128, DataMatrix. Para **placa chilena** (`ABCD-12` o `BB-CC-12`): OCR con `tesseract.js` + validación regex de formato chileno.
- **Use case principal:** guardia en terreno escanea la placa de un camión/vehículo sospechoso → consulta directa a `/blocks/check?plate=...` → muestra "BLOQUEADO" o "OK".
- **No requiere upload** (salvo que el usuario quiera adjuntar la foto del momento). El resultado se enruta al endpoint correspondiente vía la sesión de scan.
- **Latencia:** detección continua hasta leer código válido (o hasta que el usuario cancele). Vibración al detectar (`navigator.vibrate(100)`).

---

## Seguridad del token

El celular accede a `/scan/:sessionId?t=:token` sin login. El token es lo único que autoriza uploads.

**Generación:**

- 32 bytes random (`crypto.randomBytes(32)`), base64url.
- Se persiste en BD solo su **hash SHA-256** (`token_hash`) — nunca el token en claro.
- El QR codifica la URL completa `https://app.surp.cl/scan/:sessionId?t=:token`.

**Validación:**

- El celular hace `POST /scan-sessions/:id/validate { token }` → backend compara SHA-256 del token recibido con `token_hash`.
- Comparación **timing-safe** (`crypto.timingSafeEqual`).
- Sesión expira a los 10 minutos o al marcarse `complete`.
- Límite: máximo 50 archivos por sesión (anti-abuso; alineado con el límite por informe).

**Rate limit del endpoint público:**

- 10 req/min por sessionId (contra brute-force del token).
- 50 req/min por IP.

**Revocación:** el desktop puede cancelar la sesión antes de expirar (`DELETE /scan-sessions/:id`), que setea `status='cancelled'` e invalida el token.

---

## HTTPS y permisos del navegador

- **HTTPS es obligatorio** en producción. `navigator.mediaDevices` no está disponible en HTTP (salvo `localhost`).
- En desarrollo local, usar `ngrok` / `tailscale` / IP de LAN + certificado autofirmado si se quiere probar con celular físico contra la máquina dev.
- iOS Safari requiere `facingMode: { exact: 'environment' }` para forzar cámara trasera; sin el `exact`, a veces elige la frontal.
- Pedir permisos **solo** después del click del usuario (gesture), no al cargar la página.
- **Browser target:** Chrome Android ≥ 120, Safari iOS ≥ 16. Dispositivos más viejos quedan fuera del scanner y deben reportar desde el desktop.

---

## Ruta, componente y estructura

```
apps/web/app/scan/[sessionId]/page.tsx      ← página pública (layout mínimo, sin navbar)
apps/web/components/scanner/
  scanner-shell.tsx                           ← shell con modo + strip + botones
  modes/
    photo-evidence-mode.tsx
    physical-document-mode.tsx
    qr-or-plate-mode.tsx
  hooks/
    use-camera-stream.ts                      ← gestión de MediaDevices
    use-scan-session.ts                       ← llamadas al backend + upload incremental
    use-offline-queue.ts                      ← IndexedDB queue para fotos sin señal
apps/web/lib/chilean/
  rut.ts                                       ← validación módulo 11 (compartido con formularios)
apps/web/lib/scanner/
  jscanify-wrapper.ts                          ← dynamic import + tipos
  zxing-wrapper.ts                             ← idem

apps/web/app/(protected)/incidents/[id]/
  scan-launcher-button.tsx                    ← desktop-side: genera sesión + muestra QR + SSE
```

**Todas las hojas de escaneo son client components** (`'use client'`) y se importan con `next/dynamic({ ssr: false })` — estas librerías tocan `window`, `navigator`, `document.createElement('canvas')`.

Dynamic import ejemplo (evita mandar `@zxing/browser` al bundle global):

```typescript
const QrOrPlateMode = dynamic(
  () => import('@/components/scanner/modes/qr-or-plate-mode').then(m => m.QrOrPlateMode),
  { ssr: false, loading: () => <ModeSkeleton /> }
);
```

---

## SSE (desktop ← backend)

```
GET /scan-sessions/:id/events
Content-Type: text/event-stream
```

Eventos:

- `event: file-added` → `data: { externalId, kind, thumbnailUrl, metadata }`
- `event: session-completed` → `data: { fileCount }`
- `event: session-cancelled` → `data: { reason }`
- `event: heartbeat` → cada 20s (mantener conexión viva)

El desktop hace `new EventSource('/scan-sessions/:id/events')` y actualiza el strip de thumbnails + habilita botón "Procesar" al recibir `session-completed`.

---

## Asociación con la entidad dueña

Cuando el usuario en desktop clickea "Procesar" tras completar la sesión:

```
POST /scan-sessions/:id/process
{ entityType: 'incidents', entityId: 'abc-...', kind: 'evidence' }
```

Backend:

1. Toma los archivos de `surp-scan-temp` y los **mueve** a `surp-evidence/{entityType}/{entityId}/{yyyy}/{mm}/...` (`StorageService.copy` + `delete` del temp — o `renameBlob` si el SDK lo soporta en el mismo account).
2. Inserta filas en `evidence_files` (u otra tabla según el `kind`) con el `key` final, SHA-256 y metadata.
3. Cola `media-processing` hace virus scan + generación de thumbs + EXIF extraction + validación forense.
4. Responde con la lista de adjuntos creados → el frontend los muestra en el detalle de la entidad.

**Modo `qr_or_plate`:** el procesar enruta al endpoint de destino según el contenido (bloqueo, búsqueda, etc.).

---

## Consideraciones de datos personales (Ley 21.719)

- **No capturamos cédulas chilenas.** Ver sección "Qué NO hace el scanner".
- Las **fotos de evidencia** pueden contener rostros de sospechosos, víctimas o transeúntes. Se procesan como **dato personal sensible**: container privado, acceso solo autenticado con `@AuditSensitiveRead()`, SAS corto (15 min) al descargar.
- **GPS en fotos** se mantiene — es parte de la evidencia. La ubicación de un sospechoso identificable es dato sensible pero relevante al fin de seguridad pública.
- Las **fotos exportadas a PDF de denuncia** se sanitizan (strip de EXIF), conservando el original en SURP.
- Las **sesiones expiradas sin cerrar** purgan sus archivos temporales automáticamente (cron cada 15 min + TTL 24h del container `surp-scan-temp`).
- **Audit trail** de toda descarga de foto de incidente con rostro queda en `audit_logs` (`source='sensitive_read', action='evidence_download'`).

---

## Reglas

1. **El celular nunca se loguea**. Accede por token; el token vive como SHA-256 en BD.
2. **TTL de sesión ≤ 10 min**. TTL de archivos en `surp-scan-temp` ≤ 24h.
3. **Todo componente de cámara es client component** con `next/dynamic({ ssr: false })`.
4. **Librerías pesadas** (`@zxing/browser`, `tesseract.js`, `jscanify`) cargan por modo, no al inicio.
5. **HTTPS obligatorio** en prod. En dev, localhost o túnel.
6. **RUT se valida módulo 11** en el cliente antes de subir — se usa la misma función que el resto del frontend. El RUT se ingresa a mano, no se escanea de cédula.
7. **Foto de evidencia preserva EXIF/GPS**; documento físico hace strip.
8. **Offline-first** para fotos de evidencia (IndexedDB queue). Código correlativo se asigna al sincronizar, no al capturar.
9. **Sesión visible al usuario dueño del desktop**. Si otro usuario conoce el `sessionId` pero no el token, `/validate` rechaza.
10. **Rate limit agresivo** en endpoints públicos de la sesión.
11. **El strip de thumbnails en desktop es el feedback canónico** de que el celular está enviando. Sin SSE no hay certeza → mostrar estado de conexión.
12. **No confiar en el cliente**: el backend re-valida MIME, tamaño, contenido en el endpoint de upload.
13. **No escaneamos cédulas chilenas** — régimen OS-10 no autoriza, y los RUTs se ingresan a mano con validación local.
