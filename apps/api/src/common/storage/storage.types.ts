/**
 * Catálogo de containers SURP. Cada container tiene reglas distintas de
 * retención, sensibilidad y permisos — ver
 * `apps/api/.ai-docs/standards/STORAGE.md` §"Catálogo de containers SURP".
 */
export const SURP_CONTAINERS = {
  EVIDENCE: 'surp-evidence',
  CASE_DOCS: 'surp-case-docs',
  REPORTS: 'surp-reports',
  USER_UPLOADS: 'surp-user-uploads',
  VEHICLE_CERTS: 'surp-vehicle-certs',
  PERSON_DOCS: 'surp-person-docs',
  SCAN_TEMP: 'surp-scan-temp',
  GEO_IMPORTS: 'surp-geo-imports',
} as const;

export type SurpContainer = (typeof SURP_CONTAINERS)[keyof typeof SURP_CONTAINERS];

export const ALL_SURP_CONTAINERS: readonly SurpContainer[] = Object.values(SURP_CONTAINERS);

export interface UploadInput {
  container: SurpContainer;
  /** Tipo lógico de entidad dueña — `'incidents'`, `'cases'`, `'fires'`, etc. */
  entityType: string;
  /** `external_id` (UUID) de la entidad dueña. */
  entityId: string;
  /** Nombre original del archivo, para sanitize y `Content-Disposition`. */
  filename: string;
  /** MIME real (detectado, no `Content-Type` del cliente). */
  contentType: string;
  /** Contenido del archivo. */
  body: Buffer;
}

export interface StoredBlob {
  /** Path dentro del storage — sin scheme ni dominio. */
  key: string;
  container: SurpContainer;
  size: number;
  contentType: string;
  /** SHA-256 hex. */
  hash: string;
  uploadedAt: Date;
}

export interface BlobMeta {
  container: SurpContainer;
  key: string;
  size: number;
  contentType: string;
  hash: string;
  filename: string;
  uploadedAt: Date;
}

export interface DownloadUrlOptions {
  /** Default 900 (15 min). El standard prescribe SAS efímeros. */
  expiresInSeconds?: number;
  /** Si se pasa, va en `Content-Disposition: attachment; filename="..."`. */
  filename?: string;
}
