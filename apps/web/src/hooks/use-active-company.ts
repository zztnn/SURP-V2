'use client';

/**
 * STUB — el ERP tiene multi-empresa con selector. SURP es mono-org por
 * usuario (cada user pertenece a una sola organization). Este hook
 * retorna datos fijos del branding SURP para que el sidebar-logo del
 * ERP no necesite parchearse.
 *
 * Cuando llegue branding real de Forestal Arauco (F post-MVP), se
 * reemplaza por una lectura del `useMe()` con la organization del user.
 */
export interface ActiveCompanyView {
  id: number | null;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

const SURP_BRANDING: ActiveCompanyView = {
  id: 1,
  name: 'SURP 2.0',
  shortName: 'SURP',
  logoUrl: null,
};

export function useActiveCompany(): {
  data: ActiveCompanyView;
  isLoading: false;
} {
  return { data: SURP_BRANDING, isLoading: false };
}
