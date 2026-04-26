'use client';

import { CalendarIcon, X } from 'lucide-react';
import * as React from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffectOnChange } from '@/hooks/use-effect-on-change';
import { useLatestRef } from '@/hooks/use-latest-ref';
import {
  dateToIso,
  formatIsoForDisplay,
  getMaxDay,
  getSegmentKeys,
  isoToSegments,
  segmentsToIso,
  validateSegments,
} from '@/lib/date-utils';
import { getLocaleConfig } from '@/lib/locale-config';
import { cn } from '@/lib/utils';

import type { DateSegments } from '@/lib/date-utils';
import type { DateSegmentOrder } from '@/lib/locale-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DateInputProps {
  /** ISO date string (yyyy-MM-dd) or empty string. */
  value: string;
  /** Called with ISO date string or empty string. */
  onChange: (isoDate: string) => void;
  /** Placeholder shown when empty and not editing. */
  placeholder?: string;
  /** Minimum selectable date. */
  minDate?: Date;
  /** Maximum selectable date. */
  maxDate?: Date;
  /** Prevents any interaction. */
  disabled?: boolean;
  /** Show clear button when value is present. Default: true. */
  clearable?: boolean;
  className?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Segment config
// ---------------------------------------------------------------------------

type SegmentKey = 'month' | 'day' | 'year';

interface SegmentConfig {
  key: SegmentKey;
  maxLength: number;
  placeholder: string;
}

function buildSegmentConfigs(order: DateSegmentOrder): SegmentConfig[] {
  const keys = getSegmentKeys(order);
  return keys.map((key) => ({
    key,
    maxLength: key === 'year' ? 4 : 2,
    placeholder: key === 'year' ? 'AAAA' : key === 'month' ? 'MM' : 'DD',
  }));
}

// ---------------------------------------------------------------------------
// Smart-prefix logic
// ---------------------------------------------------------------------------

/** Auto-prefix a single digit for month/day when it can't start a valid value. */
function smartPrefix(key: SegmentKey, digit: string): string {
  const d = parseInt(digit, 10);
  if (key === 'month' && d >= 2) {
    return `0${digit}`;
  }
  if (key === 'day' && d >= 4) {
    return `0${digit}`;
  }
  return digit;
}

