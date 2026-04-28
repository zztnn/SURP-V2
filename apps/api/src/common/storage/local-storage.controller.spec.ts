import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { BlobDownloadAuditService } from './blob-download-audit.service';
import { HmacSigner } from './hmac-signer';
import { LocalStorageAdapter, type LocalStorageConfig } from './local-storage.adapter';
import { LocalStorageController } from './local-storage.controller';
import { SURP_CONTAINERS } from './storage.types';

const SECRET = 'a'.repeat(32);

interface Fixture {
  controller: LocalStorageController;
  adapter: LocalStorageAdapter;
  signer: HmacSigner;
  audit: { recordDownload: jest.Mock };
  cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'surp-storage-ctl-'));
  const cfg: LocalStorageConfig = {
    rootDir: root,
    publicBaseUrl: 'http://localhost:3201',
  };
  const signer = new HmacSigner(SECRET);
  const adapter = new LocalStorageAdapter(cfg, signer);
  const audit = { recordDownload: jest.fn().mockResolvedValue(undefined) };
  const controller = new LocalStorageController(
    adapter,
    signer,
    audit as unknown as BlobDownloadAuditService,
  );
  return {
    controller,
    adapter,
    signer,
    audit,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function makeReq(): import('express').Request {
  return {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as unknown as import('express').Request;
}

function makeRes(): {
  res: import('express').Response;
  headers: Record<string, string>;
  sink: Buffer[];
} {
  const headers: Record<string, string> = {};
  const sink: Buffer[] = [];
  // Express response es Writable, así que el mock también lo es.
  const writable = new Writable({
    write(chunk: Buffer, _enc, cb) {
      sink.push(Buffer.from(chunk));
      cb();
    },
  });
  // Inyectamos setHeader (Express-like) sobre el Writable.
  Object.assign(writable, {
    setHeader: (k: string, v: string | number) => {
      headers[k] = String(v);
    },
    getHeader: (k: string) => headers[k],
  });
  return {
    res: writable as unknown as import('express').Response,
    headers,
    sink,
  };
}

describe('LocalStorageController', () => {
  it('rechaza request sin parámetros con ForbiddenException', async () => {
    const fix = await makeFixture();
    try {
      const r = makeRes();
      await expect(
        fix.controller.download(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await fix.cleanup();
    }
  });

  it('rechaza container desconocido', async () => {
    const fix = await makeFixture();
    try {
      const r = makeRes();
      await expect(
        fix.controller.download(
          'container-evil',
          'k',
          String(Math.floor(Date.now() / 1000) + 60),
          'sig',
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await fix.cleanup();
    }
  });

  it('rechaza firma inválida', async () => {
    const fix = await makeFixture();
    try {
      const r = makeRes();
      await expect(
        fix.controller.download(
          SURP_CONTAINERS.REPORTS,
          'incidents/abc/2026/04/uuid-foo.xlsx',
          String(Math.floor(Date.now() / 1000) + 60),
          'firma-falsa',
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await fix.cleanup();
    }
  });

  it('rechaza firma expirada', async () => {
    const fix = await makeFixture();
    try {
      const expSeconds = Math.floor(Date.now() / 1000) - 1;
      const sig = fix.signer.sign({
        container: SURP_CONTAINERS.REPORTS,
        key: 'k',
        expiresAtSeconds: expSeconds,
      });
      const r = makeRes();
      await expect(
        fix.controller.download(
          SURP_CONTAINERS.REPORTS,
          'k',
          String(expSeconds),
          sig,
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await fix.cleanup();
    }
  });

  it('rechaza exp no numérico', async () => {
    const fix = await makeFixture();
    try {
      const r = makeRes();
      await expect(
        fix.controller.download(
          SURP_CONTAINERS.REPORTS,
          'k',
          'no-es-numero',
          'sig',
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await fix.cleanup();
    }
  });

  it('responde 404 si la firma es válida pero el archivo no existe', async () => {
    const fix = await makeFixture();
    try {
      const expSeconds = Math.floor(Date.now() / 1000) + 60;
      const sig = fix.signer.sign({
        container: SURP_CONTAINERS.REPORTS,
        key: 'no/existe.xlsx',
        expiresAtSeconds: expSeconds,
      });
      const r = makeRes();
      await expect(
        fix.controller.download(
          SURP_CONTAINERS.REPORTS,
          'no/existe.xlsx',
          String(expSeconds),
          sig,
          undefined,
          makeReq(),
          r.res,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await fix.cleanup();
    }
  });

  it('sirve el archivo y setea Content-Type/Content-Length/Content-Disposition con firma válida', async () => {
    const fix = await makeFixture();
    try {
      const stored = await fix.adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'incidents',
        entityId: 'abc',
        filename: 'reporte.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from('contenido binario'),
      });
      const expSeconds = Math.floor(Date.now() / 1000) + 60;
      const sig = fix.signer.sign({
        container: SURP_CONTAINERS.REPORTS,
        key: stored.key,
        expiresAtSeconds: expSeconds,
        filename: 'reporte.xlsx',
      });
      const r = makeRes();
      await fix.controller.download(
        SURP_CONTAINERS.REPORTS,
        stored.key,
        String(expSeconds),
        sig,
        'reporte.xlsx',
        makeReq(),
        r.res,
      );
      // Esperamos a que el pipe termine de bombear el archivo.
      await new Promise((resolve) => {
        (r.res as unknown as Writable).on('finish', resolve);
      });
      expect(r.headers['Content-Type']).toContain('spreadsheetml');
      expect(r.headers['Content-Length']).toBe(String('contenido binario'.length));
      expect(r.headers['Content-Disposition']).toBe('attachment; filename="reporte.xlsx"');
      expect(r.headers['Cache-Control']).toBe('private, no-store');
      const downloaded = Buffer.concat(r.sink);
      expect(downloaded.toString()).toBe('contenido binario');
      // Audit fue invocado UNA vez (success path).
      expect(fix.audit.recordDownload).toHaveBeenCalledTimes(1);
    } finally {
      await fix.cleanup();
    }
  });
});
