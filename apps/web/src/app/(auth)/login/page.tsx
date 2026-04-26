import { LoginBackground } from '@/components/auth/login-background';
import { LoginForm } from '@/components/auth/login-form';

import type { ReactElement } from 'react';

export default function LoginPage(): ReactElement {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <LoginBackground />
      <LoginForm />
    </main>
  );
}
