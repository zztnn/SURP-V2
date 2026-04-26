'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InputNumberProps {
  value: number;
  onChange: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  className?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  /** HTML autoFocus attribute */
  autoFocus?: boolean | undefined;
}

/** Derive decimal count from step: 0.01 → 2, 1 → 0, 0.000001 → 6 */
function decimalsFromStep(step: number): number {
  const str = String(step);
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}

export const InputNumber = React.forwardRef<HTMLInputElement, InputNumberProps>(
  function InputNumber(
    { value, onChange, min, max, step = 1, className, placeholder, disabled, id, autoFocus },
    ref,
  ) {
    const decimals = decimalsFromStep(step);
    const defaultPlaceholder = placeholder ?? (decimals > 0 ? (0).toFixed(decimals) : '0');

    const safeValue = typeof value === 'number' ? value : Number(value) || 0;

    const [display, setDisplay] = React.useState(() =>
      decimals > 0 ? safeValue.toFixed(decimals) : String(safeValue),
    );
    const [editing, setEditing] = React.useState(false);
    const prevValue = React.useRef(safeValue);

    if (prevValue.current !== safeValue && !editing) {
      prevValue.current = safeValue;
      setDisplay(decimals > 0 ? safeValue.toFixed(decimals) : String(safeValue));
    }

    // Max integer digits from max value (e.g., max=999999 → 6, max=999.99 → 3)
    const maxIntDigits = React.useMemo(() => {
      if (max === undefined) {
        return 15;
      }
      return String(Math.floor(max)).replace('-', '').length;
    }, [max]);

    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;

    const handleFocus = React.useCallback(() => {
      setEditing(true);
      setDisplay(safeValue === 0 ? '' : String(safeValue));
    }, [safeValue]);

    const handleBlur = React.useCallback(() => {
      setEditing(false);
      let parsed = parseFloat(display) || 0;

      if (min !== undefined && parsed < min) {
        parsed = min;
      }
      if (max !== undefined && parsed > max) {
        parsed = max;
      }

      const factor = Math.pow(10, decimals);
      parsed = Math.round(parsed * factor) / factor;

      onChangeRef.current(parsed);
      prevValue.current = parsed;
      setDisplay(decimals > 0 ? parsed.toFixed(decimals) : String(parsed));
    }, [display, min, max, decimals]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        // Block negative sign when min is non-negative
        if (min !== undefined && min >= 0 && raw.includes('-')) {
          return;
        }
        if (raw === '' || raw === '-') {
          setDisplay(raw);
          React.startTransition(() => {
            onChangeRef.current(0);
          });
          return;
        }
        if (decimals === 0) {
          if (/^-?\d*$/.test(raw)) {
            const digits = raw.replace('-', '');
            if (digits.length > maxIntDigits) {
              return;
            }
            setDisplay(raw);
            React.startTransition(() => {
              onChangeRef.current(parseInt(raw, 10) || 0);
            });
          }
          return;
        }
        if (/^-?\d*\.?\d*$/.test(raw)) {
          const dot = raw.indexOf('.');
          if (dot !== -1 && raw.length - dot - 1 > decimals) {
            return;
          }
          const intPart =
            dot === -1 ? raw.replace('-', '') : raw.slice(raw.startsWith('-') ? 1 : 0, dot);
          if (intPart.length > maxIntDigits) {
            return;
          }
          setDisplay(raw);
          React.startTransition(() => {
            onChangeRef.current(parseFloat(raw) || 0);
          });
        }
      },
      [decimals, maxIntDigits, min],
    );

    return (
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn('tabular-nums', className)}
        placeholder={defaultPlaceholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    );
  },
);
