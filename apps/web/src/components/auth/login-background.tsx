'use client';

import type { ReactElement } from 'react';

/**
 * Background del login. El ERP rota fotos de obras de construcción;
 * para SURP MVP usamos un gradient con textura sutil mientras llegan
 * fotos oficiales de operación URP / patrimonio Arauco. Cuando lleguen
 * se reemplaza por un componente con `useImagePreload` y crossfade.
 */
export function LoginBackground(): ReactElement {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.4) 0%, transparent 50%),
                            radial-gradient(circle at 80% 60%, rgba(16, 185, 129, 0.3) 0%, transparent 50%),
                            radial-gradient(circle at 50% 90%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
