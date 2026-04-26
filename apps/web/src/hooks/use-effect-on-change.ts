import { useEffect, useEffectEvent } from 'react';

/**
 * Runs a callback whenever a watched dependency changes.
 * The callback reference is kept stable via `useEffectEvent` so callers
 * do NOT need to wrap it in useCallback.
 *
 * Use for: resetting local state when external data/props change.
 * Prefer derived state (inline computation) when possible — only use
 * this hook when the update MUST be a state setter (e.g., form reset
 * from server data, dialog prop sync).
 *
 * @param dependency  Value to watch for changes
 * @param callback    Function to run when dependency changes
 */
export function useEffectOnChange(dependency: unknown, callback: () => void): void {
  const onChange = useEffectEvent(callback);

  useEffect(() => {
    onChange();
  }, [dependency]);
}
