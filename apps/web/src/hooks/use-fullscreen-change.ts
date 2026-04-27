import { useEffect, useEffectEvent } from 'react';

/**
 * Escucha eventos fullscreenchange del documento. El handler se mantiene
 * estable vía `useEffectEvent` así el caller no necesita memoizarlo.
 *
 * Policy: Rule 4 — document-level fullscreenchange browser event.
 */
export function useFullscreenChange(handler: (isFullscreen: boolean) => void): void {
  const onFullscreenChange = useEffectEvent(handler);

  useEffect(() => {
    const listener = (): void => {
      onFullscreenChange(document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', listener);
    return () => {
      document.removeEventListener('fullscreenchange', listener);
    };
  }, []);
}
