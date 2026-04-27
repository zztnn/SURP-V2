import * as React from 'react';

/**
 * Mantiene un `ref` con el último valor de `value`. Útil cuando un
 * callback async o diferido (event handler, timer, listener DOM) necesita
 * leer el valor más reciente sin convertirlo en dependencia del efecto
 * que lo instala.
 *
 * Contra el patrón "asignar en render" que React desaconseja (y el
 * linter del proyecto prohíbe), la actualización ocurre post-commit vía
 * `useEffect` encapsulado en este hook.
 *
 * Policy: Rule 4 — write-only post-commit ref sync. Prefer `useEffectEvent`
 * over this hook when you only need a stable callback identity; `useLatestRef`
 * is for the rarer case where the ref is read from a non-React closure.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = React.useRef<T>(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}
