'use client';

import { Search, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { useMountEffect } from '@/hooks/use-mount-effect';
import { useWindowKeyDown } from '@/hooks/use-window-keydown';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import type * as React from 'react';

export function SidebarSearch(): React.ReactElement {
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);
  const searchQuery = useSidebarStore((s) => s.searchQuery);
  const setSearchQuery = useSidebarStore((s) => s.setSearchQuery);
  const searchFocusIndex = useSidebarStore((s) => s.searchFocusIndex);
  const setSearchFocusIndex = useSidebarStore((s) => s.setSearchFocusIndex);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useMountEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac'));
    return undefined;
  });

  useWindowKeyDown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      const store = useSidebarStore.getState();
      if (!store.isExpanded && !store.isMobileOpen) {
        store.setExpanded(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 400);
      } else {
        inputRef.current?.focus();
      }
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!searchQuery) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchFocusIndex(searchFocusIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchFocusIndex(Math.max(-1, searchFocusIndex - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('sidebar-search-navigate'));
    }
  };

  return (
    <div
      className={cn(
        'shrink-0 transition-[padding,opacity,max-height] duration-500 overflow-hidden',
        isExpanded ? 'px-4 pt-4 max-h-20 opacity-100' : 'max-h-0 opacity-0 px-2 py-0',
      )}
    >
      <div
        className={cn(
          'flex items-center rounded-md transition-all duration-300',
          isExpanded
            ? 'h-9 gap-2 bg-white/6 px-3 text-sm text-sidebar-foreground focus-within:bg-white/10'
            : 'h-9 w-9 mx-auto justify-center text-sidebar-foreground/70 hover:bg-white/8 hover:text-sidebar-foreground cursor-pointer',
        )}
        onClick={() => {
          if (!isExpanded) {
            useSidebarStore.getState().setExpanded(true);
            setTimeout(() => {
              inputRef.current?.focus();
            }, 400);
          }
        }}
      >
        <Search className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          placeholder="Buscar en el menú..."
          className={cn(
            'min-w-0 flex-1 bg-transparent text-sidebar-foreground placeholder:text-sidebar-foreground/60 outline-none transition-[opacity,max-width] duration-300',
            isExpanded ? 'opacity-100 delay-150' : 'max-w-0 opacity-0 pointer-events-none',
          )}
        />
        {isExpanded && !searchQuery && !isFocused && (
          <div className="pointer-events-none ml-auto flex shrink-0 items-center gap-0.5">
            <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded border border-sidebar-foreground/20 bg-sidebar-foreground/10 px-1 text-[10px] font-medium leading-none text-sidebar-foreground/50">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded border border-sidebar-foreground/20 bg-sidebar-foreground/10 px-1 text-[10px] font-medium leading-none text-sidebar-foreground/50">
              M
            </kbd>
          </div>
        )}
        {isExpanded && searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              inputRef.current?.focus();
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/8 text-sidebar-foreground/60 transition-colors hover:bg-white/15 hover:text-sidebar-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
