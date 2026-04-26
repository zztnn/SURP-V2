import { Injectable } from '@nestjs/common';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import type { SessionDeviceType } from '../domain/session';
import type { DeviceDetectorPort, DeviceFingerprint } from '../ports/device-detector.port';

/**
 * Adapter de producción para `DeviceDetectorPort`. Usa `ua-parser-js`
 * (parser local de User-Agent) y `geoip-lite` (lookup local de IP →
 * ciudad/país; BD GeoLite2 viene empaquetada en `node_modules`).
 *
 * No fuga IPs ni UAs a servicios externos — todo es lookup local.
 * Cumple Ley 21.719 sin necesidad de cláusulas de transferencia
 * internacional. Ver ADR-B-022.
 */
@Injectable()
export class UaParserDeviceDetector implements DeviceDetectorPort {
  detect(userAgent: string | null, ip: string): DeviceFingerprint {
    const parsed = userAgent ? new UAParser(userAgent).getResult() : null;

    const browser = parsed?.browser.name?.trim() || null;
    const osName = parsed?.os.name?.trim() || null;
    const deviceType = mapDeviceType(parsed?.device.type, osName);
    const deviceShort = shortDevice(parsed?.device, osName);

    const location = lookupLocation(ip);
    const locationLabel = location ? formatLocationLabel(location) : null;

    const deviceLabel = composeLabel(browser, deviceShort, locationLabel);

    return { deviceLabel, deviceType, locationLabel };
  }
}

interface GeoLocation {
  city: string;
  region: string;
  country: string;
}

function lookupLocation(ip: string): GeoLocation | null {
  // IPs locales / privadas / inválidas no resuelven en geoip-lite.
  if (isLocalIp(ip)) return null;
  try {
    const r = geoip.lookup(ip);
    if (!r) return null;
    return {
      city: r.city || '',
      region: r.region || '',
      country: r.country || '',
    };
  } catch {
    // geoip-lite tira error si la BD no se cargó. No bloqueamos login.
    return null;
  }
}

function isLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '0.0.0.0' || ip === '::' || ip === '::1') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

function formatLocationLabel(loc: GeoLocation): string | null {
  const country = countryName(loc.country);
  const parts = [loc.city, country].filter((p) => p && p.length > 0);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

/**
 * Mapeo mínimo de ISO-3166 alpha-2 → nombre legible. Mayoría de
 * sesiones será CL (Chile); el resto se nombra para los casos comunes
 * y se cae al código si no está mapeado. Mantenido a propósito chico —
 * no es una librería de i18n.
 */
const COUNTRY_NAMES: Record<string, string> = {
  CL: 'Chile',
  AR: 'Argentina',
  PE: 'Perú',
  BR: 'Brasil',
  US: 'EE.UU.',
  ES: 'España',
  MX: 'México',
  CO: 'Colombia',
  UY: 'Uruguay',
  EC: 'Ecuador',
  BO: 'Bolivia',
  PY: 'Paraguay',
  VE: 'Venezuela',
};

function countryName(code: string): string {
  if (!code) return '';
  return COUNTRY_NAMES[code] ?? code;
}

function mapDeviceType(uaType: string | undefined, osName: string | null): SessionDeviceType {
  if (uaType === 'mobile') return 'mobile';
  if (uaType === 'tablet') return 'tablet';
  if (uaType === 'console' || uaType === 'smarttv' || uaType === 'wearable') return 'unknown';
  if (uaType === 'embedded') return 'unknown';
  // ua-parser deja device.type undefined para desktop. Si hay OS, asumimos desktop.
  if (osName) return 'desktop';
  return 'unknown';
}

/**
 * Etiqueta corta del dispositivo. ua-parser ya devuelve 'iPhone',
 * 'iPad', 'Pixel 7', etc. para móviles. Para desktop devuelve nada;
 * usamos el OS ('Mac' / 'Windows' / 'Linux').
 */
function shortDevice(
  device: { vendor?: string; model?: string; type?: string } | undefined,
  osName: string | null,
): string {
  if (device?.model && device.model !== 'Macintosh') {
    return device.model; // iPhone, iPad, Pixel 7, etc.
  }
  if (osName === 'Mac OS' || osName === 'macOS') return 'Mac';
  if (osName === 'Windows') return 'Windows';
  if (osName === 'iOS') return 'iPhone';
  if (osName === 'Android') return 'Android';
  if (osName) return osName;
  return 'Dispositivo desconocido';
}

function composeLabel(
  browser: string | null,
  device: string,
  location: string | null,
): string | null {
  const left = browser ? `${browser} en ${device}` : device;
  if (left === 'Dispositivo desconocido' && !location) return null;
  return location ? `${left} · ${location}` : left;
}
