'use client';

import { AArrowDown, AArrowUp } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStorageSync } from '@/hooks/use-storage-sync';
import { cn } from '@/lib/utils';

const ZOOM_LEVELS = [85, 90, 95, 100, 110, 120, 130] as const;
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 130;
const STORAGE_KEY = 'erp.ui-zoom';
const DEFAULT_ZOOM = 100;

function applyZoom(zoom: number): void {
  document.documentElement.style.fontSize = `${String(zoom)}%`;
}

export function ZoomControl(): React.ReactElement {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useStorageSync(STORAGE_KEY, (value) => {
    const v = Number(value);
    setZoom(v);
    applyZoom(v);
  });

  const handleZoom = useCallback((level: number) => {
    setZoom(level);
    localStorage.setItem(STORAGE_KEY, String(level));
    applyZoom(level);
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: String(level) }),
    );
  }, []);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      const idx = ZOOM_LEVELS.indexOf(zoom as (typeof ZOOM_LEVELS)[number]);
      const nextIdx =
        idx === -1
          ? ZOOM_LEVELS.indexOf(DEFAULT_ZOOM)
          : Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + direction));
      const next = ZOOM_LEVELS[nextIdx];
      if (next !== undefined) {
        handleZoom(next);
      }
    },
    [zoom, handleZoom],
  );

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-8"
        onClick={() => {
          handleStep(-1);
        }}
        disabled={zoom <= ZOOM_MIN}
        title="Reducir tamaño del texto"
      >
        <AArrowDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-10 w-10 px-0 text-xs tabular-nums text-muted-foreground"
            title="Tamaño del texto"
          >
            {zoom}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-[80px]">
          {ZOOM_LEVELS.map((level) => (
            <DropdownMenuItem
              key={level}
              className={cn(
                'justify-center tabular-nums',
                level === zoom && 'font-bold text-primary',
              )}
              onClick={() => {
                handleZoom(level);
              }}
            >
              {level}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-8"
        onClick={() => {
          handleStep(1);
        }}
        disabled={zoom >= ZOOM_MAX}
        title="Aumentar tamaño del texto"
      >
        <AArrowUp className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
