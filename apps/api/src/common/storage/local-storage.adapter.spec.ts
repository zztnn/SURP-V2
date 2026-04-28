import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HmacSigner } from './hmac-signer';
import {
  BlobNotFoundError,
  LocalStorageAdapter,
  type LocalStorageConfig,
} from './local-storage.adapter';
import { SURP_CONTAINERS } from './storage.types';

const SECRET = 'a'.repeat(32);

async function makeAdapter(): Promise<{
  adapter: LocalStorageAdapter;
  cfg: LocalStorageConfig;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'surp-storage-'));
  const cfg: LocalStorageConfig = {
    rootDir: root,
    publicBaseUrl: 'http://localhost:3201',
  };
  const adapter = new LocalStorageAdapter(cfg, new HmacSigner(SECRET));
  return {
    adapter,
    cfg,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

describe('LocalStorageAdapter', () => {
  it('upload + head + getStream funcionan round-trip', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      const body = Buffer.from('hola mundo');
      const stored = await adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'incidents',
        entityId: 'abc',
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body,
      });

      expect(stored.size).toBe(body.length);
      expect(stored.container).toBe(SURP_CONTAINERS.REPORTS);
      expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);

      const meta = await adapter.head(SURP_CONTAINERS.REPORTS, stored.key);
      expect(meta.size).toBe(body.length);
      expect(meta.contentType).toContain('spreadsheetml');
      expect(meta.filename).toBe('test.xlsx');

      const stream = await adapter.getStream(SURP_CONTAINERS.REPORTS, stored.key);
      const downloaded = await streamToBuffer(stream);
      expect(downloaded.equals(body)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('exists devuelve true para blobs subidos, false en otro caso', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      const stored = await adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'incidents',
        entityId: 'abc',
        filename: 'a.txt',
        contentType: 'text/plain',
        body: Buffer.from('x'),
      });
      expect(await adapter.exists(SURP_CONTAINERS.REPORTS, stored.key)).toBe(true);
      expect(await adapter.exists(SURP_CONTAINERS.REPORTS, 'no/existe.txt')).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('delete remueve blob + sidecar', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      const stored = await adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'incidents',
        entityId: 'abc',
        filename: 'a.txt',
        contentType: 'text/plain',
        body: Buffer.from('x'),
      });
      await adapter.delete(SURP_CONTAINERS.REPORTS, stored.key);
      expect(await adapter.exists(SURP_CONTAINERS.REPORTS, stored.key)).toBe(false);
      await expect(adapter.head(SURP_CONTAINERS.REPORTS, stored.key)).rejects.toBeInstanceOf(
        BlobNotFoundError,
      );
    } finally {
      await cleanup();
    }
  });

  it('getDownloadUrl devuelve URL firmada con exp + sig', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      const stored = await adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'incidents',
        entityId: 'abc',
        filename: 'a.txt',
        contentType: 'text/plain',
        body: Buffer.from('x'),
      });
      const url = await adapter.getDownloadUrl(SURP_CONTAINERS.REPORTS, stored.key, {
        expiresInSeconds: 60,
        filename: 'descarga.txt',
      });

      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/storage/local');
      expect(parsed.searchParams.get('container')).toBe(SURP_CONTAINERS.REPORTS);
      expect(parsed.searchParams.get('key')).toBe(stored.key);
      expect(parsed.searchParams.get('filename')).toBe('descarga.txt');
      expect(parsed.searchParams.get('sig')).toMatch(/.+/);
      const exp = Number.parseInt(parsed.searchParams.get('exp') ?? '', 10);
      expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    } finally {
      await cleanup();
    }
  });

  it('getStream lanza BlobNotFoundError si no existe', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      await expect(
        adapter.getStream(SURP_CONTAINERS.REPORTS, 'no/existe.txt'),
      ).rejects.toBeInstanceOf(BlobNotFoundError);
    } finally {
      await cleanup();
    }
  });

  it('rechaza keys con path traversal en cualquier operación', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      await expect(
        adapter.exists(SURP_CONTAINERS.REPORTS, '../../../etc/passwd'),
      ).rejects.toThrow();
      await expect(adapter.head(SURP_CONTAINERS.REPORTS, '../../../etc/passwd')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('hash SHA-256 se calcula correctamente', async () => {
    const { adapter, cleanup } = await makeAdapter();
    try {
      // SHA-256 de "hola" = b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79
      const stored = await adapter.upload({
        container: SURP_CONTAINERS.REPORTS,
        entityType: 'i',
        entityId: 'x',
        filename: 'a.txt',
        contentType: 'text/plain',
        body: Buffer.from('hola'),
      });
      expect(stored.hash).toBe('b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79');
    } finally {
      await cleanup();
    }
  });
});
