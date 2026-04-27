'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that updates `delay` ms after the
 * last change. Cleans up pending timers on unmount or when `value` changes.
 *
 * Policy: exception — debounce timer. Rule 1 (derive inline) does not apply
 * because debouncing is intrinsically time-based; the next value cannot be
 * derived synchronously from the current one.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
