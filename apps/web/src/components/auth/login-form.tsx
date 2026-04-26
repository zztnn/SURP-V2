'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

const loginSchema = z.object({
  email: z.email('Email inválido'),
  password: z.string().min(1, 'Password requerido'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm(): ReactElement {
  const router = useRouter();
  const login = useLogin();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginFormValues): void => {
    setSubmitting(true);
    login.mutate(values, {
      onSuccess: () => {
        toast.success('Sesión iniciada');
        router.replace('/dashboard');
      },
      onError: (e) => {
        setSubmitting(false);
        const code = e instanceof ApiError ? e.code : 'UNKNOWN';
        const message =
          e instanceof ApiError && e.status === 401
            ? 'Credenciales inválidas'
            : `No se pudo iniciar sesión (${code})`;
        toast.error(message);
      },
    });
  };

  return (
    <Card className="w-full max-w-md border-white/10 bg-slate-950/80 backdrop-blur-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Shield className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl text-slate-100">SURP 2.0</CardTitle>
        <CardDescription className="text-slate-400">
          Sistema de Unidad de Resguardo Patrimonial
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-slate-200">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="usuario@arauco.com"
              className="bg-slate-900/60 text-slate-100 placeholder:text-slate-500"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-slate-200">
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="bg-slate-900/60 text-slate-100 placeholder:text-slate-500"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={submitting || login.isPending}>
            {submitting || login.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando sesión…
              </>
            ) : (
              'Iniciar sesión'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
