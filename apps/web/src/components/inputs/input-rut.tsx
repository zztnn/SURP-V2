'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { useCaretSync } from '@/hooks/use-caret-sync';
import { cn } from '@/lib/utils';

// Control de ingreso de RUT chileno.
//
// Display: el usuario siempre ve el RUT formateado con puntos y guion, ej.
// "7.375.726-3". Los puntos se insertan automáticamente mientras tipea.
//
// Guion:
//  - Body ≤ 7 dígitos: el usuario tipea el guion manualmente antes del DV
//    (ej. tipea "7375726" luego "-" luego "3").
//  - Body = 8 dígitos (≥ 10M): al tipear el 9° carácter el guion se inserta
//    solo y ese carácter se toma como DV.
//
// Emisión (onChange):
//  - "" cuando el input está vacío.
//  - "<body>" mientras aún no se tipea guion ni DV (ej. "7375726").
//  - "<body>-" si se tipeó guion pero no DV (ej. "7375726-").
//  - "<body>-<dv>" cuando está completo (ej. "7375726-3", "12345678-K").
//
// El formato completo coincide con el dominio `d_rut` de PostgreSQL
// (`^[0-9]{1,8}-[0-9Kk]$`). La validación módulo 11 se hace en el schema Zod
// del form (p.ej. `z.string().refine(isValidRut, { message: "RUT inválido" })`).

interface InputRutProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ref?: React.Ref<HTMLInputElement>;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

interface ParsedRut {
  /** Dígitos del body (máx 8, sin puntos ni guion). */
  body: string;
  /** DV (0–9 o K), 0 o 1 carácter. */
  dv: string;
  /** `true` si se debe mostrar el guion en el display (user-typed o auto). */
  hyphenTyped: boolean;
}

function parseRutInput(raw: string): ParsedRut {
  const upper = raw.toUpperCase();
  const hyphenIdx = upper.indexOf('-');

  if (hyphenIdx >= 0) {
    const body = upper.slice(0, hyphenIdx).replace(/\D/g, '').slice(0, 8);
    const match = /[0-9K]/.exec(upper.slice(hyphenIdx + 1));
    const dv = match ? match[0] : '';
    return { body, dv, hyphenTyped: true };
  }

  // Si aparece "K" sin guion, se interpreta como DV (guion implícito).
  const upperFiltered = upper.replace(/[^0-9K]/g, '');
  const kIdx = upperFiltered.indexOf('K');
  if (kIdx >= 0) {
    const body = upperFiltered.slice(0, kIdx).replace(/K/g, '').slice(0, 8);
    return { body, dv: 'K', hyphenTyped: true };
  }

  // Sin guion y sin K: puros dígitos.
  const digits = upperFiltered; // sin K ya filtrada arriba sería igual
  if (digits.length > 8) {
    return {
      body: digits.slice(0, 8),
      dv: digits.charAt(8),
      hyphenTyped: true,
    };
  }

  return { body: digits, dv: '', hyphenTyped: false };
}

function insertThousandsDots(body: string): string {
  const out: string[] = [];
  const len = body.length;
  for (let i = 0; i < len; i += 1) {
    if (i > 0 && (len - i) % 3 === 0) {
      out.push('.');
    }
    out.push(body.charAt(i));
  }
  return out.join('');
}

function toDisplay(parsed: ParsedRut): string {
  const withDots = parsed.body.length > 0 ? insertThousandsDots(parsed.body) : '';
  if (!parsed.hyphenTyped) {
    return withDots;
  }
  return `${withDots}-${parsed.dv}`;
}

function toCanonical(parsed: ParsedRut): string {
  if (parsed.body.length === 0 && !parsed.hyphenTyped && parsed.dv.length === 0) {
    return '';
  }
  if (!parsed.hyphenTyped) {
    return parsed.body;
  }
  return `${parsed.body}-${parsed.dv}`;
}

function isSigChar(c: string): boolean {
  return (c >= '0' && c <= '9') || c === 'K' || c === 'k';
}

/** Cuenta dígitos + K (case-insensitive) en el prefijo indicado. */
function countSigChars(str: string): number {
  let n = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (isSigChar(str.charAt(i))) {
      n += 1;
    }
  }
  return n;
}

/**
 * Dado el display formateado y la cuenta de caracteres significativos
 * (dígitos+K) que deben quedar a la izquierda del cursor, devuelve la
 * posición del cursor. Si el carácter inmediato tras esa posición es "-",
 * avanza una posición más para mantener el cursor tras el guion cuando se
 * acaba de tipear (manual o auto-insertado).
 */
function findCaretPosition(display: string, targetSig: number): number {
  let count = 0;
  let i = 0;
  while (i < display.length && count < targetSig) {
    if (isSigChar(display.charAt(i))) {
      count += 1;
    }
    i += 1;
  }
  if (i < display.length && display.charAt(i) === '-') {
    i += 1;
  }
  return i;
}

export function InputRut({
  value,
  onChange,
  name,
  onBlur,
  className,
  placeholder = '12.345.678-9',
  disabled,
  id,
  ref,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: InputRutProps): React.JSX.Element {
  const innerRef = React.useRef<HTMLInputElement>(null);
  const pendingCaret = React.useRef<number | null>(null);

  const setRefs = (node: HTMLInputElement | null): void => {
    innerRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const display = React.useMemo(() => toDisplay(parseRutInput(value)), [value]);

  useCaretSync(innerRef, pendingCaret, display);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.currentTarget.value;
    const caretBefore = e.currentTarget.selectionStart ?? raw.length;
    const parsed = parseRutInput(raw);
    const sigBefore = countSigChars(raw.slice(0, caretBefore));
    const newDisplay = toDisplay(parsed);
    pendingCaret.current = findCaretPosition(newDisplay, sigBefore);
    onChange(toCanonical(parsed));
  };

  return (
    <Input
      ref={setRefs}
      id={id}
      name={name}
      type="text"
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      className={cn(className)}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="text"
      autoComplete="off"
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
    />
  );
}
