import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth';
import { HmacSigner } from './hmac-signer';
import { BlobNotFoundError, LocalStorageAdapter } from './local-storage.adapter';
import { isKnownContainer } from './key-naming';
import type { SurpContainer } from './storage.types';

/**
 * Controller que sirve los blobs locales bajo URLs firmadas con HMAC. Se
 * registra **solo cuando** `STORAGE_DRIVER=local` (ver `StorageModule`).
 *
 * Auth: la URL misma es la credencial (Public + HMAC + TTL — mismo modelo
 * conceptual que un SAS de Azure). El JWT global no aplica para que el
 * browser pueda redirigir directo y descargar sin overhead.
 *
 * Errores deliberadamente opacos (`Forbidden` para todo lo que no sea
 * éxito) — no se filtra si el archivo existe pero la firma falló vs si
 * el archivo no existe; ambos son `403`.
 */
@Controller('storage/local')
export class LocalStorageController {
  constructor(
    @Inject(LocalStorageAdapter) private readonly storage: LocalStorageAdapter,
    @Inject(HmacSigner) private readonly signer: HmacSigner,
  ) {}

  @Public()
  @Get()
  async download(
    @Query('container') containerRaw: string | undefined,
    @Query('key') keyRaw: string | undefined,
    @Query('exp') expRaw: string | undefined,
    @Query('sig') sigRaw: string | undefined,
    @Query('filename') filenameRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (
      containerRaw === undefined ||
      keyRaw === undefined ||
      expRaw === undefined ||
      sigRaw === undefined
    ) {
      throw new ForbiddenException();
    }

    if (!isKnownContainer(containerRaw)) {
      throw new ForbiddenException();
    }
    const container: SurpContainer = containerRaw;

    const expiresAtSeconds = Number.parseInt(expRaw, 10);
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
      throw new ForbiddenException();
    }

    const filename = filenameRaw && filenameRaw.length > 0 ? filenameRaw : undefined;

    const verify = this.signer.verify({
      container,
      key: keyRaw,
      expiresAtSeconds,
      filename,
      signature: sigRaw,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (!verify.ok) {
      throw new ForbiddenException();
    }

    let meta;
    try {
      meta = await this.storage.head(container, keyRaw);
    } catch (e) {
      if (e instanceof BlobNotFoundError) {
        throw new NotFoundException();
      }
      throw e;
    }

    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Cache-Control', 'private, no-store');
    if (filename !== undefined) {
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeForHeader(filename)}"`);
    }

    const stream = await this.storage.getStream(container, keyRaw);
    stream.pipe(res);
  }
}

/**
 * Sanitización mínima para `Content-Disposition`. Quita `"` y `\` que
 * romperían la cabecera. El nombre de archivo ya viene sanitizado por
 * `key-naming.sanitizeFilename` al subir, así que esto es defensa en
 * profundidad.
 */
function sanitizeForHeader(name: string): string {
  return name.replace(/["\\]/g, '_');
}
