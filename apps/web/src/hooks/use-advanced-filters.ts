'use client';

import { useState, useCallback, useMemo } from 'react';

import type React from 'react';

export type FilterState = Record<string, string | string[]>;

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface UseFilterOptions {
  filterLabels: Record<string, string>;
}

export function useAdvancedFilters({ filterLabels }: UseFilterOptions): {
  filters: FilterState;
  setFilter: (key: string, value: string | string[]) => void;
  removeFilter: (key: string) => void;
  clearAll: () => void;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  togglePanel: () => void;
  activeFilters: ActiveFilter[];
  hasActiveFilters: boolean;
} {
  const [filters, setFilters] = useState<FilterState>({});
  const [isOpen, setIsOpen] = useState(false);

  const setFilter = useCallback((key: string, value: string | string[]) => {
    setFilters((prev) => {
      if (!value || (Array.isArray(value) && value.length === 0)) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const removeFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const activeFilters: ActiveFilter[] = useMemo(() => {
    return Object.entries(filters)
      .filter(([, value]) => {
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return !!value;
      })
      .map(([key, value]) => ({
        key,
        label: filterLabels[key] || key,
        value: Array.isArray(value) ? value.join(', ') : value,
      }));
  }, [filters, filterLabels]);

  const hasActiveFilters = activeFilters.length > 0;

  return {
    filters,
    setFilter,
    removeFilter,
    clearAll,
    isOpen,
    setIsOpen,
    togglePanel,
    activeFilters,
    hasActiveFilters,
  };
}
