import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import type { StoragePort } from './storage.port';
import type {
  BlobMeta,
  DownloadUrlOptions,
  StoredBlob,
  SurpContainer,
  UploadInput,
} from './storage.types';

/**
 * Adapter Azure Blob Storage — staging y prod.
 *
 * **Estado:** stub. Se implementa cuando exista deploy a staging
 * (regla operativa "NO deploy a Azure" hasta tener estrategia clara —
 * ver `STORAGE.md` y memoria de proyecto). Cuando se implemente:
 *
 *   1. Agregar dep `@azure/storage-blob` (ADR previo según regla 15
 *      de `CLAUDE.md` raíz).
 *   2. Bindear vía Managed Identity en prod, connection string en
 *      dev/azurite.
 *   3. `getDownloadUrl` usa `generateBlobSASQueryParameters`.
 *   4. Misma firma que `LocalStorageAdapter` — el dominio no cambia.
 *
 * Mientras no exista impl real, este adapter throwea claro para que
 * cualquier intento accidental de levantar la API con `STORAGE_DRIVER=azure`
 * falle a tiempo y con mensaje accionable.
 */
@Injectable()
export class AzureBlobStorageAdapter implements StoragePort {
  private readonly logger = new Logger(AzureBlobStorageAdapter.name);

  constructor() {
    this.logger.warn(
      'AzureBlobStorageAdapter es un stub. Operaciones de storage van a fallar. ' +
        'Para desarrollo local usá STORAGE_DRIVER=local.',
    );
  }

  upload(_input: UploadInput): Promise<StoredBlob> {
    throw this.notImplemented();
  }

  getDownloadUrl(
    _container: SurpContainer,
    _key: string,
    _opts?: DownloadUrlOptions,
  ): Promise<string> {
    throw this.notImplemented();
  }

  getStream(_container: SurpContainer, _key: string): Promise<never> {
    throw this.notImplemented();
  }

  head(_container: SurpContainer, _key: string): Promise<BlobMeta> {
    throw this.notImplemented();
  }

  delete(_container: SurpContainer, _key: string): Promise<void> {
    throw this.notImplemented();
  }

  exists(_container: SurpContainer, _key: string): Promise<boolean> {
    throw this.notImplemented();
  }

  private notImplemented(): NotImplementedException {
    return new NotImplementedException(
      'AzureBlobStorageAdapter aún no implementado. Usar STORAGE_DRIVER=local.',
    );
  }
}
