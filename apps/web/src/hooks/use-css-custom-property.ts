import { useEffect } from 'react';

/**
 * Sets a CSS custom property on `document.documentElement` and keeps it
 * in sync with the provided value. Removes the property on unmount.
 *
 * @param name   CSS custom property name (e.g. "--sidebar-offset")
 * @param value  Property value (e.g. "260px")
 *
 * Policy: Rule 4 — DOM custom-property sync (the `<html>` element lives
 * outside the React tree, so the value cannot be derived inline).
 */
export function useCssCustomProperty(name: string, value: string): void {
  useEffect(() => {
    document.documentElement.style.setProperty(name, value);
    return () => {
      document.documentElement.style.removeProperty(name);
    };
  }, [name, value]);
}
