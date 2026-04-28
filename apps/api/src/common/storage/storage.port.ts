import type { Readable } from 'node:stream';

import type {
  BlobMeta,
  DownloadUrlOptions,
  StoredBlob,
  SurpContainer,
  UploadInput,
} from './storage.types';

/**
 * Token DI para inyectar `StoragePort` en use cases y processors.
 *
 * Patrón hexagonal: el dominio depende del puerto, no del adapter. Cada
 * entorno bindea un adapter distinto (`LocalStorageAdapter` en dev,
 * `AzureBlobStorageAdapter` en staging/prod).
 */
export const STORAGE = Symbol('STORAGE');

/**
 * Puerto único para almacenamiento de blobs. Implementaciones:
 *   - `LocalStorageAdapter` — disco bajo `./storage-data/` con URLs firmadas
 *     por HMAC servidas desde un controller propio.
 *   - `AzureBlobStorageAdapter` — Azure Blob con SAS efímeros (Managed
 *     Identity en prod, connection string en dev/azurite).
 *
 * Contrato:
 *   - El `key` retornado nunca contiene scheme ni dominio — solo el path
 *     dentro del storage.
 *   - `getDownloadUrl` siempre retorna URL con TTL corto (15 min default).
 *     Mismo contrato local y Azure: el frontend redirige el browser y baja.
 *   - El `delete` NO es soft — el soft delete vive en la entidad dueña.
 */
export interface StoragePort {
  upload(input: UploadInput): Promise<StoredBlob>;

  getDownloadUrl(container: SurpContainer, key: string, opts?: DownloadUrlOptions): Promise<string>;

  getStream(container: SurpContainer, key: string): Promise<Readable>;

  head(container: SurpContainer, key: string): Promise<BlobMeta>;

  delete(container: SurpContainer, key: string): Promise<void>;

  exists(container: SurpContainer, key: string): Promise<boolean>;
}
