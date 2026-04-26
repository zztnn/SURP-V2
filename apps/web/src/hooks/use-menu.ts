'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { filterMenuByPermissions } from '@/config/menu';
import { useMe } from '@/hooks/use-auth';

import type { MenuTree } from '@/types/menu';

/**
 * Resuelve el árbol del menú filtrando el catálogo estático
 * (`config/menu.ts`) según los permisos efectivos del user actual.
 *
 * El sidebar consume este hook como si viniera de un endpoint del
 * backend (manteniendo la API del ERP). Como el filtrado es síncrono
 * y derivado de `useMe()`, lo envolvemos en un `useMemo` y lo
 * devolvemos como `UseQueryResult` para no parchear el sidebar.
 */
export function useMenu(): UseQueryResult<MenuTree> {
  const me = useMe();
  const tree = useMemo(() => {
    if (!me.data) {
      return { nodes: [], favorites: [] };
    }
    return filterMenuByPermissions(me.data.permissions);
  }, [me.data]);

  return useQuery<MenuTree>({
    queryKey: ['menu', 'resolve', me.data?.id ?? 'anon'],
    queryFn: () => Promise.resolve(tree),
    staleTime: Infinity,
    enabled: !me.isLoading,
    initialData: tree,
  });
}

/**
 * STUB — backend no expone aún endpoint de badges. Cuando se
 * implementen contadores (incidentes pendientes, sugerencias del
 * motor de rules, etc.) este hook hará polling al backend.
 */
export function useMenuBadges(): UseQueryResult<Record<string, number>> {
  return useQuery<Record<string, number>>({
    queryKey: ['menu', 'badges'],
    queryFn: () => Promise.resolve<Record<string, number>>({}),
    staleTime: Infinity,
  });
}
