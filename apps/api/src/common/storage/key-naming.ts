import { randomUUID } from 'node:crypto';
import { extname, basename } from 'node:path';

import { ALL_SURP_CONTAINERS, type SurpContainer } from './storage.types';

/**
 * Sanitiza el nombre de archivo. Misma lógica usada en IGM:
 *   - `ñ → n`, quitar tildes, `[^\w.-]` → `_`
 *   - colapsa `_+` a `_`, trim de `_` en bordes
 *   - max 100 chars de base + 10 de extensión
 */
export function sanitizeFilename(name: string): string {
  const ext = extname(name);
  const base = basename(name, ext);
  const sanitizedBase = base
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
  const sanitizedExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
  return sanitizedBase ? `${sanitizedBase}${sanitizedExt}` : `archivo${sanitizedExt}`;
}

interface BuildKeyInput {
  entityType: string;
  entityId: string;
  filename: string;
  /** Inyectable para tests. Default: `new Date()`. */
  now?: Date;
}

/**
 * Construye el `key` (path dentro del container) según el schema canónico:
 *
 *   `{entityType}/{entityId}/{yyyy}/{mm}/{uuid}-{sanitizedFilename}`
 *
 * Reglas — ver `STORAGE.md` §"Esquema de naming":
 *   - El UUID va primero en el filename para evitar colisiones.
 *   - El nombre original sanitizado se preserva como sufijo (Content-
 *     Disposition al descargar).
 *   - Año/mes facilitan navegación manual en auditoría.
 *   - **Nunca** GUID plano sin carpeta — anti-patrón legacy.
 */
export function buildStorageKey(input: BuildKeyInput): string {
  const { entityType, entityId, filename } = input;
  const now = input.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = randomUUID();
  const safeName = sanitizeFilename(filename);
  return `${entityType}/${entityId}/${yyyy}/${mm}/${uuid}-${safeName}`;
}

/**
 * Verifica que un container es uno del catálogo conocido. Usado en validación
 * de endpoints públicos (download firmado) para evitar que un atacante con
 * URL firmada apunte a un container fuera del whitelist.
 */
export function isKnownContainer(value: unknown): value is SurpContainer {
  return typeof value === 'string' && (ALL_SURP_CONTAINERS as readonly string[]).includes(value);
}

/**
 * Valida que un `key` es seguro: sin `..`, sin null bytes, sin barras
 * invertidas, sin path absolutos. Lanza si es inseguro — el caller no
 * recupera el path.
 */
export function assertSafeKey(key: string): void {
  if (key.length === 0) {
    throw new Error('Storage key vacío');
  }
  if (key.length > 512) {
    throw new Error('Storage key excede 512 caracteres');
  }
  if (key.includes('\0')) {
    throw new Error('Storage key contiene null bytes');
  }
  if (key.includes('\\')) {
    throw new Error('Storage key contiene barras invertidas');
  }
  if (key.startsWith('/')) {
    throw new Error('Storage key no puede empezar con /');
  }
  // Path traversal: cualquier segmento `..` rechazado.
  const segments = key.split('/');
  for (const s of segments) {
    if (s === '..' || s === '.') {
      throw new Error(`Storage key contiene segmento inválido: "${s}"`);
    }
    if (s.length === 0) {
      throw new Error('Storage key contiene segmento vacío (// consecutivos)');
    }
  }
}
