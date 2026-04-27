'use client';

import { type RefObject, useLayoutEffect } from 'react';

/**
 * Sincroniza la posición del caret en un input controlado tras cada commit
 * que cambia `dep`. Pensado para inputs con máscara/formato (RUT, fecha,
 * moneda) donde el re-render con el valor reformateado reposiciona el cursor
 * al final.
 *
 * El caller setea `pendingCaretRef.current = N` justo antes de llamar
 * `onChange`. Este hook corre con `useLayoutEffect` (sincrónico tras mutar el
 * DOM, antes del paint) para evitar flicker del cursor.
 *
 * Policy: Rule 4 — DOM caret position sync via `useLayoutEffect`. This is
 * the ONLY blessed use of `useLayoutEffect` in the codebase: it must run
 * post-mutation but pre-paint, so a regular `useEffect` would flicker.
 */
export function useCaretSync(
  inputRef: RefObject<HTMLInputElement | null>,
  pendingCaretRef: RefObject<number | null>,
  dep: unknown,
): void {
  useLayoutEffect(
    () => {
      if (pendingCaretRef.current === null || !inputRef.current) {
        return;
      }
      const pos = pendingCaretRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCaretRef.current = null;
    },
    // Los refs son estables por diseño; sólo queremos disparar en `dep`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dep],
  );
}
