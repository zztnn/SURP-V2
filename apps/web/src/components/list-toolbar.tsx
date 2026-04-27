'use client';

import * as React from 'react';

import { ActionBar } from '@/components/action-bar';
import { ActiveFiltersBar } from '@/components/active-filters-bar';
import { FiltersPanel } from '@/components/filters-panel';

import type { ActiveFilter } from '@/components/active-filters-bar';

const SEARCH_FILTER_KEY = '__search__';

interface ListToolbarProps {
  onNew?: () => void;
  newLabel?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /**
   * Names of the columns the search input filters by. Rendered as part of
   * the active-filter chip label, e.g. `Search (Product, Description): foo`.
   * When omitted, the chip simply says `Search: foo`.
   */
  searchFields?: string[];
  /**
   * Optional placeholder for the search input. Defaults to "Search...".
   */
  searchPlaceholder?: string;
  onRefresh: () => void;
  isRefreshing?: boolean | undefined;
  showFilters: boolean;
  onToggleFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterCount?: number | undefined;
  onClearFilters: () => void;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  filterContent?: React.ReactNode;
  className?: string;
}

function ListToolbar({
  onNew,
  newLabel,
  searchValue,
  onSearchChange,
  searchFields,
  searchPlaceholder,
  onRefresh,
  isRefreshing,
  showFilters,
  onToggleFilters,
  hasActiveFilters,
  activeFilterCount,
  onClearFilters,
  activeFilters,
  onRemoveFilter,
  filterContent,
  className,
}: ListToolbarProps): React.JSX.Element {
  const trimmedSearch = searchValue.trim();
  const hasSearchChip = trimmedSearch.length > 0;

  const searchChipLabel = React.useMemo(() => {
    if (searchFields && searchFields.length > 0) {
      return `Search (${searchFields.join(', ')})`;
    }
    return 'Search';
  }, [searchFields]);

  const mergedFilters = React.useMemo<ActiveFilter[]>(() => {
    if (!hasSearchChip) {
      return activeFilters;
    }
    return [
      {
        key: SEARCH_FILTER_KEY,
        label: searchChipLabel,
        value: searchValue,
      },
      ...activeFilters,
    ];
  }, [hasSearchChip, searchChipLabel, searchValue, activeFilters]);

  const totalFilterCount = (activeFilterCount ?? activeFilters.length) + (hasSearchChip ? 1 : 0);
  const hasAnyActive = hasActiveFilters || hasSearchChip;

  const handleRemoveFilter = React.useCallback(
    (key: string) => {
      if (key === SEARCH_FILTER_KEY) {
        onSearchChange('');
        return;
      }
      onRemoveFilter(key);
    },
    [onRemoveFilter, onSearchChange],
  );

  const handleClearAll = React.useCallback(() => {
    if (hasSearchChip) {
      onSearchChange('');
    }
    onClearFilters();
  }, [hasSearchChip, onSearchChange, onClearFilters]);

  return (
    <>
      <ActionBar
        {...(onNew !== undefined ? { onNew } : {})}
        {...(newLabel !== undefined ? { newLabel } : {})}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        {...(searchPlaceholder !== undefined ? { searchPlaceholder } : {})}
        onToggleFilters={onToggleFilters}
        showFilters={showFilters}
        activeFilterCount={totalFilterCount}
        hasActiveFilters={hasAnyActive}
        onClearFilters={handleClearAll}
        onRefresh={onRefresh}
        {...(isRefreshing !== undefined ? { isRefreshing } : {})}
        {...(className !== undefined ? { className } : {})}
      />
      <FiltersPanel open={showFilters}>{filterContent}</FiltersPanel>
      <ActiveFiltersBar
        filters={mergedFilters}
        onRemove={handleRemoveFilter}
        onClearAll={handleClearAll}
      />
    </>
  );
}

export { ListToolbar, SEARCH_FILTER_KEY };
export type { ListToolbarProps };
