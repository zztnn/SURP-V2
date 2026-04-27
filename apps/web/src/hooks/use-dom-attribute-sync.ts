'use client';

import { useEffect } from 'react';

/**
 * Sincroniza atributos `data-*` y/o un `style` property en
 * `document.documentElement` cuando cambia `value`. Pensado para los
 * providers que reflejan estado del store (preset de tema, zoom, etc.)
 * en el `<html>` para que `globals.css` lo consuma con selectores como
 * `:root[data-theme='X']`.
 *
 * El sync es write-only: nunca lee del DOM. No remueve atributos en
 * unmount porque el provider vive a nivel root y solo se desmonta al
 * cerrar la app — borrar el atributo causaría flash en navegación.
 *
 * Policy: Rule 4 — DOM attribute sync. El `<html>` está fuera del árbol
 * React, así que el valor no se puede derivar inline. Patrón blessed
 * para `src/providers/**`. Ver USE-EFFECT-POLICY.md.
 *
 * @param dataset  Pares `data-*` a escribir en `documentElement.dataset`.
 *                 Ej. `{ theme: 'arauco' }` → `<html data-theme='arauco'>`.
 * @param style    Opcional. Pares CSS-inline a escribir en `style`.
 *                 Usar JS camelCase (`fontSize`, no `font-size`).
 */
export function useDomAttributeSync(
  dataset: Record<string, string>,
  style?: Record<string, string>,
): void {
  // Re-suscribir solo cuando cambia algún valor del payload.
  const datasetSignature = Object.entries(dataset)
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
  const styleSignature = style
    ? Object.entries(style)
        .map(([k, v]) => `${k}=${v}`)
        .join('|')
    : '';

  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(dataset)) {
      root.dataset[key] = value;
    }
    if (style) {
      for (const [key, value] of Object.entries(style)) {
        root.style.setProperty(toKebabCase(key), value);
      }
    }
    // Las firmas serializadas son los disparadores efectivos; los
    // objetos crudos son nuevos en cada render del provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetSignature, styleSignature]);
}

function toKebabCase(camel: string): string {
  return camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
