import { ProtectedShell } from '@/components/layout/protected-shell';

import type { ReactElement, ReactNode } from 'react';

export default function ProtectedLayout({ children }: { children: ReactNode }): ReactElement {
  return <ProtectedShell>{children}</ProtectedShell>;
}
