import type { ReactElement, ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  return <div className="relative min-h-screen">{children}</div>;
}
