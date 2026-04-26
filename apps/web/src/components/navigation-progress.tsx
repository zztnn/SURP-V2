'use client';

import type { ReactElement } from 'react';

/**
 * STUB minimalista — el ERP tiene un componente más sofisticado que
 * intercepta navegaciones y muestra un progress bar. Para F9 lo dejamos
 * como no-op; cuando se requiera UX más fina se porta del ERP.
 */
export function NavigationProgress(): ReactElement | null {
  return null;
}
