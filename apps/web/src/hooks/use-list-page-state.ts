'use client';

import { useCallback, useRef, useState } from 'react';

import { useAdvancedFilters } from '@/hooks/use-advanced-filters';
import { useListPreferencesStore } from '@/stores/list-preferences-store';

import type { SortingState } from '@tanstack/react-table';

/**
 * Opción de búsqueda debounceada — opt-in.
 * Cuando se omite, el hook no expone `search`/`debouncedSearch`.
 */
interface SearchOption {
  /** Ventana de debounce en ms antes de propagar a `debouncedSearch`. Default 400. */
  debounceMs?: number;
  /**
   * Largo mínimo (trimmeado) para que `debouncedSearch` reciba el valor. Input
   * vacío siempre propaga (limpia el filtro). Default 0 (sin gating).
   */
  minLength?: number;
  /** Valor inicial para `search` y `debouncedSearch`. Default "". */
  initialValue?: string;
  /**
   * Si `true`, al aplicar el valor debounceado también se hace `setPage(1)`.
   * Default `true` — una búsqueda nueva vuelve a la página 1.
   */
  resetPageOnChange?: boolean;
}

interface UseListPageStateOptions {
  /** Labels para los chips de filtro activos. */
  filterLabels: Record<string, string>;
  /** Valor inicial del toggle "mostrar inactivos". Default `false`. */
  defaultShowInactive?: boolean;
  /** Sort inicial. Default `[]` (el backend aplica su ORDER BY de fallback). */
  defaultSort?: SortingState;
  /** Scaffolding opt-in de búsqueda. */
  search?: SearchOption;
}

interface UseListPageStateBaseResult {
  /** Filas por página, leído del store de preferencias. */
  pageSize: number;

  // --- paginación + sort ------------------------------------------------
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  /** Id de la columna ordenada (undefined si no hay sort). */
  sortBy: string | undefined;
  /** `"asc"` / `"desc"` / `undefined` — derivado de `sorting[0]`. */
  sortOrder: 'asc' | 'desc' | undefined;

  // --- selección + show-all --------------------------------------------
  /** Opt-in: código de fila activa (solo si el layout no tiene panel dockable). */
  selectedCode: string | null;
  setSelectedCode: React.Dispatch<React.SetStateAction<string | null>>;
  showInactive: boolean;
  setShowInactive: React.Dispatch<React.SetStateAction<boolean>>;

  // --- filtros avanzados -----------------------------------------------
  filters: ReturnType<typeof useAdvancedFilters>['filters'];
  setFilter: ReturnType<typeof useAdvancedFilters>['setFilter'];
  removeFilter: ReturnType<typeof useAdvancedFilters>['removeFilter'];
  clearAll: ReturnType<typeof useAdvancedFilters>['clearAll'];
  isOpen: ReturnType<typeof useAdvancedFilters>['isOpen'];
  togglePanel: ReturnType<typeof useAdvancedFilters>['togglePanel'];
  activeFilters: ReturnType<typeof useAdvancedFilters>['activeFilters'];
  hasActiveFilters: ReturnType<typeof useAdvancedFilters>['hasActiveFilters'];
}

interface UseListPageStateSearchResult extends UseListPageStateBaseResult {
  /** Valor crudo del input. */
  search: string;
  /** Valor debounceado + gateado para query params. */
  debouncedSearch: string;
  /** onChange controlado — actualiza `search` y encola el debounce. */
  handleSearchChange: (value: string) => void;
}

type UseListPageStateResult = UseListPageStateBaseResult;

/**
 * Bundle canónico para páginas-lista:
 * - pageSize desde el store de preferencias
 * - page / sorting / showInactive / selectedCode locales
 * - filtros avanzados vía `useAdvancedFilters`
 * - sort derivado (`sortBy` / `sortOrder`) listo para la query
 * - búsqueda debounceada opcional (search + minLength + reset a página 1)
 *
 * Uso sin búsqueda:
 * ```ts
 * const { page, setPage, sorting, setSorting, sortBy, sortOrder, filters,
 *         setFilter, removeFilter, clearAll, isOpen, togglePanel,
 *         activeFilters, hasActiveFilters } = useListPageState({
 *   filterLabels: { folio: "Folio", direction: "Dirección" },
 * });
 * ```
 *
 * Uso con búsqueda:
 * ```ts
 * const { search, debouncedSearch, handleSearchChange, ... } = useListPageState({
 *   filterLabels: { rut: "RUT", razonSocial: "Razón social" },
 *   search: { minLength: 3 },
 * });
 * ```
 */
export function useListPageState(
  options: UseListPageStateOptions & { search: SearchOption },
): UseListPageStateSearchResult;
export function useListPageState(options: UseListPageStateOptions): UseListPageStateResult;
export function useListPageState(
  options: UseListPageStateOptions,
): UseListPageStateBaseResult | UseListPageStateSearchResult {
  const { filterLabels, defaultShowInactive = false, defaultSort, search: searchOption } = options;

  const pageSize = useListPreferencesStore((state) => state.pageSize);

  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(defaultShowInactive);

  // --- búsqueda (opt-in) ------------------------------------------------
  const searchInitial = searchOption?.initialValue ?? '';
  const [search, setSearch] = useState(searchInitial);
  const [debouncedSearch, setDebouncedSearch] = useState(searchInitial);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceMs = searchOption?.debounceMs ?? 400;
  const minLength = searchOption?.minLength ?? 0;
  const resetPageOnChange = searchOption?.resetPageOnChange ?? true;

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        const trimmed = value.trim();
        const next = trimmed.length === 0 || trimmed.length >= minLength ? trimmed : '';
        setDebouncedSearch(next);
        if (resetPageOnChange) {
          setPage(1);
        }
      }, debounceMs);
    },
    [debounceMs, minLength, resetPageOnChange],
  );

  const {
    filters,
    setFilter,
    removeFilter,
    clearAll,
    isOpen,
    togglePanel,
    activeFilters,
    hasActiveFilters,
  } = useAdvancedFilters({ filterLabels });

  const firstSort = sorting[0];
  const sortBy = firstSort?.id;
  const sortOrder: 'asc' | 'desc' | undefined = firstSort
    ? firstSort.desc
      ? 'desc'
      : 'asc'
    : undefined;

  const base: UseListPageStateBaseResult = {
    pageSize,
    page,
    setPage,
    sorting,
    setSorting,
    sortBy,
    sortOrder,
    selectedCode,
    setSelectedCode,
    showInactive,
    setShowInactive,
    filters,
    setFilter,
    removeFilter,
    clearAll,
    isOpen,
    togglePanel,
    activeFilters,
    hasActiveFilters,
  };

  if (searchOption === undefined) {
    return base;
  }

  const searchResult: UseListPageStateSearchResult = {
    ...base,
    search,
    debouncedSearch,
    handleSearchChange,
  };
  return searchResult;
}
