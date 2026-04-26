import { getLocaleConfig } from '@/lib/locale-config';

import type { DateSegmentOrder } from '@/lib/locale-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateSegments {
  day: string;
  month: string;
  year: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTHS_WITH_30_DAYS = new Set([4, 6, 9, 11]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a year is a leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Get the maximum day for a given month (1-12) and year. */
export function getMaxDay(month: number, year: number): number {
  if (month < 1 || month > 12) {
    return 31;
  }
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return MONTHS_WITH_30_DAYS.has(month) ? 30 : 31;
}

// ---------------------------------------------------------------------------
// Segment order helpers
// ---------------------------------------------------------------------------

/** Return the 3 segment keys in the order defined by the locale. */
export function getSegmentKeys(order: DateSegmentOrder): ('month' | 'day' | 'year')[] {
  return order === 'MDY' ? ['month', 'day', 'year'] : ['day', 'month', 'year'];
}

// ---------------------------------------------------------------------------
// ISO ↔ Segments
// ---------------------------------------------------------------------------

/** Parse an ISO date string (yyyy-MM-dd) into individual segments. */
export function isoToSegments(iso: string): DateSegments {
  if (!iso) {
    return { day: '', month: '', year: '' };
  }
  const parts = iso.split('-');
  return {
    year: parts[0] ?? '',
    month: parts[1] ?? '',
    day: parts[2] ?? '',
  };
}

/** Build an ISO date string from segments. Returns "" if incomplete. */
export function segmentsToIso(segments: DateSegments): string {
  const { day, month, year } = segments;
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
    return '';
  }
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

/** Format a Date object as "DD MMM YYYY" using the centralized locale. */
export function formatDateDisplay(date: Date): string {
  const { locale } = getLocaleConfig();
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(date);
  return `${day} ${month} ${year}`;
}

/** Parse an ISO date string (yyyy-MM-dd) as a local Date, avoiding UTC shift. */
export function parseIsoLocal(iso: string): Date | null {
  if (!iso) {
    return null;
  }
  const parts = iso.split('-');
  if (parts.length < 3) {
    return null;
  }
  const y = parseInt(parts[0] ?? '', 10);
  const m = parseInt(parts[1] ?? '', 10);
  const d = parseInt(parts[2] ?? '', 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
}

/** Format an ISO string for display, returning a fallback for empty/invalid. */
export function formatIsoForDisplay(iso: string, fallback = ''): string {
  if (!iso) {
    return fallback;
  }
  const d = parseIsoLocal(iso);
  if (!d) {
    return fallback;
  }
  return formatDateDisplay(d);
}

// ---------------------------------------------------------------------------
// Segment ↔ masked string
// ---------------------------------------------------------------------------

/** Build the masked display string from segments, e.g. "04/06/2026" or "__/__/____". */
export function segmentsToMasked(segments: DateSegments, order: DateSegmentOrder): string {
  const keys = getSegmentKeys(order);
  const parts = keys.map((key) => {
    const val = segments[key];
    if (key === 'year') {
      return val ? val.padEnd(4, '_') : '____';
    }
    return val ? val.padEnd(2, '_') : '__';
  });
  return parts.join('/');
}

/** Parse a masked string back into segments. */
export function maskedToSegments(masked: string, order: DateSegmentOrder): DateSegments {
  const parts = masked.split('/');
  const keys = getSegmentKeys(order);
  const segments: DateSegments = { day: '', month: '', year: '' };
  keys.forEach((key, i) => {
    const raw = (parts[i] ?? '').replace(/_/g, '');
    segments[key] = raw;
  });
  return segments;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate that segments form a valid date and return an error message or null. */
export function validateSegments(
  segments: DateSegments,
  minDate?: Date,
  maxDate?: Date,
): string | null {
  const { day, month, year } = segments;

  // Incomplete — not an error, just not ready
  if (!day || !month || !year || year.length < 4) {
    return null;
  }

  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);

  if (m < 1 || m > 12) {
    return 'Mes inválido';
  }

  const maxDay = getMaxDay(m, y);
  if (d < 1 || d > maxDay) {
    return 'Día inválido';
  }

  const date = new Date(y, m - 1, d);
  if (minDate && date < minDate) {
    return 'La fecha es anterior al mínimo permitido';
  }
  if (maxDate && date > maxDate) {
    return 'La fecha es posterior al máximo permitido';
  }

  return null;
}

/** Build a Date object from segments, or null if invalid/incomplete. */
export function segmentsToDate(segments: DateSegments): Date | null {
  const iso = segmentsToIso(segments);
  if (!iso) {
    return null;
  }
  const m = parseInt(segments.month, 10);
  const d = parseInt(segments.day, 10);
  const y = parseInt(segments.year, 10);
  if (m < 1 || m > 12 || d < 1 || d > getMaxDay(m, y)) {
    return null;
  }
  return new Date(y, m - 1, d);
}

/** Convert a Date to an ISO string (yyyy-MM-dd). */
export function dateToIso(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
