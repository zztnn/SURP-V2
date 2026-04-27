import { useEffect, useEffectEvent } from 'react';

/**
 * Registers a window-level keydown listener that auto-cleans on unmount.
 * The handler reference is kept stable via `useEffectEvent` so callers
 * do NOT need to wrap it in useCallback.
 *
 * @param handler  Keydown event handler
 * @param enabled  Whether the listener is active (default: true)
 *
 * Policy: Rule 4 — global window keyboard listener.
 */
export function useWindowKeyDown(handler: (e: KeyboardEvent) => void, enabled = true): void {
  const onKeyDown = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (e: KeyboardEvent): void => {
      onKeyDown(e);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [enabled]);
}
