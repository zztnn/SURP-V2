import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { HmacSigner } from './hmac-signer';
import { assertSafeKey, buildStorageKey } from './key-naming';
import type { StoragePort } from './storage.port';
import type {
  BlobMeta,
  DownloadUrlOptions,
  StoredBlob,
  SurpContainer,
  UploadInput,
} from './storage.types';

export const LOCAL_STORAGE_CONFIG = Symbol('LOCAL_STORAGE_CONFIG');

export interface LocalStorageConfig {
  /** Raíz absoluta donde se guardan los containers. Ej: `/abs/path/storage-data`. */
  rootDir: string;
  /** URL base pública (con `/api`) usada para construir links firmados. */
  publicBaseUrl: string;
}

const DEFAULT_TTL_SECONDS = 15 * 60;
const META_SUFFIX = '.meta.json';

/**
 * Adapter de filesystem local — el default en `dev`/`test`/`CI`. Mismo
 * contrato que `AzureBlobStorageAdapter`: el frontend siempre recibe una
 * URL firmada con TTL corto. La firma usa HMAC (`HmacSigner`); la URL se
 * sirve a través de `LocalStorageController`.
 *
 * Estructura en disco:
 *   `{rootDir}/{container}/{entityType}/{entityId}/{yyyy}/{mm}/{uuid}-{name}.{ext}`
 *   `{rootDir}/{container}/{entityType}/{entityId}/{yyyy}/{mm}/{uuid}-{name}.{ext}.meta.json`
 *
 * El sidecar `.meta.json` guarda el mime real, el filename original, hash
 * SHA-256 y `uploadedAt` — en Azure equivale a metadata + propiedades del
 * blob. Si se pierde el sidecar, `head()` devuelve un fallback con
 * `application/octet-stream`.
 */
@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly logger = new Logger(LocalStorageAdapter.name);
  private readonly resolvedRoot: string;

  constructor(
    @Inject(LOCAL_STORAGE_CONFIG) private readonly cfg: LocalStorageConfig,
    private readonly signer: HmacSigner,
  ) {
    this.resolvedRoot = resolve(cfg.rootDir);
  }

  async upload(input: UploadInput): Promise<StoredBlob> {
    const key = buildStorageKey({
      entityType: input.entityType,
      entityId: input.entityId,
      filename: input.filename,
    });
    assertSafeKey(key);

    const fullPath = this.resolvePath(input.container, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.body);

    const hash = createHash('sha256').update(input.body).digest('hex');
    const uploadedAt = new Date();
    const meta: BlobMeta = {
      container: input.container,
      key,
      size: input.body.length,
      contentType: input.contentType,
      hash,
      filename: input.filename,
      uploadedAt,
    };
    await writeFile(`${fullPath}${META_SUFFIX}`, JSON.stringify(meta), 'utf8');

    this.logger.debug(`Subido ${input.container}/${key} (${String(input.body.length)} bytes)`);

    return {
      key,
      container: input.container,
      size: input.body.length,
      contentType: input.contentType,
      hash,
      uploadedAt,
    };
  }

  getDownloadUrl(
    container: SurpContainer,
    key: string,
    opts?: DownloadUrlOptions,
  ): Promise<string> {
    assertSafeKey(key);
    const ttl = opts?.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttl;
    const filename = opts?.filename;

    const sig = this.signer.sign({ container, key, expiresAtSeconds, filename });

    const params = new URLSearchParams({
      container,
      key,
      exp: String(expiresAtSeconds),
      sig,
    });
    if (filename !== undefined && filename.length > 0) {
      params.set('filename', filename);
    }

    const base = this.cfg.publicBaseUrl.replace(/\/+$/, '');
    return Promise.resolve(`${base}/storage/local?${params.toString()}`);
  }

  getStream(container: SurpContainer, key: string): Promise<Readable> {
    const fullPath = this.resolvePath(container, key);
    if (!existsSync(fullPath)) {
      return Promise.reject(new BlobNotFoundError(container, key));
    }
    return Promise.resolve(createReadStream(fullPath));
  }

  async head(container: SurpContainer, key: string): Promise<BlobMeta> {
    const fullPath = this.resolvePath(container, key);
    if (!existsSync(fullPath)) {
      throw new BlobNotFoundError(container, key);
    }
    const metaPath = `${fullPath}${META_SUFFIX}`;
    if (existsSync(metaPath)) {
      const raw = await readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as BlobMeta;
      // `uploadedAt` viene serializado como string en JSON.
      return { ...parsed, uploadedAt: new Date(parsed.uploadedAt) };
    }
    // Fallback: sin sidecar, devolver lo mínimo que se puede inferir.
    const st = await stat(fullPath);
    return {
      container,
      key,
      size: st.size,
      contentType: 'application/octet-stream',
      hash: '',
      filename: key.split('/').pop() ?? key,
      uploadedAt: st.mtime,
    };
  }

  async delete(container: SurpContainer, key: string): Promise<void> {
    const fullPath = this.resolvePath(container, key);
    await rm(fullPath, { force: true });
    await rm(`${fullPath}${META_SUFFIX}`, { force: true });
  }

  exists(container: SurpContainer, key: string): Promise<boolean> {
    try {
      return Promise.resolve(existsSync(this.resolvePath(container, key)));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Resuelve `{rootDir}/{container}/{key}` como path absoluto y verifica
   * que sigue dentro de `rootDir` (defensa en profundidad sobre
   * `assertSafeKey`).
   */
  private resolvePath(container: SurpContainer, key: string): string {
    assertSafeKey(key);
    const candidate = resolve(this.resolvedRoot, container, key);
    const rootWithSep = this.resolvedRoot + sep;
    if (!candidate.startsWith(rootWithSep)) {
      throw new Error(`Path traversal detectado: ${candidate} fuera de ${this.resolvedRoot}`);
    }
    return candidate;
  }
}

export class BlobNotFoundError extends Error {
  readonly container: SurpContainer;
  readonly key: string;
  constructor(container: SurpContainer, key: string) {
    super(`Blob no encontrado: ${container}/${key}`);
    this.name = 'BlobNotFoundError';
    this.container = container;
    this.key = key;
  }
}