/** Pad a segment to its full width (e.g. "1" → "01") on blur or tab. */
function padSegment(key: SegmentKey, value: string): string {
  if (!value) {
    return '';
  }
  if (key === 'year') {
    return value.padStart(4, '0');
  }
  return value.padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Clamp helpers
// ---------------------------------------------------------------------------

function clampMonth(raw: string): string {
  const n = parseInt(raw, 10);
  if (isNaN(n)) {
    return raw;
  }
  if (n > 12) {
    return '12';
  }
  if (raw.length === 2 && n < 1) {
    return '01';
  }
  return raw;
}

function clampDay(raw: string, month: string, year: string): string {
  const n = parseInt(raw, 10);
  if (isNaN(n)) {
    return raw;
  }
  const m = parseInt(month, 10) || 1;
  const y = parseInt(year, 10) || new Date().getFullYear();
  const max = getMaxDay(m, y);
  if (n > max) {
    return String(max);
  }
  if (raw.length === 2 && n < 1) {
    return '01';
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DateInput({
  value,
  onChange,
  placeholder = 'Seleccionar fecha',
  minDate,
  maxDate,
  disabled = false,
  clearable = true,
  className,
  id,
}: DateInputProps): React.JSX.Element {
  const config = getLocaleConfig();
  const order = config.dateSegmentOrder;
  const segmentConfigs = React.useMemo(() => buildSegmentConfigs(order), [order]);

  // --- State ---
  const [editing, setEditing] = React.useState(false);
  const [segments, setSegments] = React.useState<DateSegments>(() => isoToSegments(value));
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  // Refs for each segment input
  const segmentRefs = React.useRef<(HTMLInputElement | null)[]>([null, null, null]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const segmentsRef = useLatestRef(segments);

  // Keep segments in sync with external value when not editing. Runs
  // post-commit via useEffectOnChange; the in-render "storing info from
  // previous renders" variant busted the 25-render cap under Next 16.2
  // Turbopack (same class of bug as piece-validator fix, commit
  // 9f19675). Watches both `value` and `editing` so the sync also fires
  // when the user stops editing and the external value drifted.
  const [lastExternalValue, setLastExternalValue] = React.useState(value);
  useEffectOnChange(`${value}|${String(editing)}`, () => {
    if (lastExternalValue !== value && !editing) {
      setLastExternalValue(value);
      setSegments(isoToSegments(value));
    }
  });

  // Stable onChange ref
  const onChangeRef = useLatestRef(onChange);

  // --- Derived ---
  const displayText = React.useMemo(() => formatIsoForDisplay(value), [value]);

  const calendarSelected = React.useMemo(() => {
    if (!value) {
      return undefined;
    }
    const parts = value.split('-');
    const y = parseInt(parts[0] ?? '', 10);
    const m = parseInt(parts[1] ?? '', 10);
    const d = parseInt(parts[2] ?? '', 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      return undefined;
    }
    return new Date(y, m - 1, d);
  }, [value]);

  const validationError = React.useMemo(
    () => validateSegments(segments, minDate, maxDate),
    [segments, minDate, maxDate],
  );

  // --- Editing lifecycle ---
  const enterEditMode = React.useCallback(() => {
    if (disabled) {
      return;
    }
    setEditing(true);
    setSegments(isoToSegments(value));
    // Focus first segment on next tick
    requestAnimationFrame(() => {
      segmentRefs.current[0]?.focus();
      segmentRefs.current[0]?.select();
    });
  }, [disabled, value]);

  const commitAndExit = React.useCallback(() => {
    setEditing(false);
    const iso = segmentsToIso(segments);
    if (iso && !validateSegments(segments, minDate, maxDate)) {
      setLastExternalValue(iso);
      onChangeRef.current(iso);
    } else if (!segments.day && !segments.month && !segments.year) {
      // All empty — treat as cleared
      setLastExternalValue('');
      onChangeRef.current('');
    }
    // If partially filled but invalid, revert to previous value
  }, [segments, minDate, maxDate, onChangeRef]);

  // --- Segment input handler ---
  const handleSegmentChange = React.useCallback(
    (index: number, rawValue: string) => {
      const cfg = segmentConfigs[index];
      if (!cfg) {
        return;
      }
      const { key, maxLength } = cfg;

      // Only digits
      const digits = rawValue.replace(/\D/g, '');
      if (!digits && rawValue !== '') {
        return;
      }

      // Apply smart-prefix for month/day
      let processed = digits;
      if (key !== 'year' && digits.length === 1) {
        processed = smartPrefix(key, digits);
      }

      // Clamp values
      if (key === 'month') {
        processed = clampMonth(processed);
      }

      // Truncate to max length
      processed = processed.slice(0, maxLength);

      setSegments((prev) => {
        const next = { ...prev, [key]: processed };

        // Clamp day when month/year changes
        if (key !== 'day' && next.day) {
          next.day = clampDay(next.day, next.month, next.year);
        }
        if (key === 'day') {
          next.day = clampDay(processed, next.month, next.year);
        }

        return next;
      });

      // Auto-advance to next segment when this one is full
      if (processed.length >= maxLength && index < 2) {
        requestAnimationFrame(() => {
          segmentRefs.current[index + 1]?.focus();
          segmentRefs.current[index + 1]?.select();
        });
      }

      // Auto-commit when all segments are complete (last segment filled)
      if (processed.length >= maxLength && index === 2) {
        // Use setTimeout to ensure we're outside React's render cycle
        setTimeout(() => {
          const current = segmentsRef.current;
          const iso = segmentsToIso(current);
          if (iso && !validateSegments(current, minDate, maxDate)) {
            setLastExternalValue(iso);
            onChangeRef.current(iso);
          }
        }, 0);
      }
    },
    [segmentConfigs, minDate, maxDate, onChangeRef, segmentsRef],
  );

  // --- Keyboard navigation ---
  const handleSegmentKeyDown = React.useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      const cfg = segmentConfigs[index];
      if (!cfg) {
        return;
      }

      if (e.key === 'Tab') {
        // Pad the current segment before leaving
        setSegments((prev) => {
          const padded = padSegment(cfg.key, prev[cfg.key]);
          if (padded === prev[cfg.key]) {
            return prev;
          }
          const next = { ...prev, [cfg.key]: padded };
          // Re-clamp day after pad
          if (cfg.key !== 'day' && next.day) {
            next.day = clampDay(next.day, next.month, next.year);
          }
          return next;
        });

        if (!e.shiftKey && index < 2) {
          e.preventDefault();
          requestAnimationFrame(() => {
            segmentRefs.current[index + 1]?.focus();
            segmentRefs.current[index + 1]?.select();
          });
          return;
        }
        if (e.shiftKey && index > 0) {
          e.preventDefault();
          requestAnimationFrame(() => {
            segmentRefs.current[index - 1]?.focus();
            segmentRefs.current[index - 1]?.select();
          });
          return;
        }
        // If Tab on last segment (forward) or Shift+Tab on first, let it exit
        commitAndExit();
        return;
      }

      if (e.key === 'ArrowRight' && index < 2) {
        e.preventDefault();
        segmentRefs.current[index + 1]?.focus();
        segmentRefs.current[index + 1]?.select();
        return;
      }

      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        segmentRefs.current[index - 1]?.focus();
        segmentRefs.current[index - 1]?.select();
        return;
      }

      if (e.key === 'Backspace') {
        const currentVal = segments[cfg.key];
        if (!currentVal && index > 0) {
          e.preventDefault();
          segmentRefs.current[index - 1]?.focus();
          segmentRefs.current[index - 1]?.select();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSegments(isoToSegments(value));
        setEditing(false);
        containerRef.current?.blur();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        commitAndExit();
      }
    },
    [segmentConfigs, segments, commitAndExit, value],
  );

  // --- Blur detection (exit edit when focus leaves the container) ---
  const handleContainerBlur = React.useCallback(
    (e: React.FocusEvent) => {
      // Check if the new focus target is still inside the container or the calendar
      const related = e.relatedTarget as Node | null;
      if (containerRef.current?.contains(related)) {
        return;
      }
      // Don't exit if calendar is open
      if (calendarOpen) {
        return;
      }
      commitAndExit();
    },
    [commitAndExit, calendarOpen],
  );

  // --- Calendar selection ---
  const handleCalendarSelect = React.useCallback(
    (date: Date | undefined) => {
      if (date) {
        const iso = dateToIso(date);
        setLastExternalValue(iso);
        onChangeRef.current(iso);
        setSegments(isoToSegments(iso));
      }
      setCalendarOpen(false);
      setEditing(false);
    },
    [onChangeRef],
  );

  const handleTodayClick = React.useCallback(() => {
    const iso = dateToIso(new Date());
    setLastExternalValue(iso);
    onChangeRef.current(iso);
    setSegments(isoToSegments(iso));
    setCalendarOpen(false);
    setEditing(false);
  }, [onChangeRef]);

  // --- Clear ---
  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLastExternalValue('');
      onChangeRef.current('');
      setSegments({ day: '', month: '', year: '' });
      setEditing(false);
    },
    [onChangeRef],
  );

  // --- Render ---
  const hasValue = Boolean(value);

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex h-9 w-full items-center rounded-md border border-input bg-background text-sm transition-all duration-200',
        'hover:bg-muted hover:border-ring/50',
        editing && 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))]',
        disabled && 'cursor-not-allowed opacity-50',
        validationError &&
          editing &&
          'border-destructive shadow-[0_0_0_1px_hsl(var(--destructive))]',
        className,
      )}
      onBlur={handleContainerBlur}
    >
      {/* Display mode */}
      {!editing && (
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            'flex h-full flex-1 items-center truncate px-3 text-left text-sm',
            !hasValue && 'text-muted-foreground',
          )}
          onClick={enterEditMode}
        >
          {displayText || placeholder}
        </button>
      )}

      {/* Edit mode — segmented inputs */}
      {editing && (
        <div className="flex flex-1 items-center px-2">
          {segmentConfigs.map((cfg, i) => (
            <React.Fragment key={cfg.key}>
              {i > 0 && <span className="px-0.5 text-muted-foreground">/</span>}
              <input
                ref={(el) => {
                  segmentRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={segments[cfg.key]}
                placeholder={cfg.placeholder}
                className={cn(
                  'h-7 border-none bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground/50',
                  cfg.key === 'year' ? 'w-10' : 'w-6',
                )}
                maxLength={cfg.maxLength}
                onChange={(e) => {
                  handleSegmentChange(i, e.target.value);
                }}
                onKeyDown={(e) => {
                  handleSegmentKeyDown(i, e);
                }}
                onFocus={(e) => {
                  e.target.select();
                }}
                disabled={disabled}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Right-side actions */}
      <div className="flex items-center gap-0.5 pr-1.5">
        {/* Clear button */}
        {clearable && hasValue && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground',
              !editing && 'opacity-0 group-hover:opacity-100',
            )}
            onClick={handleClear}
            aria-label="Limpiar fecha"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Calendar trigger */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Abrir calendario"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={calendarSelected}
              onSelect={handleCalendarSelect}
              disabled={(date) => {
                if (minDate && date < minDate) {
                  return true;
                }
                if (maxDate && date > maxDate) {
                  return true;
                }
                return false;
              }}
              {...(calendarSelected ? { defaultMonth: calendarSelected } : {})}
              autoFocus
            />
            <div className="border-t px-3 py-2">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={handleTodayClick}
              >
                Today
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export { DateInput };
export type { DateInputProps };
