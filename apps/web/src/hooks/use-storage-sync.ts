import { useEffect } from 'react';

/**
 * Reads a value from localStorage on mount and listens for cross-tab
 * `StorageEvent` updates for the same key. Avoids hydration mismatch
 * by deferring the read to after mount.
 *
 * @param key         localStorage key
 * @param onValue     Called with the stored value on mount and on changes
 */
export function useStorageSync(key: string, onValue: (value: string) => void): void {
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) {
      onValue(stored);
    }

    const handler = (e: StorageEvent): void => {
      if (e.key === key && e.newValue) {
        onValue(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage', handler);
    };
    // onValue intentionally excluded — callers should keep it stable or use ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
