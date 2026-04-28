import { resolve } from 'node:path';

import { Module, type DynamicModule, type Provider } from '@nestjs/common';

import { AzureBlobStorageAdapter } from './azure-blob-storage.adapter';
import { HmacSigner } from './hmac-signer';
import {
  LOCAL_STORAGE_CONFIG,
  LocalStorageAdapter,
  type LocalStorageConfig,
} from './local-storage.adapter';
import { LocalStorageController } from './local-storage.controller';
import { STORAGE } from './storage.port';

type StorageDriver = 'local' | 'azure';

/**
 * Módulo de storage. Bindea el adapter según `STORAGE_DRIVER`:
 *
 *   - `local` (default dev/test/CI): `LocalStorageAdapter` + `HmacSigner`
 *     + `LocalStorageController`. Archivos en `STORAGE_LOCAL_ROOT`
 *     (default `./storage-data`). URLs firmadas servidas por
 *     `/api/storage/local`.
 *
 *   - `azure` (staging/prod): `AzureBlobStorageAdapter` (stub hoy).
 *     **No** registra el controller local.
 *
 * Cualquier consumidor inyecta el puerto via `@Inject(STORAGE)` —
 * el dominio nunca conoce el adapter concreto.
 */
@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    const driver = (process.env['STORAGE_DRIVER'] ?? 'local') as StorageDriver;

    if (driver === 'azure') {
      return {
        module: StorageModule,
        providers: [{ provide: STORAGE, useClass: AzureBlobStorageAdapter }],
        exports: [STORAGE],
        global: true,
      };
    }

    const localProviders = buildLocalProviders();

    return {
      module: StorageModule,
      providers: localProviders,
      controllers: [LocalStorageController],
      exports: [STORAGE],
      global: true,
    };
  }
}

function buildLocalProviders(): Provider[] {
  const rootRaw = process.env['STORAGE_LOCAL_ROOT'] ?? './storage-data';
  const publicBaseUrl = process.env['STORAGE_LOCAL_PUBLIC_URL'] ?? 'http://localhost:3201';
  const secret = process.env['STORAGE_LOCAL_HMAC_SECRET'];
  if (secret === undefined || secret.length === 0) {
    throw new Error(
      'STORAGE_LOCAL_HMAC_SECRET es requerido cuando STORAGE_DRIVER=local. ' +
        'Generar con: openssl rand -hex 32',
    );
  }

  const config: LocalStorageConfig = {
    rootDir: resolve(rootRaw),
    publicBaseUrl,
  };

  return [
    { provide: LOCAL_STORAGE_CONFIG, useValue: config },
    { provide: HmacSigner, useFactory: () => new HmacSigner(secret) },
    LocalStorageAdapter,
    { provide: STORAGE, useExisting: LocalStorageAdapter },
  ];
}
