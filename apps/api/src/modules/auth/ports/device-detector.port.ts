import type { SessionDeviceType } from '../domain/session';

export const DEVICE_DETECTOR = Symbol('DEVICE_DETECTOR');

/**
 * Detecta tipo de dispositivo + ubicación a partir del User-Agent + IP.
 *
 * - User-Agent: parser local (ua-parser-js) → browser/os/device.
 * - IP: lookup local con base de datos GeoLite2 empaquetada en el
 *   package `geoip-lite` (sin terceros, sin transferencia internacional).
 *
 * Ver ADR-B-022 para el rationale (Ley 21.719 + zero setup operativo).
 *
 * Implementaciones:
 *   - `UaParserDeviceDetector` (prod) — ua-parser-js + geoip-lite.
 *   - `StubDeviceDetector` (tests) — fingerprint fijo.
 */
export interface DeviceDetectorPort {
  detect(userAgent: string | null, ip: string): DeviceFingerprint;
}

export interface DeviceFingerprint {
  /**
   * Etiqueta lista para mostrar en `/settings/seguridad`.
   * Ejemplos: "Chrome en Mac · Concepción, Chile",
   *           "Safari en iPhone · Santiago, Chile",
   *           "Edge en Windows" (sin ubicación si IP es local/desconocida).
   * NULL si no se pudo armar (UA vacío + IP local).
   */
  deviceLabel: string | null;
  deviceType: SessionDeviceType;
  /** Solo la ubicación: "Concepción, Bío-Bío, Chile". NULL si geo-IP falló. */
  locationLabel: string | null;
}
