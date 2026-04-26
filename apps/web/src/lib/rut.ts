// Validación y formateo de RUT chileno (módulo 11).
//
// Formato canónico interno: sin puntos, con guion antes del DV.
//   Ej.: "76543210-K"
// Formato de presentación al usuario: con puntos y guion.
//   Ej.: "76.543.210-K"
// Formato de almacenamiento en BD: canónico (sin puntos).
//
// Toda entrada de usuario y todo DTO/batch import DEBE validarse con
// `isValidRut` — la regla de negocio del sistema (solo Chile) exige RUT
// con DV correcto.

/** Quita puntos y guiones, pasa el DV a mayúscula. */
export function normalizeRut(raw: string): string {
  return raw.replace(/[.\-\s]/g, '').toUpperCase();
}

/** Separa body y DV de un RUT ya normalizado. Devuelve null si no es parseable. */
export function splitRut(normalized: string): { body: number; dv: string } | null {
  if (normalized.length < 2) {
    return null;
  }
  const bodyStr = normalized.slice(0, -1);
  const dv = normalized.slice(-1);
  if (!/^\d+$/.test(bodyStr)) {
    return null;
  }
  if (!/^[0-9K]$/.test(dv)) {
    return null;
  }
  const body = Number.parseInt(bodyStr, 10);
  if (!Number.isFinite(body) || body <= 0) {
    return null;
  }
  return { body, dv };
}

/** Calcula el dígito verificador (DV) de un body numérico usando módulo 11. */
export function calculateRutDv(body: number): string {
  let sum = 0;
  let multiplier = 2;
  let n = body;
  while (n > 0) {
    sum += (n % 10) * multiplier;
    n = Math.floor(n / 10);
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) {
    return '0';
  }
  if (remainder === 10) {
    return 'K';
  }
  return String(remainder);
}

/** True si el RUT (en cualquier formato) tiene DV correcto. */
export function isValidRut(raw: string): boolean {
  const normalized = normalizeRut(raw);
  const parts = splitRut(normalized);
  if (!parts) {
    return false;
  }
  return calculateRutDv(parts.body) === parts.dv;
}

/**
 * Inserta separadores de miles cada 3 dígitos desde la derecha. Evita el
 * lookahead con cuantificador (regla de seguridad de regex) haciendo el
 * recorrido manual sobre el string numérico.
 */
function insertThousandsDots(bodyStr: string): string {
  const out: string[] = [];
  const len = bodyStr.length;
  for (let i = 0; i < len; i += 1) {
    if (i > 0 && (len - i) % 3 === 0) {
      out.push('.');
    }
    out.push(bodyStr.charAt(i));
  }
  return out.join('');
}

/**
 * Formatea un RUT para presentación con puntos y guion.
 * Tolerante a entradas parciales (no valida DV; devuelve tal cual si no
 * tiene formato de RUT).
 *   "76543210K"    → "76.543.210-K"
 *   "1"            → "1"
 *   "123456789"    → "12.345.678-9"
 */
export function formatRut(raw: string): string {
  const normalized = normalizeRut(raw);
  if (normalized.length < 2) {
    return normalized;
  }
  const bodyStr = normalized.slice(0, -1);
  const dv = normalized.slice(-1);
  if (!/^\d+$/.test(bodyStr) || !/^[0-9K]$/.test(dv)) {
    return raw;
  }
  return `${insertThousandsDots(bodyStr)}-${dv}`;
}

/** Versión canónica (sin puntos, con guion) para persistencia. */
export function toCanonicalRut(raw: string): string {
  const normalized = normalizeRut(raw);
  if (normalized.length < 2) {
    return normalized;
  }
  const bodyStr = normalized.slice(0, -1);
  const dv = normalized.slice(-1);
  return `${bodyStr}-${dv}`;
}
