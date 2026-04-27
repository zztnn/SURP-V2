import { useEffect, useEffectEvent } from 'react';

/**
 * Attaches a listener for a custom DOM event on `window`.
 * The handler reference is kept stable via `useEffectEvent` so callers
 * do NOT need to wrap it in useCallback.
 *
 * @param eventName  Custom event name (e.g. "sidebar-search-navigate")
 * @param handler    Event handler function
 * @param enabled    Whether the listener is active (default: true)
 *
 * Policy: Rule 4 — window-level custom event subscription.
 */
export function useCustomEventListener(
  eventName: string,
  handler: (e: Event) => void,
  enabled = true,
): void {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (e: Event): void => {
      onEvent(e);
    };
    window.addEventListener(eventName, listener);
    return () => {
      window.removeEventListener(eventName, listener);
    };
  }, [eventName, enabled]);
}
